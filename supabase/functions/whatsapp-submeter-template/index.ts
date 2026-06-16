/**
 * whatsapp-submeter-template
 * POST /functions/v1/whatsapp-submeter-template
 *
 * Body:  { template_id: string }
 * Resp:  { ok: boolean, meta_template_id?: string, mensagem: string }
 *
 * Converte o template do banco para o formato da Meta Cloud API e envia
 * via BSP configurado. Atualiza status='submetido', meta_template_id e
 * submetido_em na tabela whatsapp_templates.
 *
 * Erros Meta mais comuns:
 *   100 — parâmetro inválido (ex: nome com espaço)
 *   132000 — template já existe com esse nome
 *   132001 — categoria inválida
 *   368 — conta bloqueada por qualidade
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { descriptografar } from "../_shared/cripto.ts";
import { apiHeaders, urlTemplates } from "../_shared/wa-client.ts";

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

/** Monta o array de components no formato Meta */
function montarComponents(tmpl: Record<string, unknown>): unknown[] {
  const components: unknown[] = [];
  const params = (tmpl.parametros as string[]) ?? [];

  // Cabeçalho
  if (tmpl.cabecalho_tipo && tmpl.cabecalho_conteudo) {
    if (tmpl.cabecalho_tipo === "texto") {
      components.push({ type: "HEADER", format: "TEXT", text: tmpl.cabecalho_conteudo });
    } else if (tmpl.cabecalho_tipo === "imagem") {
      components.push({
        type: "HEADER",
        format: "IMAGE",
        example: { header_url: [tmpl.cabecalho_conteudo] },
      });
    } else if (tmpl.cabecalho_tipo === "video") {
      components.push({
        type: "HEADER",
        format: "VIDEO",
        example: { header_url: [tmpl.cabecalho_conteudo] },
      });
    }
  }

  // Corpo
  const bodyComp: Record<string, unknown> = { type: "BODY", text: tmpl.corpo };
  if (params.length > 0) {
    bodyComp.example = {
      body_text: [params.map((_, i) => `Exemplo ${i + 1}`)],
    };
  }
  components.push(bodyComp);

  // Rodapé
  if (tmpl.rodape) {
    components.push({ type: "FOOTER", text: tmpl.rodape });
  }

  // Botões
  const botoes = (tmpl.botoes as unknown[]) ?? [];
  if (botoes.length > 0) {
    components.push({ type: "BUTTONS", buttons: botoes });
  }

  return components;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { template_id } = await req.json();
    if (!template_id) return json({ ok: false, mensagem: "template_id obrigatório" }, 400);

    console.log("[whatsapp-submeter-template] template:", template_id);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tmpl } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("id", template_id)
      .single();

    if (!tmpl) return json({ ok: false, mensagem: "Template não encontrado." });

    const { data: cfg } = await supabase
      .from("whatsapp_api_config")
      .select("*")
      .eq("workspace_id", tmpl.workspace_id)
      .maybeSingle();

    if (!cfg || !cfg.ativo) {
      return json({ ok: false, mensagem: "API WhatsApp não está ativa neste workspace." });
    }

    let apiKey: string;
    try {
      apiKey = await descriptografar(cfg.api_key_encrypted as string, tmpl.workspace_id as string);
    } catch {
      return json({ ok: false, mensagem: "Falha ao descriptografar a API Key." });
    }

    const categoria = (tmpl.categoria as string).toUpperCase();
    const payload =
      cfg.bsp === "360dialog"
        ? {
            name: tmpl.meta_template_name,
            languages: [tmpl.idioma],
            category: categoria,
            components: montarComponents(tmpl as Record<string, unknown>),
          }
        : {
            name: tmpl.meta_template_name,
            language: tmpl.idioma,
            category: categoria,
            components: montarComponents(tmpl as Record<string, unknown>),
          };

    const res = await fetch(urlTemplates(cfg), {
      method: "POST",
      headers: apiHeaders(cfg.bsp as string, apiKey),
      body: JSON.stringify(payload),
    });

    const resposta = await res.json();

    if (!res.ok) {
      const errMsg = resposta?.error?.message ?? `HTTP ${res.status}`;
      console.error("[whatsapp-submeter-template] erro BSP:", errMsg, resposta);
      await supabase
        .from("whatsapp_templates")
        .update({ status: "rejeitado", motivo_rejeicao: errMsg, rejeitado_em: new Date().toISOString() })
        .eq("id", template_id);
      return json({ ok: false, mensagem: `Erro da API: ${errMsg}` });
    }

    const metaId = resposta.id ?? resposta.template_id ?? null;
    await supabase
      .from("whatsapp_templates")
      .update({
        status: "submetido",
        meta_template_id: metaId,
        submetido_em: new Date().toISOString(),
        motivo_rejeicao: null,
      })
      .eq("id", template_id);

    console.log("[whatsapp-submeter-template] ok. meta_id:", metaId);
    return json({ ok: true, meta_template_id: metaId, mensagem: "Template submetido. Aguardando aprovação da Meta (geralmente 24–72h)." });
  } catch (err) {
    console.error("[whatsapp-submeter-template] exceção:", err);
    return json({ ok: false, mensagem: "Erro interno do servidor." }, 500);
  }
});
