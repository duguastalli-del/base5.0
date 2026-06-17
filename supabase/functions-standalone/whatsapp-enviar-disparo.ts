/**
 * whatsapp-enviar-disparo — versão standalone para deploy via Dashboard
 * POST /functions/v1/whatsapp-enviar-disparo
 * Body:  { disparo_id: string }
 * Resp:  { ok: boolean, enviados: number, falhas: number, mensagem: string }
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
function resolverParam(campo: string, contato: { nome: string | null; cidade: string | null; bairro: string | null }): string {
  if ((campo ?? "").startsWith("texto:")) return campo.slice(6);
  switch (campo) {
    case "nome":             return contato.nome ?? "";
    case "primeiro_nome":    return (contato.nome ?? "").split(" ")[0];
    case "cidade":           return contato.cidade ?? "";
    case "bairro":           return contato.bairro ?? "";
    case "bairro_ou_cidade": return contato.bairro ?? contato.cidade ?? "";
    default:                 return "";
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Contato { id: string; nome: string | null; celular_e164: string; cidade: string | null; bairro: string | null; }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { disparo_id } = await req.json();
    if (!disparo_id) return json({ ok: false, mensagem: "disparo_id obrigatório" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: disparo } = await supabase.from("whatsapp_disparos").select("*, whatsapp_templates(*)").eq("id", disparo_id).single();
    if (!disparo) return json({ ok: false, mensagem: "Disparo não encontrado." });
    if (!["rascunho", "agendado", "pausado"].includes(disparo.status as string)) return json({ ok: false, mensagem: `Disparo não pode ser iniciado (status: ${disparo.status}).` });

    const tmpl = (disparo as Record<string, unknown>).whatsapp_templates as Record<string, unknown>;
    if (!tmpl) return json({ ok: false, mensagem: "Template do disparo não encontrado." });
    if (tmpl.status !== "aprovado") return json({ ok: false, mensagem: "Template precisa estar aprovado pela Meta antes do envio." });

    const { data: cfg } = await supabase.from("whatsapp_api_config").select("*").eq("workspace_id", disparo.workspace_id).maybeSingle();
    if (!cfg || !cfg.ativo) return json({ ok: false, mensagem: "API WhatsApp não está ativa neste workspace." });

    let apiKey: string;
    try { apiKey = await descriptografar(cfg.api_key_encrypted as string, disparo.workspace_id as string); }
    catch { return json({ ok: false, mensagem: "Falha ao descriptografar a API Key." }); }

    await supabase.from("whatsapp_disparos").update({ status: "enviando", iniciado_em: new Date().toISOString() }).eq("id", disparo_id);

    const filtros = (disparo.filtros_aplicados ?? {}) as Record<string, unknown>;
    const mapeamento = (filtros.parametros_mapeamento as string[]) ?? [];
    const rateLimitPorMinuto = (filtros.rate_limit_por_minuto as number) ?? 80;
    const delayMs = Math.ceil(60_000 / rateLimitPorMinuto);

    const { data: jaEnviados } = await supabase.from("whatsapp_mensagens").select("contact_id").eq("disparo_id", disparo_id);
    const idsJaEnviados = new Set((jaEnviados ?? []).map((r) => r.contact_id as string));
    const { data: optOutRows } = await supabase.from("whatsapp_opt_outs").select("contact_id").eq("workspace_id", disparo.workspace_id);
    const idsOptOut = new Set((optOutRows ?? []).map((r) => r.contact_id as string));

    let tagContactIds: string[] | null = null;
    if ((filtros.tags as string[] | undefined)?.length) {
      const { data: ctData } = await supabase.from("contact_tags").select("contact_id, tag_id").in("tag_id", filtros.tags as string[]);
      const contagens: Record<string, number> = {};
      for (const row of (ctData ?? [])) contagens[row.contact_id] = (contagens[row.contact_id] ?? 0) + 1;
      tagContactIds = Object.entries(contagens).filter(([, n]) => n >= (filtros.tags as string[]).length).map(([id]) => id);
      if (tagContactIds.length === 0) {
        await supabase.from("whatsapp_disparos").update({ status: "concluido", finalizado_em: new Date().toISOString() }).eq("id", disparo_id);
        return json({ ok: true, enviados: 0, falhas: 0, mensagem: "Nenhum contato corresponde aos filtros de tag." });
      }
    }

    let q = supabase.from("contacts").select("id, nome, celular_e164, cidade, bairro").eq("status", "ativo").eq("consent", "sim");
    if (filtros.cidade) q = q.eq("cidade", filtros.cidade);
    if (filtros.bairro) q = q.eq("bairro", filtros.bairro);
    if (filtros.origem) q = q.eq("origem", filtros.origem);
    if (tagContactIds !== null) q = q.in("id", tagContactIds);

    const { data: contatos } = await q.order("nome").limit(10_000);
    const listaContatos = ((contatos ?? []) as Contato[]).filter((c) => !idsJaEnviados.has(c.id) && !idsOptOut.has(c.id));
    await supabase.from("whatsapp_disparos").update({ total_destinatarios: idsJaEnviados.size + listaContatos.length }).eq("id", disparo_id);

    let enviados = 0, falhas = 0;
    for (const contato of listaContatos) {
      const parametrosValores = mapeamento.map((campo) => resolverParam(campo, contato));
      const componentes = parametrosValores.length > 0 ? [{ type: "body", parameters: parametrosValores.map((v) => ({ type: "text", text: v || " " })) }] : [];
      const msgPayload = { messaging_product: "whatsapp", to: (contato.celular_e164 ?? "").replace("+", ""), type: "template", template: { name: tmpl.meta_template_name, language: { code: tmpl.idioma ?? "pt_BR" }, components: componentes } };

      let metaMessageId: string | null = null, errCodigo: string | null = null, errMsg: string | null = null, tentativas = 0;
      while (tentativas < 3) {
        const res = await fetch(urlMensagens(cfg as WaConfig), { method: "POST", headers: apiHeaders(cfg.bsp as string, apiKey), body: JSON.stringify(msgPayload) });
        const resposta = await res.json();
        if (res.status === 429) { tentativas++; await sleep(2 ** tentativas * 1000); continue; }
        if (res.ok) { metaMessageId = resposta.messages?.[0]?.id ?? null; enviados++; }
        else { errCodigo = String(resposta?.error?.code ?? res.status); errMsg = resposta?.error?.message ?? `HTTP ${res.status}`; falhas++; }
        break;
      }

      await supabase.from("whatsapp_mensagens").insert({ disparo_id, contact_id: contato.id, workspace_id: disparo.workspace_id, meta_message_id: metaMessageId, status: metaMessageId ? "enviado" : "falha", parametros_aplicados: Object.fromEntries(mapeamento.map((campo, i) => [campo, parametrosValores[i] ?? ""])), enviado_em: metaMessageId ? new Date().toISOString() : null, erro_codigo: errCodigo, erro_mensagem: errMsg });
      await supabase.from("whatsapp_disparos").update({ enviados: enviados + idsJaEnviados.size, falhas }).eq("id", disparo_id);
      await sleep(delayMs);
    }

    await supabase.from("whatsapp_disparos").update({ status: "concluido", finalizado_em: new Date().toISOString(), enviados: enviados + idsJaEnviados.size, falhas }).eq("id", disparo_id);
    return json({ ok: true, enviados, falhas, mensagem: `Disparo concluído: ${enviados} enviados, ${falhas} falhas.` });
  } catch (err) {
    console.error("[whatsapp-enviar-disparo] exceção:", err);
    return json({ ok: false, mensagem: "Erro interno do servidor." }, 500);
  }
});
