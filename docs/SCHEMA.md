# Schema do Banco de Dados — Base 5.0

Documentação do schema Supabase (PostgreSQL). Extraída por leitura de código em 2026-06-19.
Campos marcados com `TODO` precisam ser confirmados no Supabase Dashboard.

Arquivos SQL: `supabase/migrations/` — 8 arquivos numerados.
Guia de setup: [`SETUP_NOVO_PROJETO.md`](./SETUP_NOVO_PROJETO.md).

---

## Diagrama de Entidades (simplificado)

```
auth.users
    │
    ▼ (trigger handle_new_user)
workspaces ◄──── profiles (id = auth.users.id)
    │                 │
    ├── invites        │
    ├── contacts ──────┘ (criado_por)
    │       │
    │       └── contact_tags ──── tags
    │
    ├── audit_logs
    ├── message_templates ──── send_logs
    ├── imports
    ├── events
    ├── whatsapp_api_config
    ├── whatsapp_templates ──── whatsapp_disparos ──── whatsapp_mensagens
    └── (bucket: campaign-media)
```

---

## Migration 001 — Auth, Workspaces, Profiles e Convites

**Arquivo:** `20260601000001_inicial_auth_workspaces.sql`

### workspaces
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | gen_random_uuid() |
| nome | text NOT NULL | Nome do workspace |
| criado_em | timestamptz | DEFAULT now() |

RLS: membros do workspace vêem apenas o próprio workspace.

### profiles
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | = auth.users.id |
| workspace_id | uuid FK | → workspaces |
| nome | text NOT NULL | |
| papel | text NOT NULL | administrador / coordenador / assessor / voluntario |
| criado_em | timestamptz | DEFAULT now() |

### invites
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | |
| workspace_id | uuid FK | → workspaces |
| email | text NOT NULL | |
| papel | text NOT NULL | Mesmo ENUM de profiles |
| token | text UNIQUE | encode(gen_random_bytes(32), 'hex') |
| usado | boolean | DEFAULT false |
| criado_por | uuid FK | → profiles |
| criado_em | timestamptz | |
| expira_em | timestamptz | DEFAULT now() + 7 days (TODO: confirmar) |

### Funções / Triggers
| Nome | Tipo | Descrição |
|------|------|-----------|
| `meu_workspace()` | FUNCTION SECURITY DEFINER | Retorna workspace_id do usuário autenticado |
| `meu_papel()` | FUNCTION SECURITY DEFINER | Retorna papel do usuário autenticado |
| `criar_convite(p_email, p_papel)` | RPC | Cria convite e retorna token |
| `ver_convite(p_token)` | RPC | Valida token, retorna workspace_nome, email, papel, valido |
| `handle_new_user()` | TRIGGER (after insert auth.users) | Cria workspace (admin) ou associa convite (membro) |

---

## Migration 002 — Contatos Base

**Arquivo:** `20260601000002_contatos_base.sql`

### contacts
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | |
| workspace_id | uuid FK | → workspaces |
| nome | text NOT NULL | |
| celular_e164 | text NOT NULL | Formato +55DDDXXXXXXXXX |
| cidade | text NOT NULL | |
| bairro | text | nullable |
| origem | text | nullable |
| obs | text | nullable |
| consent | text NOT NULL | sim / pendente / recusou |
| status | text NOT NULL | ativo / arquivado / anonimizado |
| criado_por | uuid FK | → profiles (ON DELETE SET NULL) |
| criado_em | timestamptz | |

**Unique:** `(workspace_id, celular_e164)` — duplicatas geram erro 23505 (tratado no app).

**Índices:** workspace+status, workspace+cidade, workspace+criado_em DESC.

### tags
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | |
| workspace_id | uuid FK | → workspaces |
| nome | text NOT NULL | |
| criado_em | timestamptz | |

**Unique:** `(workspace_id, nome)`

### contact_tags
| Coluna | Tipo | Observação |
|--------|------|-----------|
| contact_id | uuid PK,FK | → contacts |
| tag_id | uuid PK,FK | → tags |

**PK composta:** `(contact_id, tag_id)`. Sem workspace_id próprio (herdado via contact).

### Funções
| Nome | Tipo | Descrição |
|------|------|-----------|
| `anonimizar_contato(p_contact_id)` | RPC SECURITY DEFINER | Zera PII, seta status='anonimizado', remove contact_tags |

---

## Migration 003 — Audit Logs

**Arquivo:** `20260601000003_audit_logs.sql`

### audit_logs
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | |
| workspace_id | uuid FK | → workspaces |
| usuario_id | uuid FK | → profiles (ON DELETE SET NULL) |
| acao | text NOT NULL | ex: exportar_contatos, anonimizar_contato |
| entidade | text | ex: contacts, whatsapp_templates |
| entidade_id | uuid | Linha afetada (opcional) |
| detalhes | jsonb | Shape livre por ação |
| criado_em | timestamptz | |

RLS: SELECT apenas admin/coordenador; INSERT qualquer membro; sem DELETE/UPDATE.

**Valores conhecidos de `acao`:** consulta_dashboard, exportar_dashboard_pdf, exportar_contatos, criar_contato, editar_contato, arquivar_contato, reativar_contato, excluir_contato, anonimizar_contato, criar_convite, consulta_mapa_calor, conectar_whatsapp_api, criar_template_whatsapp, editar_template_whatsapp, submeter_template_whatsapp, excluir_template_whatsapp, criar_campanha_whatsapp.

---

## Migration 004 — Envio WhatsApp Assistido

**Arquivo:** `20260601000004_envio_whatsapp_assistido.sql`

### message_templates
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | |
| workspace_id | uuid FK | → workspaces |
| nome | text NOT NULL | |
| texto | text NOT NULL | Marcadores: {nome}, {regiao} |
| tipo | text NOT NULL | normal / optin |
| media_url | text | URL pública no bucket campaign-media |
| media_type | text | image / video (nullable) |
| criado_por | uuid FK | → profiles |
| criado_em | timestamptz | |

### send_logs
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | |
| workspace_id | uuid FK | → workspaces |
| contact_id | uuid FK | → contacts |
| template_id | uuid FK | → message_templates (ON DELETE SET NULL) |
| modo | text | normal / optin / lista |
| enviado_por | uuid FK | → profiles |
| mensagem_texto | text | Texto personalizado enviado |
| criado_em | timestamptz | |

### imports
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | |
| workspace_id | uuid FK | → workspaces |
| fonte | text NOT NULL | telefone / google / xlsx |
| qtd_importados | integer | |
| qtd_duplicados | integer | |
| executado_por | uuid FK | → profiles |
| criado_em | timestamptz | |

---

## Migration 005 — Agenda

**Arquivo:** `20260601000005_agenda.sql`

### events
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | |
| workspace_id | uuid FK | → workspaces |
| titulo | text NOT NULL | |
| inicio | timestamptz NOT NULL | |
| fim | timestamptz | nullable |
| local | text | nullable |
| cidade | text | nullable |
| descricao | text | nullable |
| responsavel | uuid FK | → profiles (nullable) |
| lembrete_minutos | integer | DEFAULT 30 |
| google_event_id | text | Integração futura com Google Calendar |
| criado_por | uuid FK | → profiles |
| criado_em | timestamptz | |

**Realtime:** habilitado para canal `agenda-{workspace_id}` (TODO: confirmar no Dashboard).

---

## Migration 006 — Dashboard Views e RPCs

**Arquivo:** `20260601000006_dashboard_views.sql`

### Views
| Nome | Colunas | Descrição |
|------|---------|-----------|
| `v_ranking_cadastradores` | cadastrador text, qtd integer | Top cadastradores por volume (filtrado por meu_workspace()) |
| `v_contatos_por_cidade` | cidade text, qtd integer | Contatos ativos por cidade (TODO: confirmar existência) |

### Funções
| Nome | Retorno | Descrição |
|------|---------|-----------|
| `painel_resumo()` | TABLE (total_contatos, novos_hoje, pct_consentimento, optin_pendentes) | KPIs gerais do workspace |
| `incrementar_disparo_contador(p_disparo_id, p_campo, p_delta)` | void | Incremento atômico de contadores de campanha WhatsApp |

---

## Migration 007 — Storage: campaign-media

**Arquivo:** `20260601000007_storage_campanha.sql`

**Bucket:** `campaign-media` (público, TODO: confirmar)

| Política | Operação | Regra |
|----------|----------|-------|
| public_read | SELECT | bucket_id = 'campaign-media' |
| upload_admin | INSERT | workspace_id no path + papel admin/coord |
| update_admin | UPDATE | idem |
| delete_admin | DELETE | idem |

**Limites (inferidos do código):**
- Imagem: 5 MB
- Vídeo: 16 MB

---

## Migration 008 — WhatsApp API (Campanhas em Massa)

**Arquivo:** `20260601000008_whatsapp_api.sql`

### whatsapp_api_config
| Coluna | Tipo | Observação |
|--------|------|-----------|
| workspace_id | uuid PK,FK | Um registro por workspace |
| bsp | text NOT NULL | 360dialog / twilio / zenvia |
| api_key_encrypted | text | Cifrada no cliente (src/lib/cripto.ts) |
| phone_number_id | text | ID da Meta |
| business_account_id | text | WABA ID |
| numero_telefone | text | E.164 |
| display_name | text | max 25 chars |
| webhook_verify_token | text NOT NULL | UUID para verificação do webhook |
| ativo | boolean | DEFAULT false |
| ultima_verificacao_em | timestamptz | |
| status_verificacao | text | |
| configurado_por | uuid FK | → profiles |
| configurado_em | timestamptz | |

### whatsapp_templates
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | |
| workspace_id | uuid FK | |
| nome | text NOT NULL | Nome interno |
| meta_template_name | text NOT NULL | Nome na Meta (snake_case) |
| categoria | text NOT NULL | marketing / utility / authentication |
| idioma | text NOT NULL | DEFAULT 'pt_BR' |
| status | text NOT NULL | rascunho / submetido / aprovado / rejeitado / pausado / desativado |
| corpo | text NOT NULL | Com marcadores {{1}}, {{2}} |
| parametros | text[] | Nomes dos parâmetros |
| cabecalho_tipo | text | texto / imagem (nullable) |
| cabecalho_conteudo | text | Texto ou URL da imagem |
| rodape | text | max 60 chars (TODO: confirmar CHECK no banco) |
| botoes | jsonb | Array de {type, text, url?, phone_number?} |
| meta_template_id | text | ID retornado pela Meta ao submeter |
| motivo_rejeicao | text | Preenchido pela Meta |
| criado_por | uuid FK | → profiles |
| criado_em | timestamptz | |

### whatsapp_disparos
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | |
| workspace_id | uuid FK | |
| template_id | uuid FK | → whatsapp_templates |
| nome | text NOT NULL | Nome da campanha |
| status | text NOT NULL | rascunho / agendado / enviando / concluido / pausado / falha |
| filtros_aplicados | jsonb | {cidade, bairro, origem, tags, parametros_mapeamento, rate_limit_por_minuto} |
| total_destinatarios | integer | |
| enviados | integer | Incrementado pela Edge Function |
| entregues | integer | nullable — via webhook Meta |
| lidos | integer | nullable — via webhook Meta |
| respondidos | integer | |
| opt_outs | integer | |
| falhas | integer | |
| criado_por | uuid FK | → profiles |
| criado_em | timestamptz | |
| iniciado_em | timestamptz | |
| finalizado_em | timestamptz | |

### whatsapp_mensagens
| Coluna | Tipo | Observação |
|--------|------|-----------|
| id | uuid PK | |
| workspace_id | uuid FK | |
| disparo_id | uuid FK | → whatsapp_disparos (nullable) |
| contact_id | uuid FK | → contacts |
| status | text NOT NULL | enviado / entregue / lido / respondido / opt_out / falha |
| resposta_texto | text | nullable |
| respondido_em | timestamptz | nullable |
| criado_em | timestamptz | |

---

## RBAC — Resumo de permissões

| Papel | contacts | tags | templates | disparos | audit_logs | wa_config |
|-------|----------|------|-----------|----------|------------|-----------|
| administrador | CRUD | CRUD | CRUD | CRUD | Lê | CRUD |
| coordenador | CRUD | CRUD | CRUD | CRUD | Lê | — |
| assessor | Lê/Cria/Edita | Lê | Lê | Lê | — | — |
| voluntario | Lê/Cria | Lê | Lê | — | — | — |

> Restrições finas (ex: voluntário só edita próprios contatos) são implementadas no app, não via RLS.
> TODO: confirmar se há RLS granular por papel ou se é tudo no app.

---

*Gerado em: 2026-06-19 por leitura de código (sem acesso direto ao Supabase Dashboard).*
*Campos marcados `TODO` devem ser confirmados no Dashboard antes de usar em produção.*
