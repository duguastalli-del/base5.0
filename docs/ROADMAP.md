# ROADMAP — Base 5.0

**Última atualização:** 2026-06-20
**Método:** leitura direta dos arquivos-fonte do repositório (não memória de sessão).

> ⚠️ O repositório **não contém arquivos `.sql`**. Todo o backend (tabelas, RLS, triggers, funções, views) foi aplicado diretamente no Supabase. O estado de "em produção" para o banco só pode ser verificado abrindo o Supabase Dashboard — não pelo repo.

---

## Estado por etapa

| # | Etapa | Status | Evidência no repo |
|---|-------|--------|-------------------|
| 1 | Banco + RLS + LGPD | ❓ Não versionado | Sem `.sql`. Frontend consome `profiles`, `contacts`, `tags`, `contact_tags`, `message_templates`, `send_logs`, `imports`, `audit_logs`, RPCs `meu_workspace`, `painel_resumo`, `criar_convite`, `ver_convite`, `incrementar_disparo_contador`, views `v_contatos_por_cidade`, `v_ranking_cadastradores`. Schema não verificável pelo repo. |
| 2 | Auth + convites + trigger | ✅ Completo | `Entrar.tsx`, `CriarCampanha.tsx` (signUp com `workspace_nome`), `Convite.tsx`, `RedefinirSenha.tsx`, `CampoSenha.tsx`. Validado em produção. |
| 3 | Cadastro offline Dexie | ✅ Completo | `lib/db.ts`: store `fila`, `sincronizar()`, `pendentes()`, `salvarContactTags()`. `NovoContato.tsx`: offline badge, sync manual. **Bug de tags corrigido** em commit `5f5c428` (2026-06-15) — `sincronizar()` agora salva tags em `contact_tags` após sync. Ver `docs/BUGS_RESOLVIDOS.md#BUG-01`. |
| 4 | Gestão completa de contatos | ✅ Completo | `Contatos.tsx` (271 linhas), `DetalheContato.tsx` (editar/arquivar/excluir/anonimizar). Commit `70a6e1d` (2026-06-16). `DetalheContato.tsx` escreve em `audit_logs` nas ações destrutivas. |
| 5 | Importação XLSX + Google Contatos | 🟡 Parcial | `ModalImportar.tsx`: XLSX (`xlsx` instalado) ✅; Google OAuth (`supabase.auth.signInWithOAuth` com scope `contacts.readonly` + People API) implementado mas **bloqueado** — provider Google não habilitado no Supabase Dashboard. Agenda (Contact Picker API iOS): não implementada, tem aviso de fallback. |
| 6 | Exportação XLSX/CSV | ✅ Completo | `src/components/ExportarContatos.tsx` (240 linhas). `Contatos.tsx`: botão "Exportar" para admin/coordenador. Formato xlsx ou csv, seleção de colunas, escopo (filtrado ou todos do workspace), coluna Tags, resolve criado_por → nome do perfil, audit log. Commit `1bdd407` (2026-06-19). |
| 7 | WhatsApp assistido + listas transmissão | ✅ Completo | `Envio.tsx` (397 linhas): modo normal + opt-in + lista, templates `{nome}/{regiao}`, mídia via Storage, Web Share + fallback. `EnvioLista.tsx`: lista de transmissão. `send_logs` escritos. |
| 8 | Agenda FullCalendar + Realtime + Push | 🟡 Parcial | `Agenda.tsx` (196 linhas): FullCalendar (daygrid + list + interaction), Supabase Realtime via `supabase.channel()`, Notifications API para push. **Google Calendar:** botão "em breve" presente, OAuth não implementado. |
| 9 | Dashboard | ✅ Completo | `Inicio.tsx` reescrito com Recharts. Filtros globais (período 7d/30d/90d/12m, cidade, origem). KPIs com delta vs período anterior + seta de variação. 4 gráficos: EvolucaoContatos (LineChart), FunilCampanha (BarChart horizontal), DistribuicaoOrigem (PieChart rosca), TopBairros (BarChart vertical toggle 10/20). PDF export via html2canvas+jsPDF. Audit logs: consulta_dashboard, exportar_dashboard_pdf. Commits `64add2b` + `dff2348`. |
| 10 | Mapa de calor Leaflet | ✅ Completo | `src/pages/MapaCalor.tsx` + react-leaflet v5 + leaflet.heat. Geocodificação via Nominatim com cache em localStorage (1 req/s). Toggle calor/pontos. Filtros: consentimento, origem. Painel de estatísticas: top 5 bairros (clicáveis → flyTo), top 5 cidades, % sem localização. Botão "Mapa" no header (admin/coord). Commit `1f4a50c`. |
| 11 | WhatsApp Business API (campanhas) | 🟡 Código pronto, deploy pendente | Ver `docs/AUDITORIA_ETAPA_11.md` para detalhes completos. |

---

## Pendências transversais

### Supabase Management API (bug ativo)
- **Projeto:** `mdkinyexgzekrraftwqx` (us-west-2)
- **Sintoma:** `GET /v1/projects/{ref}/*` retorna 404 para todos os endpoints específicos de projeto
- **Impacto:** deploy de Edge Functions via CLI (`supabase functions deploy`) e GitHub Actions bloqueado
- **Workaround:** deploy manual via Dashboard (arquivos standalone em `supabase/functions-standalone/`)
- **Resolução:** aguardando ticket de suporte Supabase

### Migrations SQL não versionadas (parcialmente resolvido)
- Migrations 000001–000008 estão na branch `claude/dreamy-johnson-seqpv1` (não mergeada)
- Migration 000009 (`workspace_settings`) está no `main` como arquivo SQL versionado
- Schema ainda não aplicado via CLI (bug Supabase MCP + Management API bloqueado)
- Risco: qualquer reset de projeto requer aplicação manual das migrations

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

## Transição Multi-Vertical

**Início:** 2026-06-20 · **Cliente piloto:** Antoniassi 2026 (vertical: `politica`)

| Fase | Status | O que foi feito |
|---|---|---|
| V1 — Fundação técnica | ✅ Completo (2026-06-20) | `workspace_settings` (migration 000009, RLS, retrocompat.) · `src/lib/terminologia.ts` (8 verticais) · `src/contexts/TerminologiaContext.tsx` (hook + cache + fallback) · 4 telas adaptadas: Contatos, Inicio, Envio, NovoContato + Shell h1s |
| V2 — Todas as telas | ⬜ Pendente | Adaptar telas restantes (DetalheContato, ExportarContatos, ModalImportar, EnvioLista, Agenda, MapaCalor, PDF export) · TAGS e ORIGENS padrão por vertical |
| V3 — Onboarding visual | ⬜ Pendente | Tela de escolha de vertical ao criar workspace · UI de vocabulário customizado · Cores por vertical |
| V4 — Capacitor + Lojas | ⬜ Pendente | Google Play + App Store · Primeiro cliente não-político em produção |

Ver `docs/MULTI_VERTICAL.md` para documentação completa.

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
| 7 | ~~Audit logs de ações WhatsApp~~ ✅ Parcialmente resolvido | Não |
| 8 | Assessor/voluntário sem acesso às telas WA (intencional?) | Não |
| 9 | Warm-up progressivo não implementado | Não |
