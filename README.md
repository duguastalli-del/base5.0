# Base 5.0

CRM político mobile-first para equipes de campanha. Conformidade LGPD e regras do TSE. Multi-tenant SaaS com isolamento por workspace.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| PWA | vite-plugin-pwa (autoUpdate, instalável iOS/Android) |
| Banco | Supabase (PostgreSQL + RLS + Row-Level Security) |
| Auth | Supabase Auth (email/senha + convites por token) |
| Offline | Dexie (IndexedDB) — fila de cadastros sem internet |
| Agenda | FullCalendar 6 (daygrid, list, interaction) + Supabase Realtime |
| Importação | SheetJS (xlsx) + Google People API (OAuth) |
| WhatsApp assistido | Links `wa.me` + Web Share API + Supabase Storage (mídia) |
| WhatsApp Business API | Supabase Edge Functions (Deno) — BSP-agnóstico (360dialog / Meta) |
| Criptografia | AES-GCM-256 via Web Crypto API (client-side e Edge Functions) |

## Funcionalidades

- **Cadastro de contatos** — modo rua, offline-first, bairro com autocomplete, consentimento LGPD
- **Base de contatos** — busca, filtros, editar/arquivar/excluir/anonimizar, tags
- **Importação** — planilha XLSX/CSV, Google Contatos (OAuth)
- **Envio assistido WhatsApp** — templates personalizados, opt-in, listas de transmissão, mídia
- **Agenda da equipe** — FullCalendar, eventos compartilhados em tempo real, notificações push
- **Dashboard** — KPIs, contatos por cidade, ranking de cadastradores
- **WhatsApp Business API** — campanhas em massa, templates Meta, webhook, respostas, opt-out automático
- **Convites** — admin gera link por papel (administrador / coordenador / assessor / voluntário)
- **Multi-workspace** — isolamento completo via RLS no PostgreSQL

## Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.local.exemplo .env.local
# Edite .env.local com suas credenciais do Supabase

# 3. Iniciar em desenvolvimento
npm run dev
# Acesse http://localhost:5173

# 4. Build de produção
npm run build
```

## Variáveis de ambiente

Crie `.env.local` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<sua-anon-key>
```

Ambos os valores estão em: Supabase Dashboard → Project Settings → API.

> As Edge Functions usam `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` injetadas automaticamente pelo runtime — não precisam ser configuradas manualmente.

## Deploy

### Frontend (Vercel)

```bash
vercel deploy
# Ou conecte o repositório em vercel.com e adicione as variáveis VITE_*
```

### Edge Functions (WhatsApp Business API)

Ver [`docs/EDGE_FUNCTIONS_DEPLOY.md`](docs/EDGE_FUNCTIONS_DEPLOY.md) para instruções completas.

**Resumo:** deploy manual via Supabase Dashboard usando os arquivos em `supabase/functions-standalone/`. Deploy automático via GitHub Actions disponível quando o bug da Supabase Management API for resolvido.

## Estrutura do projeto

```
src/
├── lib/
│   ├── supabase.ts          cliente Supabase + tipo Perfil
│   ├── cripto.ts            AES-GCM-256 client-side (API keys WhatsApp)
│   ├── db.ts                Dexie offline queue
│   └── format.ts            formatação E.164, máscara celular, wa.me
├── pages/
│   ├── Entrar.tsx           login + redefinir senha
│   ├── CriarCampanha.tsx    onboarding (cria workspace + admin)
│   ├── Convite.tsx          aceitar convite por token
│   ├── Inicio.tsx           dashboard
│   ├── Contatos.tsx         lista + filtros
│   ├── NovoContato.tsx      cadastro offline-first
│   ├── Envio.tsx            WhatsApp assistido
│   ├── Agenda.tsx           FullCalendar + Realtime
│   ├── Templates.tsx        templates de mensagem
│   ├── WhatsAppHub.tsx      hub da API Business (abas)
│   ├── WhatsAppConfig.tsx   configuração BSP + API Key
│   ├── WhatsAppTemplates.tsx  templates Meta oficiais
│   ├── WhatsAppCampanhas.tsx  campanhas em massa
│   └── WhatsAppRespostas.tsx  painel de respostas
└── components/
    ├── DetalheContato.tsx   modal editar/arquivar/excluir/anonimizar
    ├── EnvioLista.tsx       lista de transmissão WhatsApp
    ├── EventoModal.tsx      criar/editar evento na agenda
    ├── ModalImportar.tsx    importação XLSX + Google Contatos
    └── CampoSenha.tsx       input senha com olhinho

supabase/
├── functions/               Edge Functions (versão com _shared/)
└── functions-standalone/    Edge Functions self-contained (deploy Dashboard)

docs/
├── ROADMAP.md               estado de todas as etapas
├── AUDITORIA_ETAPA_11.md    auditoria completa da Etapa 11
├── BACKLOG.md               dívidas técnicas com severidade e esforço
└── EDGE_FUNCTIONS_DEPLOY.md  guia de deploy das funções
```

## Papéis de usuário (RBAC)

| Papel | Permissões |
|-------|-----------|
| `administrador` | Acesso total: convites, config WhatsApp, templates, campanhas, importação |
| `coordenador` | Templates, campanhas, importação, ver todos os contatos |
| `assessor` | Cadastrar e ver contatos |
| `voluntario` | Cadastrar contatos |

## Roadmap e estado atual

Ver [`docs/ROADMAP.md`](docs/ROADMAP.md) para o estado detalhado de cada etapa (1–11) e pendências transversais.

## Dívidas técnicas

Ver [`docs/BACKLOG.md`](docs/BACKLOG.md) para a lista completa com severidade, solução proposta e esforço estimado.

**Crítica (bloqueia campanha):** deploy das Edge Functions (DT-02) — resolução disponível via deploy manual no Dashboard.
