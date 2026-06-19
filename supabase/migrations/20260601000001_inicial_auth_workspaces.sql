-- =============================================================================
-- MIGRATION 001 — Auth, Workspaces, Profiles e Convites
-- =============================================================================
-- Extraído via leitura de código (sem acesso direto ao Supabase Dashboard).
-- Campos inferidos dos TypeScript interfaces e das chamadas supabase.from().
-- TODO: confirmar no Supabase Dashboard onde marcado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- EXTENSÕES
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- TABELA: workspaces
-- Criado automaticamente pelo trigger handle_new_user() quando admin se registra.
-- nome vem do metadata workspace_nome do auth.signUp().
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         text NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now()
  -- TODO: confirmar se há mais colunas (plano, limite_contatos, etc.)
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Workspace visível apenas para seus membros
CREATE POLICY "workspace_select_own" ON workspaces
  FOR SELECT
  USING (id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- Apenas o trigger (SECURITY DEFINER) insere workspaces — usuário comum não insere
-- TODO: confirmar se há policy de INSERT ou se é tudo via SECURITY DEFINER

-- -----------------------------------------------------------------------------
-- TABELA: profiles
-- id = auth.users.id (criado via trigger handle_new_user).
-- papel: RBAC do sistema — 4 níveis.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  papel        text NOT NULL DEFAULT 'voluntario'
                 CHECK (papel IN ('administrador', 'coordenador', 'assessor', 'voluntario')),
  criado_em    timestamptz NOT NULL DEFAULT now()
  -- TODO: confirmar se há avatar_url, email espelhado ou outros campos
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas perfis do seu workspace
CREATE POLICY "profiles_select_own_workspace" ON profiles
  FOR SELECT
  USING (workspace_id = (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- Usuário só atualiza o próprio perfil
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING (id = auth.uid());

-- INSERT apenas via trigger (SECURITY DEFINER)
-- TODO: confirmar se há policy de INSERT separada

-- -----------------------------------------------------------------------------
-- FUNÇÃO AUXILIAR: meu_workspace()
-- Retorna o workspace_id do usuário autenticado. Usada em USING() das policies.
-- SECURITY DEFINER para evitar recursão no RLS de profiles.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION meu_workspace()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT workspace_id FROM profiles WHERE id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- FUNÇÃO AUXILIAR: meu_papel()
-- Retorna o papel do usuário autenticado. Usada em policies de escrita.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION meu_papel()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT papel FROM profiles WHERE id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- TABELA: invites
-- Criada/lida pelas RPCs criar_convite() e ver_convite().
-- Token gerado pelo servidor, enviado por link, válido por N dias.
-- TODO: confirmar estrutura exata — inferida do comportamento observado no código.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        text NOT NULL,
  papel        text NOT NULL CHECK (papel IN ('administrador', 'coordenador', 'assessor', 'voluntario')),
  token        text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  usado        boolean NOT NULL DEFAULT false,
  criado_por   uuid REFERENCES profiles(id),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  expira_em    timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days')
  -- TODO: confirmar prazo de expiração (7 dias é inferência)
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- Admin/coordenador do workspace vê convites do próprio workspace
CREATE POLICY "invites_select_admin" ON invites
  FOR SELECT
  USING (workspace_id = meu_workspace());

-- TODO: confirmar outras políticas de invites

-- -----------------------------------------------------------------------------
-- RPC: criar_convite(p_email, p_papel)
-- Chamada por admin para gerar link de convite. Retorna o token.
-- TODO: confirmar corpo exato da função no banco.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION criar_convite(p_email text, p_papel text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token text;
BEGIN
  -- TODO: confirmar no Supabase Dashboard — implementação inferida do comportamento
  INSERT INTO invites (workspace_id, email, papel, criado_por)
  VALUES (meu_workspace(), p_email, p_papel, auth.uid())
  RETURNING token INTO v_token;
  RETURN v_token;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: ver_convite(p_token)
-- Chamada pela tela Convite.tsx antes do signUp para mostrar detalhes.
-- Retorna: workspace_nome, email, papel, valido (não expirado e não usado).
-- TODO: confirmar estrutura de retorno exata.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ver_convite(p_token text)
RETURNS TABLE (workspace_nome text, email text, papel text, valido boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- TODO: confirmar no Supabase Dashboard — implementação inferida
  RETURN QUERY
  SELECT
    w.nome AS workspace_nome,
    i.email,
    i.papel,
    (NOT i.usado AND i.expira_em > now()) AS valido
  FROM invites i
  JOIN workspaces w ON w.id = i.workspace_id
  WHERE i.token = p_token;
END;
$$;

-- -----------------------------------------------------------------------------
-- TRIGGER: handle_new_user()
-- Ativado no INSERT em auth.users.
-- Lê metadados: nome e workspace_nome (admin) ou token (membro convidado).
-- Cria workspace (se admin) ou associa ao workspace do convite (se convidado).
-- Cria o perfil do usuário.
-- TODO: confirmar implementação exata — a lógica abaixo é inferida do comportamento.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_papel        text;
  v_nome         text;
  v_token        text;
BEGIN
  v_nome  := NEW.raw_user_meta_data->>'nome';
  v_token := NEW.raw_user_meta_data->>'invite_token';

  IF v_token IS NOT NULL THEN
    -- Convidado: busca workspace e papel do convite
    SELECT i.workspace_id, i.papel
    INTO v_workspace_id, v_papel
    FROM invites i
    WHERE i.token = v_token AND NOT i.usado AND i.expira_em > now();

    -- Marca convite como usado
    UPDATE invites SET usado = true WHERE token = v_token;
  ELSE
    -- Admin fundador: cria novo workspace
    v_papel := 'administrador';
    INSERT INTO workspaces (nome)
    VALUES (NEW.raw_user_meta_data->>'workspace_nome')
    RETURNING id INTO v_workspace_id;

    -- TODO: confirmar se o trigger cria tags e templates padrão para o workspace
    -- (o código de Novo Contato sugere tags padrão existentes)
  END IF;

  -- Cria perfil
  INSERT INTO profiles (id, workspace_id, nome, papel)
  VALUES (NEW.id, v_workspace_id, COALESCE(v_nome, NEW.email), v_papel);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
