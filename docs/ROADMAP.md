# ROADMAP — Base 5.0

**Última atualização:** 2026-06-19
**Método:** leitura direta dos arquivos-fonte do repositório (não memória de sessão).

> ⚠️ O repositório **não contém arquivos `.sql`**. Todo o backend (tabelas, RLS, triggers, funções, views) foi aplicado diretamente no Supabase. O estado de "em produção" para o banco só pode ser verificado abrindo o Supabase Dashboard — não pelo repo.

---

## Estado por etapa

| # | Etapa | Status | Evidência no repo |
|---|-------|--------|-------------------|
| 1 | Banco + RLS + LGPD | ❓ Não versionado | Sem `.sql`. Frontend consome `profiles`, `contacts`, `tags`, `contact_tags`, `message_templates`, `send_logs`, `imports`, `audit_logs`, RPCs `meu_workspace`, `painel_resumo`, `criar_convite`, `ver_convite`, `incrementar_disparo_contador`, views `v_contatos_por_cidade`, `v_ranking_cadastradores`. Schema não verificável pelo repo. |
| 2 | Auth + convites + trigger | ✅ Completo | `Entrar.tsx`, `CriarCampanha.tsx` (signUp com `workspace_nome`), `Convite.tsx`, `RedefinirSenha.tsx`, `CampoSenha.tsx`. Validado em produção. |
| 3 | Cadastro offline Dexie | 🟡 Parcial | `lib/db.ts`: store `fila`, `sincronizar()`, `pendentes()`. `NovoContato.tsx`: offline badge, sync manual. **Bug conhecido:** tags não persistem no sync offline (campo `tags` guardado no Dexie mas não inserido em `contact_tags` no `sincronizar()`). |
| 4 | Gestão completa de contatos | ✅ Completo | `Contatos.tsx` (271 linhas), `DetalheContato.tsx` (editar/arquivar/excluir/anonimizar). Commit `70a6e1d` (2026-06-16). `DetalheContato.tsx` escreve em `audit_logs` nas ações destrutivas. |
| 5 | Importação XLSX + Google Contatos | 🟡 Parcial | `ModalImportar.tsx`: XLSX (`xlsx` instalado) ✅; Google OAuth (`supabase.auth.signInWithOAuth` com scope `contacts.readonly` + People API) implementado mas **bloqueado** — provider Google não habilitado no Supabase Dashboard. Agenda (Contact Picker API iOS): não implementada, tem aviso de fallback. |
| 6 | Exportação XLSX/CSV | ⛔ Zero | Nenhum arquivo implementa exportação. `xlsx` está instalado mas nunca chamado para escrita. |
| 7 | WhatsApp assistido + listas transmissão | ✅ Completo | `Envio.tsx` (397 linhas): modo normal + opt-in + lista, templates `{nome}/{regiao}`, mídia via Storage, Web Share + fallback. `EnvioLista.tsx`: lista de transmissão. `send_logs` escritos. |
| 8 | Agenda FullCalendar + Realtime + Push | 🟡 Parcial | `Agenda.tsx` (196 linhas): FullCalendar (daygrid + list + interaction), Supabase Realtime via `supabase.channel()`, Notifications API para push. **Google Calendar:** botão "em breve" presente, OAuth não implementado. |
| 9 | Dashboard | 🟡 Parcial | `Inicio.tsx` (111 linhas): 4 cards KPI, barras por cidade (CSS puro, sem Recharts), ranking de cadastradores. RPCs e views do banco. **Faltam:** Recharts para séries temporais, evolução diária de cadastros, envios por dia. |
| 10 | Mapa de calor Leaflet | ⛔ Zero | `leaflet` não instalado. Nenhum componente de mapa no código. |
| 11 | WhatsApp Business API (campanhas) | 🟡 Código pronto, deploy pendente | Ver `docs/AUDITORIA_ETAPA_11.md` para detalhes completos. |

---

## Pendências transversais

### Supabase Management API (bug ativo)
- **Projeto:** `mdkinyexgzekrraftwqx` (us-west-2)
- **Sintoma:** `GET /v1/projects/{ref}/*` retorna 404 para todos os endpoints específicos de projeto
- **Impacto:** deploy de Edge Functions via CLI (`supabase functions deploy`) e GitHub Actions bloqueado
- **Workaround:** deploy manual via Dashboard (arquivos standalone em `supabase/functions-standalone/`)
- **Resolução:** aguardando ticket de suporte Supabase

### Migrations SQL não versionadas
- Todo o schema existe apenas no banco de produção
- Não há `supabase/migrations/` no repositório
- Risco: qualquer reset de projeto ou auditoria de RLS requer acesso ao Dashboard
- Solução: `supabase db dump --schema public > supabase/schema.sql` + versionamento

### Google OAuth (dois lugares)
- **Importação de Contatos (Etapa 5):** `supabase.auth.signInWithOAuth` com scope Google Contacts — requer provider Google habilitado no Supabase Dashboard
- **Google Calendar (Etapa 8):** botão "em breve" — requer scope `calendar.readonly` no mesmo provider
- Ambos desbloqueados com a mesma configuração no Supabase Dashboard → Authentication → Providers → Google

### Capacitor (deploy em loja)
- Estrutura React/Vite é compatível
- `@capacitor/core` não instalado
- Sem `capacitor.config.ts`
- Sem `android/` ou `ios/` na raiz
- Para ir à Play Store/App Store: `npm install @capacitor/core @capacitor/cli && npx cap init`

### React Query / Zod / React Hook Form
- Não instalados. Formulários usam `useState` manual; fetch cru em `useEffect`
- Dois crashes por `.replace()` em `null` ocorreram (patches aplicados com `?? ""`)
- Antes de produção em escala, a camada de dados deveria ser migrada

---

## Dívidas técnicas da Etapa 11

Ver `docs/BACKLOG.md` para detalhes com severidade, solução proposta e esforço.

| # | Dívida | Bloqueia campanha? |
|---|--------|--------------------|
| 1 | Migrations SQL não versionadas | Não |
| 2 | Deploy Edge Functions bloqueado (bug Supabase) | **SIM** |
| 3 | Sync reverso de status de template não implementado | Não |
| 4 | Disparo em status `enviando` orfão (sem recovery) | Não (risco pós-deploy) |
| 5 | Pausa real de campanha não implementável sem queue | Não (limitação arquitetural) |
| 6 | Cancelar/exportar respostas ausentes na UI | Não |
| 7 | Audit logs de ações WhatsApp não escritos | Não |
| 8 | Assessor/voluntário sem acesso às telas WA (intencional?) | Não |
| 9 | Warm-up progressivo não implementado | Não |
