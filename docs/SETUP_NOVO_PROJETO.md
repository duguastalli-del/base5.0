# Setup de Novo Projeto — Base 5.0

Guia passo-a-passo para criar um workspace zerado a partir do zero:
novo projeto Supabase + deploy Vercel + primeiro admin.

---

## Pré-requisitos

- Conta Supabase (supabase.com)
- Conta Vercel (vercel.com)
- Node.js 20+ e npm

---

## 1. Criar Projeto Supabase

1. Acesse [app.supabase.com](https://app.supabase.com) → **New Project**
2. Escolha organização, nome, senha do banco e região (South America para menor latência no Brasil)
3. Aguarde o provisionamento (~2 min)

---

## 2. Aplicar as Migrations

### Opção A — SQL Editor (recomendado para primeiro setup)

Execute os arquivos em ordem no **SQL Editor** do Supabase Dashboard:

```
supabase/migrations/20260601000001_inicial_auth_workspaces.sql
supabase/migrations/20260601000002_contatos_base.sql
supabase/migrations/20260601000003_audit_logs.sql
supabase/migrations/20260601000004_envio_whatsapp_assistido.sql
supabase/migrations/20260601000005_agenda.sql
supabase/migrations/20260601000006_dashboard_views.sql
supabase/migrations/20260601000007_storage_campanha.sql
supabase/migrations/20260601000008_whatsapp_api.sql
```

> Execute um arquivo de cada vez. Se houver erro, leia o `TODO` mais próximo e ajuste
> antes de continuar. Os arquivos contêm comentários `-- TODO: confirmar no Supabase Dashboard`
> onde há incerteza.

### Opção B — Supabase CLI (automático)

```bash
# Instalar CLI
npm install -g supabase

# Linkar ao projeto (use o project-ref da URL do Dashboard)
supabase link --project-ref SEU_PROJECT_REF

# Aplicar todas as migrations
supabase db push
```

---

## 3. Configurar o Bucket de Storage

1. Dashboard → **Storage** → **New bucket**
2. Nome: `campaign-media`
3. Marcar como **Public bucket** (TODO: confirmar se público ou privado com signed URL)
4. As políticas de acesso são criadas pelo arquivo `20260601000007_storage_campanha.sql`

---

## 4. Habilitar Realtime

Para a Agenda funcionar em tempo real:

1. Dashboard → **Database** → **Replication**
2. Em **supabase_realtime** → adicionar a tabela `events`

---

## 5. Configurar Variáveis de Ambiente

### Localmente (`.env.local`)

```env
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=SEU_ANON_KEY
```

As chaves estão em: Dashboard → **Project Settings** → **API**.

### Na Vercel

1. Acesse o projeto na Vercel → **Settings** → **Environment Variables**
2. Adicione as mesmas duas variáveis acima para os ambientes Production, Preview e Development

---

## 6. Deploy na Vercel

```bash
# Primeiro deploy (ou usar interface web da Vercel)
vercel --prod
```

Ou conecte o repositório GitHub em [vercel.com/new](https://vercel.com/new) e o deploy é automático a cada push na branch `main`.

> **Importante:** Antes de cada push, rodar `npm run build` localmente para garantir
> que o build de produção passe. Ver BUG-04 em `docs/BUGS_RESOLVIDOS.md`.

---

## 7. Criar o Primeiro Admin

O primeiro usuário é criado pela tela de cadastro normal (`/registro`), passando
`workspace_nome` nos metadados. O trigger `handle_new_user()` cria o workspace e
o perfil como `administrador` automaticamente.

```
1. Acesse a URL do deploy (ex: https://base5-0.vercel.app)
2. Clique em "Criar workspace"
3. Preencha: nome, e-mail, senha e nome do workspace
4. O sistema cria o workspace e o usuário admin automaticamente
```

---

## 8. Convidar Membros

1. Login como admin → tela Início → botão **Convidar membro**
2. Preencha e-mail e papel desejado
3. O sistema gera um link de convite (válido por 7 dias — TODO: confirmar)
4. Envie o link ao membro; ao abrir, ele será redirecionado para `/convite?token=...`
5. O membro preenche nome e senha; o trigger associa ao workspace automaticamente

---

## 9. Checklist pós-setup

- [ ] SQL Editor: migrations aplicadas sem erros
- [ ] Dashboard → Authentication → URL Configuration: Site URL = URL do deploy Vercel
- [ ] Dashboard → Authentication → Email: confirmar templates de e-mail
- [ ] Storage → campaign-media: bucket criado e público
- [ ] Realtime → events: tabela habilitada
- [ ] Vercel: variáveis de ambiente configuradas
- [ ] Primeiro admin criado com sucesso
- [ ] Tela de Contatos carrega sem erros
- [ ] Tela de Dashboard mostra KPIs (mesmo que zerados)

---

## Troubleshooting comum

### "undefined" na URL do Supabase
Variáveis de ambiente não configuradas. Verificar `.env.local` (local) ou Settings da Vercel (produção).

### Erro 42501 (permission denied)
RLS bloqueando a query. Verificar se o usuário tem perfil criado (`profiles`) e se `meu_workspace()` retorna valor.

### Trigger não criou o perfil
Verificar no Dashboard → Database → Functions se `handle_new_user` existe e no Database → Triggers se `on_auth_user_created` está ativo na tabela `auth.users`.

### Build falha com TypeScript errors
Rodar `npm run build` (não `tsc --noEmit`) para ver todos os erros. Ver BUG-04 em `docs/BUGS_RESOLVIDOS.md`.

---

*Documento criado em: 2026-06-19*
