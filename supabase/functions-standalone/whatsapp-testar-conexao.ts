/**
 * whatsapp-testar-conexao — versão standalone para deploy via Dashboard
 * POST /functions/v1/whatsapp-testar-conexao
 * Body:  { workspace_id: string }
 * Resp:  { ok: boolean, display_name?: string, qualidade?: string, mensagem: string }
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
function urlVerificar(cfg: WaConfig): string {
  return cfg.bsp === "360dialog"
    ? "https://waba.360dialog.io/v1/configs/webhook"
    : `https://graph.facebook.com/v17.0/${cfg.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`;
}

// ── Handler ───────────────────────────────────────────────────────────────────
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { workspace_id } = await req.json();
    if (!workspace_id) return json({ ok: false, mensagem: "workspace_id obrigatório" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfg } = await supabase.from("whatsapp_api_config").select("*").eq("workspace_id", workspace_id).maybeSingle();
    if (!cfg) return json({ ok: false, mensagem: "Configuração não encontrada para este workspace." });
    if (!cfg.api_key_encrypted) return json({ ok: false, mensagem: "API Key não configurada." });

    let apiKey: string;
    try { apiKey = await descriptografar(cfg.api_key_encrypted as string, workspace_id); }
    catch { return json({ ok: false, mensagem: "Falha ao descriptografar a API Key." }); }

    const res = await fetch(urlVerificar(cfg as WaConfig), { method: "GET", headers: apiHeaders(cfg.bsp as string, apiKey) });
    const resposta = await res.json();
    const agora = new Date().toISOString();

    if (!res.ok) {
      const errMsg = resposta?.error?.message ?? `HTTP ${res.status}`;
      await supabase.from("whatsapp_api_config").update({ ultima_verificacao_em: agora, status_verificacao: `erro_${res.status}` }).eq("workspace_id", workspace_id);
      return json({ ok: false, mensagem: `Erro da API: ${errMsg}` });
    }

    const displayName = resposta.verified_name ?? resposta.name ?? cfg.display_name ?? "–";
    const qualidade = resposta.quality_rating ?? "UNKNOWN";
    await supabase.from("whatsapp_api_config").update({ ultima_verificacao_em: agora, status_verificacao: "ok", display_name: displayName }).eq("workspace_id", workspace_id);
    return json({ ok: true, display_name: displayName, qualidade, mensagem: `Conectado. Qualidade: ${qualidade}.` });
  } catch (err) {
    console.error("[whatsapp-testar-conexao] exceção:", err);
    return json({ ok: false, mensagem: "Erro interno do servidor." }, 500);
  }
});
