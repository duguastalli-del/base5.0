-- =============================================================================
-- MIGRATION 002 — Contatos, Tags e Contact_Tags
-- =============================================================================
-- Núcleo do produto: cadastro de contatos multi-tenant com tags livres,
-- suporte a soft-delete (status) e anonimização LGPD.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABELA: contacts
-- Contatos humanos do workspace. celular_e164 é único por workspace.
-- status 'anonimizado': campos PII zerados pela RPC anonimizar_contato().
-- criado_por pode virar null se o membro for removido (ON DELETE SET NULL).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  celular_e164 text NOT NULL,
  cidade       text NOT NULL,
  bairro       text,
  origem       text,
  obs          text,
  consent      text NOT NULL DEFAULT 'pendente'
                 CHECK (consent IN ('sim', 'pendente', 'recusou')),
  status       text NOT NULL DEFAULT 'ativo'
                 CHECK (status IN ('ativo', 'arquivado', 'anonimizado')),
  criado_por   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, celular_e164)
);

CREATE INDEX IF NOT EXISTS contacts_workspace_status ON contacts (workspace_id, status);
CREATE INDEX IF NOT EXISTS contacts_workspace_cidade  ON contacts (workspace_id, cidade);
CREATE INDEX IF NOT EXISTS contacts_workspace_criado  ON contacts (workspace_id, criado_em DESC);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Qualquer membro do workspace vê os contatos ativos/arquivados do workspace
CREATE POLICY "contacts_select_workspace" ON contacts
  FOR SELECT
  USING (workspace_id = meu_workspace());

-- Qualquer membro autenticado pode inserir contatos no próprio workspace
CREATE POLICY "contacts_insert_workspace" ON contacts
  FOR INSERT
  WITH CHECK (workspace_id = meu_workspace());

-- Membro pode editar contatos do próprio workspace
-- (restrições mais finas — ex: voluntario só edita próprios — podem ser aplicadas no app)
CREATE POLICY "contacts_update_workspace" ON contacts
  FOR UPDATE
  USING (workspace_id = meu_workspace());

-- Apenas admin/coordenador apagam contatos (delete hard — excluir tela)
-- Implementação preferencial: usar status = 'arquivado' em vez de delete
CREATE POLICY "contacts_delete_admin" ON contacts
  FOR DELETE
  USING (
    workspace_id = meu_workspace()
    AND meu_papel() IN ('administrador', 'coordenador')
  );

-- -----------------------------------------------------------------------------
-- TABELA: tags
-- Tags livres do workspace. Nome único por workspace (case-sensitive no banco;
-- lookup case-insensitive feito no app em db.ts::salvarContactTags).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, nome)
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags_select_workspace" ON tags
  FOR SELECT
  USING (workspace_id = meu_workspace());

CREATE POLICY "tags_insert_workspace" ON tags
  FOR INSERT
  WITH CHECK (workspace_id = meu_workspace());

-- Admin/coordenador podem excluir tags
CREATE POLICY "tags_delete_admin" ON tags
  FOR DELETE
  USING (
    workspace_id = meu_workspace()
    AND meu_papel() IN ('administrador', 'coordenador')
  );

-- -----------------------------------------------------------------------------
-- TABELA: contact_tags
-- Relacionamento N:N entre contatos e tags.
-- Sem workspace_id próprio: o RLS é herdado via contact_id.
-- O app usa upsert com ignoreDuplicates: true.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id   uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id       uuid NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  PRIMARY KEY  (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS contact_tags_tag_id ON contact_tags (tag_id);

ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;

-- Acesso via join ao contato (workspace já validado no contato)
CREATE POLICY "contact_tags_select" ON contact_tags
  FOR SELECT
  USING (
    contact_id IN (SELECT id FROM contacts WHERE workspace_id = meu_workspace())
  );

CREATE POLICY "contact_tags_insert" ON contact_tags
  FOR INSERT
  WITH CHECK (
    contact_id IN (SELECT id FROM contacts WHERE workspace_id = meu_workspace())
  );

CREATE POLICY "contact_tags_delete" ON contact_tags
  FOR DELETE
  USING (
    contact_id IN (SELECT id FROM contacts WHERE workspace_id = meu_workspace())
  );

-- -----------------------------------------------------------------------------
-- RPC: anonimizar_contato(p_contact_id)
-- Chamada por admin/coordenador na tela DetalheContato.tsx para cumprir LGPD.
-- Apaga PII, preserva contagem/histórico (linha permanece com status 'anonimizado').
-- TODO: confirmar campos exatos zerados no Supabase Dashboard.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION anonimizar_contato(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Valida que o contato pertence ao workspace do chamador
  IF NOT EXISTS (
    SELECT 1 FROM contacts
    WHERE id = p_contact_id AND workspace_id = meu_workspace()
  ) THEN
    RAISE EXCEPTION 'Contato não encontrado ou sem permissão.';
  END IF;

  -- Apenas admin/coordenador podem anonimizar
  IF meu_papel() NOT IN ('administrador', 'coordenador') THEN
    RAISE EXCEPTION 'Permissão insuficiente para anonimizar.';
  END IF;

  UPDATE contacts SET
    nome         = 'Anonimizado',
    celular_e164 = '+550000000000',    -- TODO: confirmar placeholder
    bairro       = NULL,
    origem       = NULL,
    obs          = NULL,
    status       = 'anonimizado',
    consent      = 'recusou'
  WHERE id = p_contact_id;

  -- Remove todas as tags do contato
  DELETE FROM contact_tags WHERE contact_id = p_contact_id;
END;
$$;
