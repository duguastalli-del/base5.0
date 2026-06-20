# Schema — Base 5.0

**Última atualização:** 2026-06-20

> ⚠️ O schema completo (tabelas 1–8) está versionado na branch `claude/dreamy-johnson-seqpv1` (migrations 000001–000008). Este arquivo cobre a tabela adicionada na transição multi-vertical (migration 000009) e serve como referência para o DBA.

---

## workspace_settings

Configurações por workspace para suporte multi-vertical. Migration: `supabase/migrations/20260601000009_workspace_settings.sql`.

### Colunas

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `workspace_id` | `uuid` PK | — | FK → `workspaces(id)` ON DELETE CASCADE |
| `vertical` | `text` | `'politica'` | CHECK: politica/religioso/imobiliario/varejo/pesquisa/publicidade/ong/outro |
| `vocabulario` | `jsonb` | `'{}'` | Override de termos individuais (mesclado sobre TERMOS_PADRAO) |
| `cor_primaria` | `text` | `'#0F4C5C'` | Cor primária da marca (futuro: tematização) |
| `cor_secundaria` | `text` | `'#14b8a6'` | Cor secundária da marca (futuro: tematização) |
| `logo_secundario_url` | `text` | NULL | URL do logo do cliente no Storage (futuro) |
| `nome_exibicao` | `text` | NULL | Nome do workspace para exibição ao usuário (futuro) |
| `templates_iniciais_carregados` | `boolean` | `false` | Flag para onboarding: indica se templates padrão do vertical foram inseridos |
| `tags_iniciais_carregadas` | `boolean` | `false` | Flag para onboarding: indica se tags padrão do vertical foram inseridas |
| `criado_em` | `timestamptz` | `now()` | |
| `atualizado_em` | `timestamptz` | `now()` | Atualizado automaticamente via trigger |

### RLS

| Operação | Quem pode |
|---|---|
| SELECT | Qualquer membro do workspace (via `profiles.workspace_id`) |
| INSERT | Apenas `papel = 'administrador'` do workspace |
| UPDATE | Apenas `papel = 'administrador'` do workspace |
| DELETE | Bloqueado — remoção ocorre apenas via CASCADE de `workspaces` |

### Trigger

`workspace_settings_atualizado_em` — `BEFORE UPDATE` → seta `atualizado_em = now()`.

### Retrocompatibilidade

A migration inclui INSERT condicional que popula `workspace_settings` para todos os workspaces existentes com `vertical='politica'` e `vocabulario={}`. Isso garante que o Antoniassi 2026 e qualquer outro workspace criado antes desta migration tenham comportamento idêntico ao atual.

### Relacionamento com o hook

```
workspace_settings.vertical + workspace_settings.vocabulario
        │
        ▼
TerminologiaProvider (src/contexts/TerminologiaContext.tsx)
        │
        ▼
useTerminologia().t('chave') → string localizada
```

Ver `docs/MULTI_VERTICAL.md` para documentação completa do sistema de terminologia.

---

## Tabelas do schema completo (referência)

As tabelas abaixo existem em produção e estão documentadas nos arquivos da branch `claude/dreamy-johnson-seqpv1`:

| Tabela | Migration | Descrição |
|---|---|---|
| `workspaces` | 000001 | Tenants raiz do sistema |
| `profiles` | 000001 | Usuários com papel e workspace |
| `invites` | 000001 | Tokens de convite |
| `contacts` | 000002 | Contatos/apoiadores/leads |
| `tags` | 000002 | Tags do workspace |
| `contact_tags` | 000002 | Associação contato×tag |
| `audit_logs` | 000003 | Log imutável de ações |
| `message_templates` | 000004 | Templates de mensagem WhatsApp assistido |
| `send_logs` | 000004 | Log de envios WhatsApp assistido |
| `imports` | 000004 | Log de importações |
| `events` | 000005 | Eventos da agenda |
| `whatsapp_api_config` | 000008 | Configuração da API WhatsApp Business por workspace |
| `whatsapp_templates` | 000008 | Templates oficiais Meta para campanhas |
| `whatsapp_disparos` | 000008 | Campanhas de disparo em massa |
| `whatsapp_mensagens` | 000008 | Status individual por destinatário |
| **`workspace_settings`** | **000009** | **Configurações multi-vertical** |

### Views

| View | Descrição |
|---|---|
| `v_ranking_cadastradores` | Ranking de usuários por quantidade de contatos cadastrados |
| `v_contatos_por_cidade` | Distribuição de contatos por cidade |

### RPCs (funções Supabase)

| Função | Descrição |
|---|---|
| `meu_workspace()` | Retorna workspace_id do usuário atual (SECURITY DEFINER) |
| `meu_papel()` | Retorna papel do usuário atual (SECURITY DEFINER) |
| `painel_resumo()` | KPIs do dashboard: total_contatos, novos_hoje, pct_consentimento, optin_pendentes |
| `criar_convite(p_email, p_papel)` | Gera token de convite por e-mail |
| `ver_convite(p_token)` | Valida e retorna dados do convite |
| `anonimizar_contato(p_contact_id)` | Anonimiza dados pessoais (LGPD) |
| `incrementar_disparo_contador(p_disparo_id, p_campo, p_delta)` | Incrementa contadores de campanha de forma segura |
