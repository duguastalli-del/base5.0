/**
 * whatsapp-webhook  (público — sem JWT)
 * config.toml: verify_jwt = false
 *
 * GET  /functions/v1/whatsapp-webhook
 *   Query params: hub.mode, hub.verify_token, hub.challenge
 *   Valida verify_token contra whatsapp_api_config.webhook_verify_token
 *   e devolve hub.challenge para completar o handshake da Meta.
 *
 * POST /functions/v1/whatsapp-webhook
 *   Processa eventos enviados pela Meta:
 *
 *   statuses[].status='sent'      → ignora (já inserido no envio)
 *   statuses[].status='delivered' → whatsapp_mensagens.status='entregue'
 *   statuses[].status='read'      → whatsapp_mensagens.status='lido'
 *   statuses[].status='failed'    → whatsapp_mensagens.status='falha', grava erro
 *
 *   messages[].type='text' (resposta do destinatário):
 *     Localiza contato pelo número (wa_id → celular_e164 = '+{wa_id}')
 *     e workspace pelo phone_number_id do metadata.
 *
 *     PARAR/SAIR/STOP/CANCELAR/REMOVER/DESCADASTRAR
 *       → contacts.consent='recusou'
 *       → insere whatsapp_opt_outs
 *       → envia mensagem de confirmação de opt-out
 *       → atualiza whatsapp_mensagens.status='opt_out'
 *       → incrementa disparo.opt_outs
 *
 *     SIM/OK/CONFIRMO  (e contacts.consent='pendente')
 *       → contacts.consent='sim'
 *
 *     Qualquer outra
 *       → atualiza whatsapp_mensagens com resposta_texto e respondido_em
 *       → incrementa disparo.respondidos
 *
 * Erros Meta mais comuns:
 *   Sem resposta ao GET em 5s → Meta rejeita a verificação do webhook
 *   Signature inválida no POST → ignorar payload (não crashar)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { descriptografar } from "../_shared/cripto.ts";
import { apiHeaders, urlMensagens } from "../_shared/wa-client.ts";

const MSG_OPT_OUT =
  "Você foi removido da nossa lista de envios. Não receberá mais mensagens desta campanha.";

const PALAVRAS_OPT_OUT = [
  "PARAR", "SAIR", "STOP", "CANCELAR", "REMOVER", "DESCADASTRAR",
];
const PALAVRAS_OPT_IN = ["SIM", "OK", "CONFIRMO"];

function normalizar(texto: string): string {
  return texto
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function respOk() {
  return new Response("ok", { status: 200 });
}

serve(async (req) => {
  // ── GET: handshake de verificação Meta ─────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode !== "subscribe" || !token || !challenge) {
      return new Response("Parâmetros inválidos", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data } = await supabase
      .from("whatsapp_api_config")
      .select("workspace_id")
      .eq("webhook_verify_token", token)
      .maybeSingle();

    if (!data) {
      console.warn("[whatsapp-webhook] GET verify_token inválido:", token);
      return new Response("Token inválido", { status: 403 });
    }

    console.log("[whatsapp-webhook] GET verificação ok, workspace:", data.workspace_id);
    return new Response(challenge, { status: 200 });
  }

  // ── POST: eventos de status e mensagens recebidas ──────────────────────────
  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return respOk(); // não interromper a Meta com erro 4xx
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    try {
      const entries = (body.entry as unknown[]) ?? [];
      for (const entry of entries) {
        const changes = ((entry as Record<string, unknown>).changes as unknown[]) ?? [];
        for (const change of changes) {
          const value = (change as Record<string, unknown>).value as Record<string, unknown>;
          if (!value) continue;

          const phoneNumberId = (value.metadata as Record<string, unknown>)?.phone_number_id as string | undefined;

          // ── Resolve workspace pelo phone_number_id ────────────────────────
          let workspaceId: string | null = null;
          let workspaceCfg: Record<string, unknown> | null = null;
          if (phoneNumberId) {
            const { data: cfgRow } = await supabase
              .from("whatsapp_api_config")
              .select("workspace_id, bsp, phone_number_id, api_key_encrypted, numero_telefone")
              .eq("phone_number_id", phoneNumberId)
              .maybeSingle();
            if (cfgRow) {
              workspaceId = cfgRow.workspace_id as string;
              workspaceCfg = cfgRow;
            }
          }

          // ── Statuses (delivered / read / failed) ──────────────────────────
          const statuses = (value.statuses as unknown[]) ?? [];
          for (const st of statuses) {
            const s = st as Record<string, unknown>;
            const wamid = s.id as string;
            const status = s.status as string;
            if (!wamid || !status || status === "sent") continue;

            const campos: Record<string, unknown> = {};
            if (status === "delivered") {
              campos.status = "entregue";
              campos.entregue_em = new Date().toISOString();
            } else if (status === "read") {
              campos.status = "lido";
              campos.lido_em = new Date().toISOString();
            } else if (status === "failed") {
              campos.status = "falha";
              const errs = (s.errors as unknown[]) ?? [];
              if (errs.length > 0) {
                const e = errs[0] as Record<string, unknown>;
                campos.erro_codigo = String(e.code ?? "");
                campos.erro_mensagem = String(e.message ?? e.title ?? "");
              }
            }

            if (Object.keys(campos).length > 0) {
              await supabase
                .from("whatsapp_mensagens")
                .update(campos)
                .eq("meta_message_id", wamid);

              // Se entregue, incrementa disparo.entregues
              if (status === "delivered") {
                const { data: msgRow } = await supabase
                  .from("whatsapp_mensagens")
                  .select("disparo_id")
                  .eq("meta_message_id", wamid)
                  .maybeSingle();
                if (msgRow?.disparo_id) {
                  await supabase.rpc("incrementar_disparo_contador", {
                    p_disparo_id: msgRow.disparo_id,
                    p_campo: "entregues",
                  }).catch(() => {/* sem RPC ainda, não é crítico */});
                }
              }
              console.log(`[whatsapp-webhook] status ${status} wamid=${wamid}`);
            }
          }

          // ── Mensagens recebidas ───────────────────────────────────────────
          const messages = (value.messages as unknown[]) ?? [];
          for (const msg of messages) {
            const m = msg as Record<string, unknown>;
            if (m.type !== "text") continue;

            const waId = m.from as string;
            const textoResposta = ((m.text as Record<string, unknown>)?.body as string) ?? "";
            const textoNorm = normalizar(textoResposta);
            const phone = `+${waId}`;

            console.log(`[whatsapp-webhook] msg de ${phone}: "${textoNorm}"`);

            if (!workspaceId) {
              console.warn("[whatsapp-webhook] workspace não encontrado para phone_number_id:", phoneNumberId);
              continue;
            }

            // Localiza contato pelo celular
            const { data: contato } = await supabase
              .from("contacts")
              .select("id, consent")
              .eq("celular_e164", phone)
              .maybeSingle();

            if (!contato) {
              console.warn("[whatsapp-webhook] contato não encontrado:", phone);
              continue;
            }

            // Localiza mensagem mais recente deste contato neste workspace
            const { data: mensagem } = await supabase
              .from("whatsapp_mensagens")
              .select("id, disparo_id")
              .eq("contact_id", contato.id)
              .eq("workspace_id", workspaceId)
              .order("enviado_em", { ascending: false })
              .limit(1)
              .maybeSingle();

            // ── OPT-OUT ───────────────────────────────────────────────────
            if (PALAVRAS_OPT_OUT.includes(textoNorm)) {
              await supabase
                .from("contacts")
                .update({ consent: "recusou" })
                .eq("id", contato.id);

              await supabase
                .from("whatsapp_opt_outs")
                .upsert(
                  { workspace_id: workspaceId, contact_id: contato.id, motivo: "respondeu_parar", detalhes: textoResposta },
                  { onConflict: "workspace_id,contact_id" },
                );

              if (mensagem?.id) {
                await supabase
                  .from("whatsapp_mensagens")
                  .update({ status: "opt_out", respondido_em: new Date().toISOString(), resposta_texto: textoResposta })
                  .eq("id", mensagem.id);
              }

              if (mensagem?.disparo_id) {
                const { data: d } = await supabase
                  .from("whatsapp_disparos")
                  .select("opt_outs")
                  .eq("id", mensagem.disparo_id)
                  .single();
                if (d) {
                  await supabase
                    .from("whatsapp_disparos")
                    .update({ opt_outs: ((d.opt_outs as number) ?? 0) + 1 })
                    .eq("id", mensagem.disparo_id);
                }
              }

              // Envia confirmação de opt-out
              if (workspaceCfg?.api_key_encrypted) {
                try {
                  const apiKey = await descriptografar(
                    workspaceCfg.api_key_encrypted as string,
                    workspaceId,
                  );
                  await fetch(urlMensagens(workspaceCfg as unknown as { bsp: string; phone_number_id: string | null; business_account_id: string | null; numero_telefone: string | null }), {
                    method: "POST",
                    headers: apiHeaders(workspaceCfg.bsp as string, apiKey),
                    body: JSON.stringify({
                      messaging_product: "whatsapp",
                      to: waId,
                      type: "text",
                      text: { body: MSG_OPT_OUT },
                    }),
                  });
                } catch (e) {
                  console.error("[whatsapp-webhook] falha ao enviar confirmação opt-out:", e);
                }
              }

              console.log(`[whatsapp-webhook] opt-out registrado: ${phone}`);
              continue;
            }

            // ── OPT-IN ────────────────────────────────────────────────────
            if (PALAVRAS_OPT_IN.includes(textoNorm) && contato.consent === "pendente") {
              await supabase
                .from("contacts")
                .update({ consent: "sim" })
                .eq("id", contato.id);
              console.log(`[whatsapp-webhook] opt-in registrado: ${phone}`);
              continue;
            }

            // ── Resposta genérica ─────────────────────────────────────────
            if (mensagem?.id) {
              await supabase
                .from("whatsapp_mensagens")
                .update({
                  status: "respondido",
                  resposta_texto: textoResposta,
                  respondido_em: new Date().toISOString(),
                })
                .eq("id", mensagem.id);
            }

            if (mensagem?.disparo_id) {
              const { data: d } = await supabase
                .from("whatsapp_disparos")
                .select("respondidos")
                .eq("id", mensagem.disparo_id)
                .single();
              if (d) {
                await supabase
                  .from("whatsapp_disparos")
                  .update({ respondidos: ((d.respondidos as number) ?? 0) + 1 })
                  .eq("id", mensagem.disparo_id);
              }
            }

            console.log(`[whatsapp-webhook] resposta genérica de ${phone}`);
          }
        }
      }
    } catch (err) {
      console.error("[whatsapp-webhook] erro ao processar evento:", err);
      // Retornar 200 mesmo em erro para não causar retentativas da Meta
    }

    return respOk();
  }

  return new Response("Method not allowed", { status: 405 });
});
