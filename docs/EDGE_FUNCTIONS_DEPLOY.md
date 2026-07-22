# Deploy das Edge Functions — Base 5.0

**Funções:** `whatsapp-testar-conexao`, `whatsapp-submeter-template`, `whatsapp-enviar-disparo`, `whatsapp-webhook`

---

## Situação atual (2026-06-19)

O deploy via CLI e GitHub Actions está **bloqueado** por um bug na Supabase Management API para o projeto `mdkinyexgzekrraftwqx` (região us-west-2). O endpoint `GET /v1/projects/{ref}/*` retorna 404 para todos os sub-recursos do projeto.

**Workaround disponível:** deploy manual via Dashboard usando os arquivos standalone em `supabase/functions-standalone/`.

---

## OPÇÃO A — Deploy manual via Dashboard (DISPONÍVEL AGORA)

Use esta opção enquanto o bug da Management API não for resolvido.

### Pré-requisitos
- Acesso ao Supabase Dashboard como administrador do projeto
- Arquivos em `supabase/functions-standalone/` do repositório

### Variáveis de ambiente
**Nenhuma variável adicional é necessária.** O runtime do Supabase injeta automaticamente:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

### Passo a passo

1. Acesse [app.supabase.com](https://app.supabase.com) → seu projeto → **Edge Functions**

2. Clique em **"New Function"**

3. **Função 1: `whatsapp-testar-conexao`**
   - Nome: `whatsapp-testar-conexao`
   - Conteúdo: copie todo o conteúdo de `supabase/functions-standalone/whatsapp-testar-conexao.ts`
   - Disable JWT verification: **NÃO**
   - Clique em **Deploy**

4. **Função 2: `whatsapp-submeter-template`**
   - Nome: `whatsapp-submeter-template`
   - Conteúdo: copie `supabase/functions-standalone/whatsapp-submeter-template.ts`
   - Disable JWT verification: **NÃO**
   - Clique em **Deploy**

5. **Função 3: `whatsapp-enviar-disparo`**
   - Nome: `whatsapp-enviar-disparo`
   - Conteúdo: copie `supabase/functions-standalone/whatsapp-enviar-disparo.ts`
   - Disable JWT verification: **NÃO**
   - Clique em **Deploy**

6. **Função 4: `whatsapp-webhook`** ⚠️
   - Nome: `whatsapp-webhook`
   - Conteúdo: copie `supabase/functions-standalone/whatsapp-webhook.ts`
   - Disable JWT verification: **SIM — OBRIGATÓRIO** (a Meta não envia token JWT)
   - Clique em **Deploy**

7. **Configurar o webhook na Meta/360dialog:**
   - URL do webhook: `https://<seu-projeto>.supabase.co/functions/v1/whatsapp-webhook`
   - Verify token: copie o valor de `webhook_verify_token` da tabela `whatsapp_api_config` (gerado automaticamente na tela de Configuração)

### Verificação após deploy
Na tela **Configuração da API** do app, clique em **"Testar conexão"**. Se retornar `Conectado`, todas as funções estão operacionais.

---

## OPÇÃO B — Deploy via GitHub Actions (QUANDO O BUG FOR RESOLVIDO)

### Pré-requisitos
- Bug da Supabase Management API resolvido (aguardando ticket)
- Secrets configurados no repositório GitHub:
  - `SUPABASE_ACCESS_TOKEN`: Personal Access Token no formato `sbp_...` (gerar em app.supabase.com → Account → Access Tokens)
  - `SUPABASE_PROJECT_ID`: `mdkinyexgzekrraftwqx`

### Como configurar os secrets
1. GitHub → repositório `duguastalli-del/base5.0` → **Settings** → **Secrets and variables** → **Actions**
2. Adicionar:
   - `SUPABASE_ACCESS_TOKEN` → valor do PAT (formato `sbp_` + 40 chars hex)
   - `SUPABASE_PROJECT_ID` → `mdkinyexgzekrraftwqx` (sem espaços)

### Como disparar o deploy
**Automático:** qualquer push na branch `main` que altere arquivos em `supabase/functions/**`

**Manual:**
1. GitHub → repositório → **Actions** → **Deploy Edge Functions**
2. Clique em **"Run workflow"** → Branch: `main` → Run

### O que o workflow faz
1. Checkout do repositório
2. Instala Supabase CLI v2.47.1 (versão fixada para evitar regressões)
3. Diagnóstico: verifica formato do token, lista projetos, testa endpoint específico
4. Se diagnóstico OK: deploy de todas as 4 funções
   - `whatsapp-testar-conexao` — com JWT
   - `whatsapp-submeter-template` — com JWT
   - `whatsapp-enviar-disparo` — com JWT
   - `whatsapp-webhook` — sem JWT (`--no-verify-jwt`)

### Arquivo do workflow
`.github/workflows/deploy-edge-functions.yml`

---

## OPÇÃO C — Deploy via CLI local (quando bug for resolvido)

```bash
# Instalar CLI
npm install -g supabase

# Autenticar
supabase login
# Cola o PAT quando solicitado

# Deploy de todas as funções
supabase functions deploy whatsapp-testar-conexao --project-ref mdkinyexgzekrraftwqx
supabase functions deploy whatsapp-submeter-template --project-ref mdkinyexgzekrraftwqx
supabase functions deploy whatsapp-enviar-disparo --project-ref mdkinyexgzekrraftwqx
supabase functions deploy whatsapp-webhook --project-ref mdkinyexgzekrraftwqx --no-verify-jwt
```

---

## Estrutura dos arquivos no repo

```
supabase/
├── functions/                    ← versão com imports relativos (CLI/Actions)
│   ├── _shared/
│   │   ├── cripto.ts             AES-GCM-256 decrypt
│   │   └── wa-client.ts          adapter BSP-agnóstico
│   ├── whatsapp-testar-conexao/
│   │   └── index.ts
│   ├── whatsapp-submeter-template/
│   │   └── index.ts
│   ├── whatsapp-enviar-disparo/
│   │   └── index.ts
│   └── whatsapp-webhook/
│       ├── index.ts
│       └── config.toml           verify_jwt = false
└── functions-standalone/         ← versão self-contained (Dashboard manual)
    ├── whatsapp-testar-conexao.ts
    ├── whatsapp-submeter-template.ts
    ├── whatsapp-enviar-disparo.ts
    └── whatsapp-webhook.ts
```

---

## Troubleshooting

| Erro | Causa | Solução |
|------|-------|---------|
| `unexpected list functions status 404` | Management API bug ou falta de `supabase link` | Usar deploy manual via Dashboard (Opção A) |
| `Authorization failed for the access token and project ref pair` | Management API bug (projeto específico) | Idem |
| `Token prefix incorreto` | Token é JWT (`eyJ...`) em vez de PAT (`sbp_...`) | Gerar novo PAT em Account → Access Tokens |
| Webhook não recebe eventos | JWT verification ativado na função `whatsapp-webhook` | Recriar com "Disable JWT verification" marcado |
| Testar conexão retorna erro de descriptografia | API Key foi salva com workspace_id diferente do atual | Re-salvar a API Key na tela de Configuração |
