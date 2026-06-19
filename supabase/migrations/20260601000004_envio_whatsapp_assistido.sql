-- =============================================================================
-- MIGRATION 004 — Envio WhatsApp Assistido (manual)
-- =============================================================================
-- message_templates: templates reutilizáveis para envio manual via Envio.tsx.
-- send_logs:         log de cada disparo manual (um registro por contato enviado).
-- imports:           histórico de importações em lote (ModalImportar.tsx).
--
-- Diferente das campanhas em massa (Etapa 11 / whatsapp_disparos), estes
-- recursos são para envio assistido — membro seleciona contato e envia 1 a 1.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABELA: message_templates
-- Templates com suporte a mídia (imagem/vídeo).
-- media_url: URL pública no bucket campaign-media.
-- Marcadores de personalização: {nome} e {regiao} (substituídos no app).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  texto        text NOT NULL,
  tipo         text NOT NULL DEFAULT 'normal'
                 CHECK (tipo IN ('normal', 'optin')),
  media_url    text,
  media_type   text CHECK (media_type IN ('image', 'video')),
  criado_por   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em    timestamptz NOT NULL DEFAULT now()
  -- TODO: confirmar se há campo atualizado_em ou updated_at
);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Todos os membros vêem templates do workspace
CREATE POLICY "message_templates_select" ON message_templates
  FOR SELECT
  USING (workspace_id = meu_workspace());

-- Admin/coordenador criam e editam templates
CREATE POLICY "message_templates_insert_admin" ON message_templates
  FOR INSERT
  WITH CHECK (
    workspace_id = meu_workspace()
    AND meu_papel() IN ('administrador', 'coordenador')
  );

CREATE POLICY "message_templates_update_admin" ON message_templates
  FOR UPDATE
  USING (
    workspace_id = meu_workspace()
    AND meu_papel() IN ('administrador', 'coordenador')
  );

CREATE POLICY "message_templates_delete_admin" ON message_templates
  FOR DELETE
  USING (
    workspace_id = meu_workspace()
    AND meu_papel() IN ('administrador', 'coordenador')
  );

-- -----------------------------------------------------------------------------
-- TABELA: send_logs
-- Registro de cada mensagem enviada manualmente via Envio.tsx.
-- modo: 'normal' (consentimento ok), 'optin' (aguardando), 'lista' (EnvioLista).
-- Um registro por (contato × envio).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS send_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES contacts(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES message_templates(id) ON DELETE SET NULL,
  modo            text CHECK (modo IN ('normal', 'optin', 'lista')),
  enviado_por     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  mensagem_texto  text,
  criado_em       timestamptz NOT NULL DEFAULT now()
  -- TODO: confirmar se há campo status, respondeu, resposta_texto nesta tabela
  -- (o explorador de código encontrou esses campos em uma versão mais antiga;
  --  verificar no Dashboard se send_logs tem colunas extras)
);

CREATE INDEX IF NOT EXISTS send_logs_workspace_criado  ON send_logs (workspace_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS send_logs_workspace_contact ON send_logs (workspace_id, contact_id);

ALTER TABLE send_logs ENABLE ROW LEVEL SECURITY;

-- Membros vêem logs do workspace
CREATE POLICY "send_logs_select_workspace" ON send_logs
  FOR SELECT
  USING (workspace_id = meu_workspace());

-- Qualquer membro pode inserir (ao enviar manualmente)
CREATE POLICY "send_logs_insert_workspace" ON send_logs
  FOR INSERT
  WITH CHECK (workspace_id = meu_workspace());

-- -----------------------------------------------------------------------------
-- TABELA: imports
-- Histórico de importações em lote (agenda de contatos, Google, planilha).
-- Campos fonte e executado_por inferidos de ModalImportar.tsx linha ~206.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  fonte            text NOT NULL CHECK (fonte IN ('telefone', 'google', 'xlsx')),
  qtd_importados   integer NOT NULL DEFAULT 0,
  qtd_duplicados   integer NOT NULL DEFAULT 0,
  executado_por    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imports_select_admin" ON imports
  FOR SELECT
  USING (
    workspace_id = meu_workspace()
    AND meu_papel() IN ('administrador', 'coordenador')
  );

CREATE POLICY "imports_insert_workspace" ON imports
  FOR INSERT
  WITH CHECK (workspace_id = meu_workspace());
