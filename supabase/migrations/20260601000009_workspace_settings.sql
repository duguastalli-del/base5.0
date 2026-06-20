-- Migration: 20260601000009_workspace_settings
-- Tabela de configurações por workspace para suporte multi-vertical.

CREATE TABLE workspace_settings (
  workspace_id       uuid        PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  vertical           text        NOT NULL DEFAULT 'politica'
                                 CHECK (vertical IN ('politica', 'religioso', 'imobiliario', 'varejo', 'pesquisa', 'publicidade', 'ong', 'outro')),
  vocabulario        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  cor_primaria       text        DEFAULT '#0F4C5C',
  cor_secundaria     text        DEFAULT '#14b8a6',
  logo_secundario_url text,
  nome_exibicao      text,
  templates_iniciais_carregados boolean DEFAULT false,
  tags_iniciais_carregadas      boolean DEFAULT false,
  criado_em          timestamptz DEFAULT now(),
  atualizado_em      timestamptz DEFAULT now()
);

-- Trigger: atualiza atualizado_em automaticamente
CREATE OR REPLACE FUNCTION atualizar_workspace_settings_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_settings_atualizado_em
  BEFORE UPDATE ON workspace_settings
  FOR EACH ROW EXECUTE FUNCTION atualizar_workspace_settings_ts();

-- RLS
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro autenticado do mesmo workspace
CREATE POLICY "ws_settings_select" ON workspace_settings
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

-- INSERT: apenas administrador do workspace
CREATE POLICY "ws_settings_insert" ON workspace_settings
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM profiles
      WHERE id = auth.uid() AND papel = 'administrador'
    )
  );

-- UPDATE: apenas administrador do workspace
CREATE POLICY "ws_settings_update" ON workspace_settings
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM profiles
      WHERE id = auth.uid() AND papel = 'administrador'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM profiles
      WHERE id = auth.uid() AND papel = 'administrador'
    )
  );

-- DELETE: bloqueado — remoção ocorre apenas via CASCADE de workspaces
-- (sem política de DELETE = RLS bloqueia por padrão)

-- Retrocompatibilidade: popula workspace_settings para todos os workspaces
-- existentes que ainda não têm linha (ex: Antoniassi 2026).
-- vertical='politica' e vocabulario={} preservam o comportamento atual.
INSERT INTO workspace_settings (workspace_id, vertical, vocabulario)
SELECT id, 'politica', '{}'::jsonb
FROM workspaces
WHERE id NOT IN (SELECT workspace_id FROM workspace_settings);
