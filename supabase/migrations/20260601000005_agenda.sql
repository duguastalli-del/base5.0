-- =============================================================================
-- MIGRATION 005 — Agenda (Calendar Events)
-- =============================================================================
-- Eventos de calendário do workspace. Usa Supabase Realtime para sincronizar
-- em tempo real entre dispositivos (canal: agenda-{workspace_id}).
-- google_event_id: preparado para integração futura com Google Calendar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABELA: events
-- Inferida de EventoModal.tsx (interface Evento) e Agenda.tsx.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  titulo            text NOT NULL,
  inicio            timestamptz NOT NULL,
  fim               timestamptz,
  local             text,
  cidade            text,
  descricao         text,
  responsavel       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  lembrete_minutos  integer DEFAULT 30,
  google_event_id   text,        -- TODO: confirmar se usado atualmente ou só preparado
  criado_por        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_fim_apos_inicio CHECK (fim IS NULL OR fim >= inicio)
);

CREATE INDEX IF NOT EXISTS events_workspace_inicio ON events (workspace_id, inicio);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Todos os membros vêem eventos do workspace
CREATE POLICY "events_select_workspace" ON events
  FOR SELECT
  USING (workspace_id = meu_workspace());

-- Todos podem criar eventos
CREATE POLICY "events_insert_workspace" ON events
  FOR INSERT
  WITH CHECK (workspace_id = meu_workspace());

-- Todos podem editar eventos do workspace
-- TODO: confirmar se há restrição (ex: só quem criou ou só admin/coord)
CREATE POLICY "events_update_workspace" ON events
  FOR UPDATE
  USING (workspace_id = meu_workspace());

-- Admin/coordenador ou criador podem excluir
-- TODO: confirmar regra exata no Dashboard
CREATE POLICY "events_delete_workspace" ON events
  FOR DELETE
  USING (workspace_id = meu_workspace());

-- -----------------------------------------------------------------------------
-- REALTIME
-- Habilita publicação de mudanças em events para o canal Postgres Changes.
-- Necessário para que Agenda.tsx receba atualizações em tempo real.
-- TODO: confirmar se o Realtime está ativo para esta tabela no Dashboard
--       (Project Settings > API > Realtime > Enabled tables).
-- -----------------------------------------------------------------------------
-- ALTER PUBLICATION supabase_realtime ADD TABLE events;
-- Descomente a linha acima se o Realtime não estiver habilitado via Dashboard.
