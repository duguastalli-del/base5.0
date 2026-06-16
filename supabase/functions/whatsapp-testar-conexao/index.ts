/**
 * whatsapp-testar-conexao
 * POST /functions/v1/whatsapp-testar-conexao
 *
 * Body:  { workspace_id: string }
 * Resp:  { ok: boolean, display_name?: string, qualidade?: string, mensagem: string }
 *
 * Descriptografa a API Key client-side, faz GET no endpoint de verificação
 * do BSP, atualiza ultima_verificacao_em e status_verificacao na config.
 *
 * Erros Meta mais comuns:
 *   190 — token inválido/expirado
 *   100 — phone_number_id inválido
 *   80007 — rate limit atingido
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { descriptografar } from "../_shared/cripto.ts";
import { apiHeaders, urlVerificar } from "../_shared/wa-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { workspace_id } = await req.json();
    if (!workspace_id) return json({ ok: false, mensagem: "workspace_id obrigatório" }, 400);

    console.log("[whatsapp-testar-conexao] workspace:", workspace_id);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await supabase
      .from("whatsapp_api_config")
      .select("*")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    if (!cfg) return json({ ok: false, mensagem: "Configuração não encontrada para este workspace." });

    if (!cfg.api_key_encrypted) {
      return json({ ok: false, mensagem: "API Key não configurada." });
    }

    let apiKey: string;
    try {
      apiKey = await descriptografar(cfg.api_key_encrypted as string, workspace_id as string);
    } catch {
      return json({ ok: false, mensagem: "Falha ao descriptografar a API Key." });
    }

    const url = urlVerificar(cfg);
    const res = await fetch(url, {
      method: "GET",
      headers: apiHeaders(cfg.bsp as string, apiKey),
    });

    const resposta = await res.json();
    const agora = new Date().toISOString();

    if (!res.ok) {
      const errMsg = resposta?.error?.message ?? `HTTP ${res.status}`;
      console.error("[whatsapp-testar-conexao] erro BSP:", errMsg);
      await supabase
        .from("whatsapp_api_config")
        .update({ ultima_verificacao_em: agora, status_verificacao: `erro_${res.status}` })
        .eq("workspace_id", workspace_id);
      return json({ ok: false, mensagem: `Erro da API: ${errMsg}` });
    }

    const displayName =
      resposta.verified_name ?? resposta.name ?? cfg.display_name ?? "–";
    const qualidade = resposta.quality_rating ?? "UNKNOWN";

    await supabase
      .from("whatsapp_api_config")
      .update({
        ultima_verificacao_em: agora,
        status_verificacao: "ok",
        display_name: displayName,
      })
      .eq("workspace_id", workspace_id);

    console.log("[whatsapp-testar-conexao] ok. qualidade:", qualidade);
    return json({ ok: true, display_name: displayName, qualidade, mensagem: `Conectado. Qualidade: ${qualidade}.` });
  } catch (err) {
    console.error("[whatsapp-testar-conexao] exceção:", err);
    return json({ ok: false, mensagem: "Erro interno do servidor." }, 500);
  }
});
