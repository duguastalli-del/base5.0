# Auditoria — Etapa 11: WhatsApp Business API

**Data de entrega:** 2026-06-16 a 2026-06-18
**Método:** leitura direta dos arquivos-fonte + git log
**Commits cobertos:** `37d0cbb` → `273c9fb`

---

## Entregas e commits

| Entrega | Commit | Data/hora | Arquivos |
|---------|--------|-----------|----------|
| E1 — Schema SQL (5 tabelas) | — (sem commit) | Entregue como SQL na conversa | Sem arquivo no repo |
| E2 — Config + Templates | `37d0cbb` | 2026-06-16 21:33 | `WhatsAppConfig.tsx`, `WhatsAppTemplates.tsx`, `lib/cripto.ts` |
| E3 — 4 Edge Functions | `589292c` | 2026-06-16 21:54 | `supabase/functions/whatsapp-*/` + `_shared/` |
| E3 — CI/Deploy | `2c2e6f8` + fixes | 2026-06-16 22:27–17 04:23 | `.github/workflows/deploy-edge-functions.yml` |
| E3 — Standalones | `3683e40` | 2026-06-17 16:16 | `supabase/functions-standalone/*.ts` |
| E4 — UI Campanhas + Respostas | `273c9fb` | 2026-06-18 01:50 | `WhatsAppCampanhas.tsx`, `WhatsAppRespostas.tsx`, `WhatsAppHub.tsx` |

---

## Entrega 1 — Schema do banco

### O que foi especificado
5 tabelas: `whatsapp_api_config`, `whatsapp_templates`, `whatsapp_disparos`, `whatsapp_mensagens`, `whatsapp_opt_outs` com RLS e índices.

### O que foi entregue
SQL gerado e entregue como texto na conversa para execução manual no Supabase Dashboard. Sem arquivo `.sql` no repositório.

### Adições além do escopo
- RPC `incrementar_disparo_contador(p_disparo_id, p_campo)` — necessária para contadores atômicos no webhook (entregues, respondidos, opt_outs). Não estava no schema original.

### Status
✅ Funcionou (Entrega 2 validada em produção → banco existe). Schema não auditável pelo repo.

---

## Entrega 2 — Telas Configuração + Templates

### WhatsAppConfig.tsx (421 linhas)
| Feature | Status |
|---------|--------|
| Seleção de BSP (360dialog / Twilio / Zenvia) | ✅ |
| API Key criptografada client-side (AES-GCM-256) antes de salvar | ✅ |
| Phone Number ID + Business Account ID + número | ✅ |
| Webhook verify token gerado automaticamente (UUID) | ✅ |
| URL do webhook exibida com botão copiar | ✅ |
| Botão "Testar conexão" → chama `whatsapp-testar-conexao` | ✅ |
| Toggle ativo/inativo | ✅ |

### WhatsAppTemplates.tsx (793 linhas)
| Feature | Status |
|---------|--------|
| CRUD completo (criar, editar, excluir) | ✅ |
| Cabeçalho: texto / imagem / vídeo | ✅ |
| Corpo com `{{N}}`, detecção automática via regex | ✅ |
| Rodapé + botões (QUICK_REPLY, URL, PHONE_NUMBER) | ✅ |
| Preview em tempo real | ✅ |
| Submissão à Meta via `whatsapp-submeter-template` | ✅ |
| Status badges: rascunho → submetido → aprovado → rejeitado | ✅ |
| Motivo de rejeição exibido | ✅ |

### src/lib/cripto.ts
- AES-GCM-256 via Web Crypto API
- Chave derivada via PBKDF2 do `workspace_id` (salt: `"base50-wa-" + workspaceId`, 100.000 iterações, SHA-256)
- Nunca armazenada
- Mesmo algoritmo inlinado nas Edge Functions → decrypt simétrico garantido

### Pendências conhecidas
- **Sync reverso de status de template:** a Meta envia evento `message_template_status_update` via webhook quando aprova ou rejeita um template. O `whatsapp-webhook.ts` atual **não trata** esse evento. Status fica em `submetido` até o admin atualizar manualmente.

### Validação em produção
✅ Confirmada pelo usuário.

---

## Entrega 3 — 4 Edge Functions

### Arquitetura
```
supabase/functions/
├── _shared/
│   ├── cripto.ts       AES-GCM-256 decrypt (Deno / Web Crypto)
│   └── wa-client.ts    Adapter BSP-agnóstico (360dialog vs Meta Cloud API)
├── whatsapp-testar-conexao/
├── whatsapp-submeter-template/
├── whatsapp-enviar-disparo/
└── whatsapp-webhook/
    └── config.toml     verify_jwt = false
```

### Funções

#### whatsapp-testar-conexao
- `POST { workspace_id }` → GET na BSP, retorna `display_name`, `qualidade`
- Atualiza `ultima_verificacao_em` e `status_verificacao` em `whatsapp_api_config`
- JWT: **obrigatório** (endpoint interno)

#### whatsapp-submeter-template
- `POST { template_id }` → POST template para Meta/360dialog
- Atualiza `status` → `submetido`, salva `meta_template_id`
- Monta `components` no formato Meta (HEADER/BODY/FOOTER/BUTTONS)
- JWT: **obrigatório**

#### whatsapp-enviar-disparo
- `POST { disparo_id }` → loop de envio
- Rate limiting: `filtros.rate_limit_por_minuto` (default 80), `delayMs = ceil(60000 / rate)`
- Idempotência: verifica `whatsapp_mensagens` antes de reenviar (`idsJaEnviados`)
- Exclui `whatsapp_opt_outs` (`idsOptOut`)
- Força `consent='sim'` + `status='ativo'` na query de contatos
- Retry 429: backoff exponencial (`2^tentativas` segundos, até 3 tentativas)
- Atualiza contadores no disparo a cada mensagem enviada
- JWT: **obrigatório**

#### whatsapp-webhook
- `GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` → handshake Meta
- `POST` → processa eventos:
  - Status `delivered` → `status='entregue'`, incrementa contador via RPC
  - Status `read` → `status='lido'`
  - Status `failed` → `status='falha'`, salva `erro_codigo` + `erro_mensagem`
  - Mensagem PARAR/STOP/SAIR/CANCELAR/REMOVER/DESCADASTRAR → opt-out automático + mensagem de confirmação
  - Mensagem SIM/OK/CONFIRMO + `consent='pendente'` → `consent='sim'`
  - Outras respostas → `status='respondido'`, incrementa contador
- JWT: **desabilitado** (`config.toml: verify_jwt = false`) — necessário para Meta chamar sem token

### BSP-agnóstico
| | 360dialog | Meta Cloud API |
|-|-----------|----------------|
| Header | `D360-API-KEY: {key}` | `Authorization: Bearer {key}` |
| URL mensagens | `waba.360dialog.io/v1/messages` | `graph.facebook.com/v17.0/{phone_id}/messages` |
| URL templates | `waba.360dialog.io/v1/configs/templates` | `graph.facebook.com/v17.0/{waba_id}/message_templates` |
| URL verificar | `waba.360dialog.io/v1/configs/webhook` | `graph.facebook.com/v17.0/{phone_id}?fields=...` |

### Status de deploy
| | |
|-|-|
| Código no repo | ✅ commit `589292c` |
| Arquivos standalone (Dashboard) | ✅ commit `3683e40` — `supabase/functions-standalone/` |
| Deploy efetivo no Supabase | ❌ BLOQUEADO |
| Causa do bloqueio | Bug Supabase: `GET /v1/projects/mdkinyexgzekrraftwqx/*` retorna 404 (região us-west-2) |
| GitHub Actions workflow | ✅ criado, com diagnóstico curl e CLI v2.47.1 fixado |
| Workaround disponível | ✅ deploy manual via Dashboard com standalones |

---

## Entrega 4 — UI Campanhas + Respostas

### WhatsAppCampanhas.tsx (552 linhas)

**Vista lista:**
- Cards com nome, data, status badge (rascunho/agendado/enviando/concluido/pausado/falha)
- Progress bar enviados/total
- Contadores: respondidos, opt-outs, falhas
- Botão "Enviar" para disparos em rascunho/agendado/pausado
- Botão "Detalhes" → vista detalhe

**Vista wizard (4 etapas):**
1. Nome da campanha + seleção de template (só `status='aprovado'`)
2. Filtros de audiência (cidade, origem, bairro, tags AND) + estimativa em tempo real + rate limit
3. Mapeamento de parâmetros `{{N}}` para campos do contato (só se template tem params)
4. Confirmação + salvar como rascunho

**Vista detalhe:**
- Funil de entrega: total → enviados → entregues → lidos → respondidos (barras com %)
- Contadores de falhas e opt-outs
- Botão "Enviar campanha agora" para disparos pendentes

**Regras implementadas:**
- Só templates `status='aprovado'` aparecem no wizard
- Filtro de audiência força `consent='sim'` na estimativa
- Edge Function usa `consent='sim'` + exclui `whatsapp_opt_outs` no envio real

### WhatsAppRespostas.tsx (175 linhas)
- Cards: total responderam + total opt-outs
- Filtro: todos / respostas / opt-outs
- Lista com: nome/telefone do contato, nome da campanha, texto da resposta, timestamp
- Enriquecimento via queries separadas (sem nested selects)

### WhatsAppHub.tsx (atualizado)
- 4 abas: Configuração (admin), Templates, Campanhas, Respostas
- Administrador abre em Configuração; coordenador abre em Campanhas
- Assessor/voluntário: sem acesso (retorna null)

### O que NÃO foi implementado
| Feature | Status |
|---------|--------|
| Pausar campanha em andamento | ⛔ Não implementado — requer queue |
| Retomar com ponto de retomada por contato | 🟡 Parcial — reenvia mas idempotência evita duplicatas |
| Cancelar campanha | ⛔ Sem botão na UI |
| Exportar respostas (CSV) | ⛔ Não implementado |
| Audit logs de ações WA | ⛔ Não implementado |
| Refresh automático quando `status='enviando'` | ⛔ Sem polling na UI |

---

## Itens transversais

| Item | Status |
|------|--------|
| Criptografia AES-GCM-256 client-side | ✅ `src/lib/cripto.ts` |
| Mesma cripto nas Edge Functions | ✅ Inlinada em cada função |
| JWT desabilitado só para webhook | ✅ `config.toml` |
| Verify token por banco (não hardcoded) | ✅ Lookup em `whatsapp_api_config` |
| consent='sim' forçado em todos os envios | ✅ UI + Edge Function |
| Exclusão de opt_outs no envio | ✅ Edge Function |
| Templates só aprovados no wizard | ✅ `.eq("status", "aprovado")` |
| Assessor/voluntário sem acesso | ✅ (pode ser revisado) |
| NULL safety em todo código | ✅ Padrão `(x ?? []).method()` |
| Queries separadas (sem nested select) | ✅ |
