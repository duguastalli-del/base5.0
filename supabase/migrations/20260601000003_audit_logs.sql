-- =============================================================================
-- MIGRATION 003 — Audit Logs
-- =============================================================================
-- Trilha de auditoria imutável para todas as ações relevantes do sistema.
-- Inserções apenas via código da aplicação (SECURITY DEFINER helpers ou direto).
-- Registros nunca devem ser deletados ou editados.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABELA: audit_logs
-- acao: string livre, mas o app usa constantes conhecidas (listadas abaixo).
-- detalhes: jsonb livre — cada ação define seu próprio shape.
-- entidade_id: opcional — UUID da linha afetada (contact, template, etc.).
-- =============================================================================
-- Valores conhecidos de `acao` (inferidos do código — TODO: confirmar lista completa):
--   consulta_dashboard, exportar_dashboard_pdf,
--   exportar_contatos,
--   criar_contato, editar_contato, arquivar_contato, reativar_contato,
--   excluir_contato, anonimizar_contato,
--   criar_convite,
--   consulta_mapa_calor,
--   conectar_whatsapp_api,
--   criar_template_whatsapp, editar_template_whatsapp, submeter_template_whatsapp,
--   excluir_template_whatsapp,
--   criar_campanha_whatsapp
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  usuario_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  acao         text NOT NULL,
  entidade     text,
  entidade_id  uuid,
  detalhes     jsonb,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_workspace_criado ON audit_logs (workspace_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS audit_logs_workspace_acao   ON audit_logs (workspace_id, acao);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admin/coordenador lêem o log
CREATE POLICY "audit_logs_select_admin" ON audit_logs
  FOR SELECT
  USING (
    workspace_id = meu_workspace()
    AND meu_papel() IN ('administrador', 'coordenador')
  );

-- Qualquer membro autenticado do workspace pode inserir (o app insere diretamente)
CREATE POLICY "audit_logs_insert_workspace" ON audit_logs
  FOR INSERT
  WITH CHECK (workspace_id = meu_workspace());

-- Ninguém apaga ou edita logs (sem DELETE/UPDATE policies)
-- TODO: confirmar se há política de retenção/purge agendada no banco
