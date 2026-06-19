-- =============================================================================
-- MIGRATION 006 — Views e RPCs do Dashboard
-- =============================================================================
-- Views e funções agregadas usadas pela tela Inicio.tsx (Dashboard).
-- Todas com SECURITY DEFINER para contornar o RLS nas views.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VIEW: v_ranking_cadastradores
-- Top cadastradores por volume de contatos ativos.
-- Usada em Inicio.tsx: supabase.from("v_ranking_cadastradores").select("*").limit(5)
-- Interface TypeScript: { cadastrador: string; qtd: number }
-- TODO: confirmar implementação exata no Supabase Dashboard.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ranking_cadastradores AS
SELECT
  p.nome  AS cadastrador,
  COUNT(c.id)::integer AS qtd
FROM contacts c
JOIN profiles p ON p.id = c.criado_por
WHERE c.workspace_id = meu_workspace()
  AND c.status IN ('ativo', 'arquivado')
GROUP BY p.nome
ORDER BY qtd DESC;

-- -----------------------------------------------------------------------------
-- VIEW: v_contatos_por_cidade
-- Contagem de contatos ativos agrupados por cidade no workspace atual.
-- TODO: confirmar se esta view existe no Dashboard ou se é calculada no app.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_contatos_por_cidade AS
SELECT
  cidade,
  COUNT(id)::integer AS qtd
FROM contacts
WHERE workspace_id = meu_workspace()
  AND status = 'ativo'
GROUP BY cidade
ORDER BY qtd DESC;

-- -----------------------------------------------------------------------------
-- RPC: painel_resumo()
-- Retorna um único registro com KPIs gerais do workspace.
-- Chamada em Inicio.tsx: supabase.rpc("painel_resumo")
-- Interface TypeScript: { total_contatos, novos_hoje, pct_consentimento, optin_pendentes }
-- TODO: confirmar implementação exata no Supabase Dashboard — corpo abaixo é inferido.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION painel_resumo()
RETURNS TABLE (
  total_contatos    bigint,
  novos_hoje        bigint,
  pct_consentimento numeric,
  optin_pendentes   bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status IN ('ativo', 'arquivado'))          AS total_contatos,
    COUNT(*) FILTER (WHERE criado_em >= CURRENT_DATE AND status = 'ativo') AS novos_hoje,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE consent = 'sim' AND status = 'ativo')
              / NULLIF(COUNT(*) FILTER (WHERE status = 'ativo'), 0),
      1
    )                                                                  AS pct_consentimento,
    COUNT(*) FILTER (WHERE consent = 'pendente' AND status = 'ativo') AS optin_pendentes
  FROM contacts
  WHERE workspace_id = meu_workspace();
$$;

-- -----------------------------------------------------------------------------
-- RPC: incrementar_disparo_contador(p_disparo_id, p_campo, p_delta)
-- Incrementa atomicamente contadores de whatsapp_disparos (enviados, entregues, etc.)
-- Chamada pelas Edge Functions de disparo (Etapa 11).
-- TODO: confirmar assinatura e campos permitidos no Supabase Dashboard.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION incrementar_disparo_contador(
  p_disparo_id uuid,
  p_campo      text,
  p_delta      integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Valida campo para evitar SQL injection via nome de coluna
  IF p_campo NOT IN ('enviados', 'entregues', 'lidos', 'respondidos', 'opt_outs', 'falhas') THEN
    RAISE EXCEPTION 'Campo inválido: %', p_campo;
  END IF;

  -- TODO: confirmar implementação exata no Dashboard (dynamic SQL ou CASE)
  EXECUTE format(
    'UPDATE whatsapp_disparos SET %I = %I + $1 WHERE id = $2',
    p_campo, p_campo
  ) USING p_delta, p_disparo_id;
END;
$$;
