-- =============================================================================
-- MIGRATION 008 — WhatsApp API (Campanhas em Massa)
-- =============================================================================
-- Infraestrutura para disparos em massa via API WhatsApp Business (Etapa 11).
-- whatsapp_api_config:  configuração do BSP por workspace (1 linha por workspace).
-- whatsapp_templates:   templates Meta aprovados com parâmetros {{1}}, {{2}}, etc.
-- whatsapp_disparos:    campanhas/lotes com contadores de entrega em tempo real.
-- whatsapp_mensagens:   mensagens individuais — usado principalmente para rastrear
--                       respostas e opt-outs via webhook.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABELA: whatsapp_api_config
-- Uma linha por workspace. Chave primária = workspace_id (1:1).
-- api_key_encrypted: cifrada no cliente antes do envio (src/lib/cripto.ts).
-- webhook_verify_token: UUID gerado no cadastro, colado no painel do BSP.
-- TODO: confirmar colunas exatas no Supabase Dashboard.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_api_config (
  workspace_id          uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  bsp                   text NOT NULL DEFAULT '360dialog'
                          CHECK (bsp IN ('360dialog', 'twilio', 'zenvia')),
  api_key_encrypted     text,
  phone_number_id       text,
  business_account_id   text,
  numero_telefone       text,
  display_name          text CHECK (display_name IS NULL OR length(display_name) <= 25),
  webhook_verify_token  text NOT NULL DEFAULT gen_random_uuid()::text,
  ativo                 boolean NOT NULL DEFAULT false,
  ultima_verificacao_em timestamptz,
  status_verificacao    text,
  configurado_por       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  configurado_em        timestamptz
);

ALTER TABLE whatsapp_api_config ENABLE ROW LEVEL SECURITY;

-- Apenas admin vê a configuração de API
CREATE POLICY "wa_config_select_admin" ON whatsapp_api_config
  FOR SELECT
  USING (
    workspace_id = meu_workspace()
    AND meu_papel() = 'administrador'
  );

-- Apenas admin cria/edita a configuração
CREATE POLICY "wa_config_upsert_admin" ON whatsapp_api_config
  FOR INSERT
  WITH CHECK (
    workspace_id = meu_workspace()
    AND meu_papel() = 'administrador'
  );

CREATE POLICY "wa_config_update_admin" ON whatsapp_api_config
  FOR UPDATE
  USING (
    workspace_id = meu_workspace()
    AND meu_papel() = 'administrador'
  );

-- -----------------------------------------------------------------------------
-- TABELA: whatsapp_templates
-- Templates aprovados pela Meta. status evolui: rascunho → submetido → aprovado.
-- parametros: array de nomes dos parâmetros (ex: ['primeiro_nome', 'cidade']).
-- botoes: jsonb array com type, text, url?, phone_number? (interface Botao no TS).
-- cabecalho_tipo: 'texto' | 'imagem' (ou null se sem cabeçalho).
-- cabecalho_conteudo: texto do cabeçalho ou URL pública no bucket campaign-media.
-- TODO: confirmar CHECK de rodape (60 chars inferido do TS, não confirmado no banco).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome                text NOT NULL,
  meta_template_name  text NOT NULL,
  categoria           text NOT NULL
                        CHECK (categoria IN ('marketing', 'utility', 'authentication')),
  idioma              text NOT NULL DEFAULT 'pt_BR',
  status              text NOT NULL DEFAULT 'rascunho'
                        CHECK (status IN ('rascunho', 'submetido', 'aprovado', 'rejeitado', 'pausado', 'desativado')),
  corpo               text NOT NULL,
  parametros          text[] NOT NULL DEFAULT '{}',
  cabecalho_tipo      text CHECK (cabecalho_tipo IN ('texto', 'imagem')),
  cabecalho_conteudo  text,
  rodape              text,            -- TODO: confirmar se o banco tem CHECK length <= 60
  botoes              jsonb NOT NULL DEFAULT '[]',
  meta_template_id    text,            -- ID interno da Meta (retornado ao submeter)
  motivo_rejeicao     text,
  criado_por          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_templates_select_workspace" ON whatsapp_templates
  FOR SELECT
  USING (workspace_id = meu_workspace());

CREATE POLICY "wa_templates_write_admin" ON whatsapp_templates
  FOR INSERT
  WITH CHECK (
    workspace_id = meu_workspace()
    AND meu_papel() IN ('administrador', 'coordenador')
  );

CREATE POLICY "wa_templates_update_admin" ON whatsapp_templates
  FOR UPDATE
  USING (
    workspace_id = meu_workspace()
    AND meu_papel() IN ('administrador', 'coordenador')
  );

CREATE POLICY "wa_templates_delete_admin" ON whatsapp_templates
  FOR DELETE
  USING (
    workspace_id = meu_workspace()
    AND meu_papel() IN ('administrador', 'coordenador')
  );

-- -----------------------------------------------------------------------------
-- TABELA: whatsapp_disparos
-- Representa uma campanha de disparo em massa. Criada via wizard em
-- WhatsAppCampanhas.tsx com status = 'rascunho', depois iniciada pela Edge Function.
-- filtros_aplicados: jsonb com { cidade, bairro, origem, tags, parametros_mapeamento,
--                                rate_limit_por_minuto } — shape definido no wizard.
-- Contadores (enviados, entregues, etc.) incrementados atomicamente pela RPC
-- incrementar_disparo_contador() chamada pelas Edge Functions.
-- TODO: confirmar criado_por vs sem campo (inferido — não visto no .insert() do TS).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_disparos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  template_id         uuid REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  nome                text NOT NULL,
  status              text NOT NULL DEFAULT 'rascunho'
                        CHECK (status IN ('rascunho', 'agendado', 'enviando', 'concluido', 'pausado', 'falha')),
  filtros_aplicados   jsonb NOT NULL DEFAULT '{}',
  total_destinatarios integer NOT NULL DEFAULT 0,
  enviados            integer NOT NULL DEFAULT 0,
  entregues           integer,
  lidos               integer,
  respondidos         integer NOT NULL DEFAULT 0,
  opt_outs            integer NOT NULL DEFAULT 0,
  falhas              integer NOT NULL DEFAULT 0,
  criado_por          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  iniciado_em         timestamptz,
  finalizado_em       timestamptz
);

CREATE INDEX IF NOT EXISTS wa_disparos_workspace_criado ON whatsapp_disparos (workspace_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS wa_disparos_status           ON whatsapp_disparos (workspace_id, status);

ALTER TABLE whatsapp_disparos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_disparos_select_workspace" ON whatsapp_disparos
  FOR SELECT
  USING (workspace_id = meu_workspace());

CREATE POLICY "wa_disparos_insert_admin" ON whatsapp_disparos
  FOR INSERT
  WITH CHECK (
    workspace_id = meu_workspace()
    AND meu_papel() IN ('administrador', 'coordenador')
  );

CREATE POLICY "wa_disparos_update_admin" ON whatsapp_disparos
  FOR UPDATE
  USING (
    workspace_id = meu_workspace()
    AND meu_papel() IN ('administrador', 'coordenador')
  );

-- -----------------------------------------------------------------------------
-- TABELA: whatsapp_mensagens
-- Uma linha por mensagem individual enviada via API WhatsApp.
-- Populada pelas Edge Functions ao enviar + atualizada pelo webhook ao receber
-- confirmações (entregue, lido) e respostas.
-- Usada por WhatsAppRespostas.tsx para listar respostas/opt-outs.
-- TODO: confirmar todos os valores de status possíveis no banco.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  disparo_id     uuid REFERENCES whatsapp_disparos(id) ON DELETE SET NULL,
  contact_id     uuid REFERENCES contacts(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'enviado'
                   CHECK (status IN ('enviado', 'entregue', 'lido', 'respondido', 'opt_out', 'falha')),
  resposta_texto text,
  respondido_em  timestamptz,
  criado_em      timestamptz NOT NULL DEFAULT now()
  -- TODO: confirmar se há numero_destino, wamid (Meta message ID), ou outros campos
);

CREATE INDEX IF NOT EXISTS wa_mensagens_workspace_criado  ON whatsapp_mensagens (workspace_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS wa_mensagens_workspace_status  ON whatsapp_mensagens (workspace_id, status);
CREATE INDEX IF NOT EXISTS wa_mensagens_disparo           ON whatsapp_mensagens (disparo_id);

ALTER TABLE whatsapp_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_mensagens_select_workspace" ON whatsapp_mensagens
  FOR SELECT
  USING (workspace_id = meu_workspace());

-- Edge Functions inserem e atualizam via service_role (bypass RLS)
-- Membro autenticado pode inserir via disparo manual futuro
-- TODO: confirmar se Edge Functions usam service_role ou anon+SECURITY DEFINER
CREATE POLICY "wa_mensagens_insert_workspace" ON whatsapp_mensagens
  FOR INSERT
  WITH CHECK (workspace_id = meu_workspace());

CREATE POLICY "wa_mensagens_update_workspace" ON whatsapp_mensagens
  FOR UPDATE
  USING (workspace_id = meu_workspace());
