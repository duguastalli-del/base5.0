# Backlog de Dívidas Técnicas — Base 5.0

**Atualizado em:** 2026-06-19
**Escopo:** dívidas identificadas até o fim da Etapa 11

---

## Dívidas da Etapa 11 (WhatsApp Business API)

### DT-01 — Migrations SQL não versionadas

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Alta |
| **Descrição** | Nenhum arquivo `.sql` no repositório. Todo o schema (tabelas, RLS, triggers, funções, views) existe só no banco de produção. Impossível auditar, reproduzir ou reverter. |
| **Solução proposta** | `supabase db dump --schema public > supabase/schema.sql` e versionamento. Ou usar `supabase migrations` para declarar o estado atual como migration inicial. |
| **Esforço estimado** | 1–2h |
| **Bloqueia campanha?** | Não — banco existe e funciona. Bloqueia auditoria e portabilidade. |

---

### DT-02 — Deploy de Edge Functions bloqueado (bug Supabase)

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Crítica** |
| **Descrição** | `GET /v1/projects/mdkinyexgzekrraftwqx/*` retorna 404 para todos os endpoints de gerenciamento específicos do projeto (região us-west-2). CLI (`supabase functions deploy`) e GitHub Actions falham. As 4 funções não estão ativas no Supabase. Todas as features de campanha dependem delas. |
| **Solução proposta** | Curto prazo: deploy manual via Dashboard usando os arquivos em `supabase/functions-standalone/`. Ver `docs/EDGE_FUNCTIONS_DEPLOY.md`. Longo prazo: aguardar resolução do ticket de suporte Supabase. |
| **Esforço estimado** | 20 min (deploy manual via Dashboard) |
| **Bloqueia campanha?** | **SIM — bloqueia tudo que depende de Edge Functions** |

---

### DT-03 — Sync reverso de status de template ausente

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Descrição** | A Meta notifica aprovação/rejeição de templates via webhook com evento `message_template_status_update`. O `whatsapp-webhook` atual não trata esse evento. Status do template fica em `submetido` para sempre, a menos que o admin atualize manualmente no banco. |
| **Solução proposta** | No handler POST do webhook, detectar `entry[].changes[].value.event === "APPROVED"` ou `"REJECTED"` e atualizar `whatsapp_templates.status` correspondente. |
| **Esforço estimado** | 1h (código no webhook + teste) |
| **Bloqueia campanha?** | Não — o wizard já filtra por `status='aprovado'`. Impacto: admin não vê aprovação automaticamente. |

---

### DT-04 — Disparo em status `enviando` orfão

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Descrição** | Se a Edge Function morrer no meio do loop de envio (timeout do Deno em 150s, erro de rede prolongado), o disparo fica com `status='enviando'` indefinidamente. Não há mecanismo de recovery automático. |
| **Solução proposta** | Opção A: pg_cron que detecta disparos com `status='enviando'` há mais de N minutos e reverte para `pausado`. Opção B: no início da Edge Function, verificar disparos orfãos do workspace. |
| **Esforço estimado** | 2h |
| **Bloqueia campanha?** | Não — é risco pós-deploy. Um disparo orfão bloqueia aquele disparo específico. |

---

### DT-05 — Pausa real de campanha não implementável sem queue

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Baixa |
| **Descrição** | O loop de envio na Edge Function é síncrono e não pode ser interrompido externamente. Não existe mecanismo de pausa real (ex: flag no banco que o loop checa a cada iteração). |
| **Solução proposta** | A cada iteração do loop, verificar `whatsapp_disparos.status` via query. Se mudou para `pausado` ou `cancelado`, interromper o loop. Requer que a UI atualize o status no banco. |
| **Esforço estimado** | 3h (Edge Function + UI com botões pausar/cancelar) |
| **Bloqueia campanha?** | Não — campanhas funcionam sem pausa. É limitação de UX. |

---

### DT-06 — Cancelar campanha e exportar respostas ausentes na UI

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Baixa |
| **Descrição** | A UI não tem botão de cancelar campanha. A tela de Respostas não tem exportação para CSV/XLSX. |
| **Solução proposta** | Cancelar: botão na lista que atualiza `status='cancelado'` (+ DT-05 para parar o loop). Exportar: `XLSX.utils.json_to_sheet()` com `xlsx` já instalado, gerar blob e download. |
| **Esforço estimado** | 2h |
| **Bloqueia campanha?** | Não |

---

### DT-07 — Audit logs de ações WhatsApp não escritos

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Baixa |
| **Descrição** | Nenhuma das telas WhatsApp (Config, Templates, Campanhas, Respostas) escreve em `audit_logs`. Apenas `DetalheContato.tsx` usa `audit_logs`. |
| **Solução proposta** | Inserir em `audit_logs` nas ações: salvar config API, submeter template, iniciar/cancelar disparo, opt-out manual. |
| **Esforço estimado** | 1–2h |
| **Bloqueia campanha?** | Não |

---

### DT-08 — Assessor/voluntário sem acesso às telas WA

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Baixa — pode ser intencional |
| **Descrição** | `WhatsAppHub` retorna `null` para assessor e voluntário. Não foi definido explicitamente se esses papéis devem ter acesso read-only à aba Respostas. |
| **Solução proposta** | Definir política: se assessor deve ver respostas da própria campanha, adicionar vista read-only. Caso contrário, documentar que é intencional. |
| **Esforço estimado** | 1h se decidido implementar |
| **Bloqueia campanha?** | Não |

---

### DT-09 — Warm-up progressivo não implementado

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Baixa |
| **Descrição** | O wizard permite definir `rate_limit_por_minuto` (default 80), mas não há warm-up progressivo (ex: 20/min na primeira hora, 40/min na segunda, depois 80). Contas novas no WhatsApp Business têm limites progressivos impostos pela Meta. Enviar 80/min imediatamente pode causar bloqueio de conta. |
| **Solução proposta** | Adicionar campo `warm_up` ao wizard (boolean). Se ativado, calcular schedule progressivo e aplicar delay dinâmico nas primeiras N mensagens da Edge Function. |
| **Esforço estimado** | 3h |
| **Bloqueia campanha?** | Não tecnicamente. Risco de bloqueio de conta em contas novas. |

---

## Dívidas transversais (todas as etapas)

### DT-10 — Migrations SQL não versionadas (geral)

Ver DT-01. Afeta todas as etapas, não apenas Etapa 11.

### DT-11 — Tags quebradas no sync offline

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Alta |
| **Descrição** | `lib/db.ts`: `ContatoPendente` tem campo `tags: string[]`, mas `sincronizar()` não insere em `contact_tags`. Tags de contatos cadastrados offline nunca chegam ao banco. |
| **Solução proposta** | Em `sincronizar()`, após inserir o contato, chamar `salvarContactTags(contactId, pendente.tags, workspaceId)`. A função `salvarContactTags` já existe em `db.ts`. |
| **Esforço estimado** | 30min |
| **Bloqueia campanha?** | Não diretamente. Impacta filtros por tag em campanhas para contatos cadastrados offline. |

### DT-12 — Google OAuth não configurado (duas features)

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Descrição** | Importação de Google Contatos (Etapa 5) e Google Calendar (Etapa 8) requerem provider Google habilitado no Supabase Dashboard. O código está implementado, mas o provider não foi configurado. |
| **Solução proposta** | Supabase Dashboard → Authentication → Providers → Google → habilitar com Client ID/Secret do Google Cloud Console (scopes: `contacts.readonly` + `calendar.readonly`). |
| **Esforço estimado** | 1h (configuração, sem código) |
| **Bloqueia campanha?** | Não |

### DT-13 — Etapas 6 e 10 com zero implementação

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Descrição** | Etapa 6 (exportação XLSX/CSV) e Etapa 10 (mapa de calor Leaflet): código zero. `xlsx` instalado mas nunca usado para escrita. `leaflet` nem instalado. |
| **Solução proposta** | Etapa 6: `XLSX.utils.json_to_sheet()` em `Contatos.tsx`, já tem a lib. Etapa 10: instalar `leaflet` + `react-leaflet` + `leaflet.heat`. |
| **Esforço estimado** | 4h (Etapa 6: 2h, Etapa 10: 4–6h) |
| **Bloqueia campanha?** | Não |
