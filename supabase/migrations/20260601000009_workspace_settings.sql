-- Migration 000009 — workspace_settings
-- Tabela de configurações por workspace (vertical + vocabulário customizado)

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id  uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  vertical      text NOT NULL DEFAULT 'politica'
                  CHECK (vertical IN ('politica','religioso','imobiliario','varejo','pesquisa','publicidade','ong','outro')),
  vocabulario   jsonb NOT NULL DEFAULT '{}',
  nome_exibicao text,
  cor_primaria  text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_settings_select" ON workspace_settings
  FOR SELECT USING (
    workspace_id = (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "workspace_settings_insert" ON workspace_settings
  FOR INSERT WITH CHECK (
    workspace_id = (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
    AND (
      SELECT papel FROM profiles WHERE id = auth.uid()
    ) = 'administrador'
  );

CREATE POLICY "workspace_settings_update" ON workspace_settings
  FOR UPDATE USING (
    workspace_id = (
      SELECT workspace_id FROM profiles WHERE id = auth.uid()
    )
    AND (
      SELECT papel FROM profiles WHERE id = auth.uid()
    ) = 'administrador'
  );

-- Trigger: atualiza atualizado_em automaticamente
CREATE OR REPLACE FUNCTION update_workspace_settings_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workspace_settings_updated
  BEFORE UPDATE ON workspace_settings
  FOR EACH ROW EXECUTE FUNCTION update_workspace_settings_timestamp();

-- Retrocompatibilidade: garante que workspaces existentes (ex: Antoniassi 2026)
-- tenham settings com vertical='politica' sem precisar rodar onboarding.
-- Esta query é segura para rodar múltiplas vezes (INSERT ... ON CONFLICT DO NOTHING).
INSERT INTO workspace_settings (workspace_id, vertical)
SELECT id, 'politica'
FROM workspaces
WHERE id NOT IN (SELECT workspace_id FROM workspace_settings)
ON CONFLICT (workspace_id) DO NOTHING;
