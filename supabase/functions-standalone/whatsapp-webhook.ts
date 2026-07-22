/**
 * whatsapp-webhook — versão standalone para deploy via Dashboard
 * ATENÇÃO: marcar "Disable JWT verification" ao criar no Dashboard
 *
 * GET  /functions/v1/whatsapp-webhook  → handshake Meta (hub.challenge)
 * POST /functions/v1/whatsapp-webhook  → eventos de status e mensagens
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── _shared/cripto.ts ─────────────────────────────────────────────────────────
const ITERACOES = 100_000;
async function derivarChave(workspaceId: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(workspaceId), { name: "PBKDF2" }, false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode("base50-wa-" + workspaceId), iterations: ITERACOES, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}
async function descriptografar(base64: string, workspaceId: string): Promise<string> {
  const chave = await derivarChave(workspaceId);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, chave, bytes.slice(12));
  return new TextDecoder().decode(decrypted);
}

// ── _shared/wa-client.ts ──────────────────────────────────────────────────────
interface WaConfig { bsp: string; phone_number_id: string | null; business_account_id: string | null; numero_telefone: string | null; }
function apiHeaders(bsp: string, apiKey: string): Record<string, string> {
  return bsp === "360dialog"
    ? { "D360-API-KEY": apiKey, "Content-Type": "application/json" }
    : { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" };
}
function urlMensagens(cfg: WaConfig): string {
  return cfg.bsp === "360dialog"
    ? "https://waba.360dialog.io/v1/messages"
    : `https://graph.facebook.com/v17.0/${cfg.phone_number_id}/messages`;
}

// ── Handler ───────────────────────────────────────────────────────────────────
const MSG_OPT_OUT = "Você foi removido da nossa lista de envios. Não receberá mais mensagens desta campanha.";
const PALAVRAS_OPT_OUT = ["PARAR", "SAIR", "STOP", "CANCELAR", "REMOVER", "DESCADASTRAR"];
const PALAVRAS_OPT_IN = ["SIM", "OK", "CONFIRMO"];

function normalizar(texto: string): string {
  return texto.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
const respOk = () => new Response("ok", { status: 200 });

serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !token || !challenge) return new Response("Parâmetros inválidos", { status: 400 });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await supabase.from("whatsapp_api_config").select("workspace_id").eq("webhook_verify_token", token).maybeSingle();
    if (!data) return new Response("Token inválido", { status: 403 });
    return new Response(challenge, { status: 200 });
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return respOk(); }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    try {
      const entries = (body.entry as unknown[]) ?? [];
      for (const entry of entries) {
        const changes = ((entry as Record<string, unknown>).changes as unknown[]) ?? [];
        for (const change of changes) {
          const value = (change as Record<string, unknown>).value as Record<string, unknown>;
          if (!value) continue;

          const phoneNumberId = (value.metadata as Record<string, unknown>)?.phone_number_id as string | undefined;
          let workspaceId: string | null = null, workspaceCfg: Record<string, unknown> | null = null;
          if (phoneNumberId) {
            const { data: cfgRow } = await supabase.from("whatsapp_api_config").select("workspace_id, bsp, phone_number_id, api_key_encrypted, numero_telefone").eq("phone_number_id", phoneNumberId).maybeSingle();
            if (cfgRow) { workspaceId = cfgRow.workspace_id as string; workspaceCfg = cfgRow; }
          }

          // Statuses
          const statuses = (value.statuses as unknown[]) ?? [];
          for (const st of statuses) {
            const s = st as Record<string, unknown>;
            const wamid = s.id as string, status = s.status as string;
            if (!wamid || !status || status === "sent") continue;
            const campos: Record<string, unknown> = {};
            if (status === "delivered") { campos.status = "entregue"; campos.entregue_em = new Date().toISOString(); }
            else if (status === "read") { campos.status = "lido"; campos.lido_em = new Date().toISOString(); }
            else if (status === "failed") {
              campos.status = "falha";
              const errs = (s.errors as unknown[]) ?? [];
              if (errs.length > 0) { const e = errs[0] as Record<string, unknown>; campos.erro_codigo = String(e.code ?? ""); campos.erro_mensagem = String(e.message ?? e.title ?? ""); }
            }
            if (Object.keys(campos).length > 0) {
              await supabase.from("whatsapp_mensagens").update(campos).eq("meta_message_id", wamid);
              if (status === "delivered") {
                const { data: msgRow } = await supabase.from("whatsapp_mensagens").select("disparo_id").eq("meta_message_id", wamid).maybeSingle();
                if (msgRow?.disparo_id) await supabase.rpc("incrementar_disparo_contador", { p_disparo_id: msgRow.disparo_id, p_campo: "entregues" }).catch(() => {});
              }
            }
          }

          // Mensagens recebidas
          const messages = (value.messages as unknown[]) ?? [];
          for (const msg of messages) {
            const m = msg as Record<string, unknown>;
            if (m.type !== "text") continue;
            const waId = m.from as string;
            const textoResposta = ((m.text as Record<string, unknown>)?.body as string) ?? "";
            const textoNorm = normalizar(textoResposta);
            const phone = `+${waId}`;
            if (!workspaceId) continue;

            const { data: contato } = await supabase.from("contacts").select("id, consent").eq("celular_e164", phone).maybeSingle();
            if (!contato) continue;

            const { data: mensagem } = await supabase.from("whatsapp_mensagens").select("id, disparo_id").eq("contact_id", contato.id).eq("workspace_id", workspaceId).order("enviado_em", { ascending: false }).limit(1).maybeSingle();

            if (PALAVRAS_OPT_OUT.includes(textoNorm)) {
              await supabase.from("contacts").update({ consent: "recusou" }).eq("id", contato.id);
              await supabase.from("whatsapp_opt_outs").upsert({ workspace_id: workspaceId, contact_id: contato.id, motivo: "respondeu_parar", detalhes: textoResposta }, { onConflict: "workspace_id,contact_id" });
              if (mensagem?.id) await supabase.from("whatsapp_mensagens").update({ status: "opt_out", respondido_em: new Date().toISOString(), resposta_texto: textoResposta }).eq("id", mensagem.id);
              if (mensagem?.disparo_id) {
                const { data: d } = await supabase.from("whatsapp_disparos").select("opt_outs").eq("id", mensagem.disparo_id).single();
                if (d) await supabase.from("whatsapp_disparos").update({ opt_outs: ((d.opt_outs as number) ?? 0) + 1 }).eq("id", mensagem.disparo_id);
              }
              if (workspaceCfg?.api_key_encrypted) {
                try {
                  const apiKey = await descriptografar(workspaceCfg.api_key_encrypted as string, workspaceId);
                  await fetch(urlMensagens(workspaceCfg as unknown as WaConfig), { method: "POST", headers: apiHeaders(workspaceCfg.bsp as string, apiKey), body: JSON.stringify({ messaging_product: "whatsapp", to: waId, type: "text", text: { body: MSG_OPT_OUT } }) });
                } catch (e) { console.error("[webhook] falha ao enviar confirmação opt-out:", e); }
              }
              continue;
            }

            if (PALAVRAS_OPT_IN.includes(textoNorm) && contato.consent === "pendente") {
              await supabase.from("contacts").update({ consent: "sim" }).eq("id", contato.id);
              continue;
            }

            if (mensagem?.id) await supabase.from("whatsapp_mensagens").update({ status: "respondido", resposta_texto: textoResposta, respondido_em: new Date().toISOString() }).eq("id", mensagem.id);
            if (mensagem?.disparo_id) {
              const { data: d } = await supabase.from("whatsapp_disparos").select("respondidos").eq("id", mensagem.disparo_id).single();
              if (d) await supabase.from("whatsapp_disparos").update({ respondidos: ((d.respondidos as number) ?? 0) + 1 }).eq("id", mensagem.disparo_id);
            }
          }
        }
      }
    } catch (err) { console.error("[webhook] erro:", err); }
    return respOk();
  }

  return new Response("Method not allowed", { status: 405 });
});
