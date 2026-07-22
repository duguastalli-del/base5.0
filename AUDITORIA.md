# Auditoria de Arquitetura — Base 5.0

**Data:** 2026-06-15
**Método:** leitura de todos os arquivos-fonte do repositório, conferidos contra o Prompt Mestre V3.

> ⚠️ **Limite desta auditoria:** o repositório **não contém os arquivos `.sql`**. Todo o backend (tabelas, RLS, triggers, funções, Storage) foi aplicado direto no Supabase. Portanto, para o que é schema/RLS/trigger/função eu só confirmo o que o **frontend realmente chama**. Onde digo "não verificável", significa: precisa abrir o Supabase ou versionar os SQLs no repo.

---

## Seção 1 — Stack obrigatória

| Item | Status | Onde está | Observação / divergência |
|------|--------|-----------|--------------------------|
| React + Vite + TS + Tailwind | ✅ | `package.json`, `vite.config.ts`, `tailwind.config.js` | OK |
| PWA instalável | ✅ | `vite.config.ts` (VitePWA, manifest, autoUpdate) | OK |
| React Query | ⏳ Pendente | — | **Não instalado.** Fetch com `useEffect` + `supabase` cru em cada página |
| React Hook Form | ⏳ Pendente | — | **Não instalado.** Formulários usam `useState` manual |
| Zod | ⏳ Pendente | — | **Não instalado** como dep direta (só transitivo). Validação manual via `if` |
| Supabase (Auth/PG/RLS/Storage) | ✅ | `lib/supabase.ts`; Storage em `Templates.tsx` | OK |
| Supabase Realtime | ⏳ Pendente | — | Nenhum `.channel()`. Previsto Etapa 8 |
| Offline IndexedDB via Dexie | 🟡 Parcial | `lib/db.ts` | Store chama-se `fila`, não `sync_queue`. Só cobre criação de contato |
| Mapas Leaflet + OSM | ⏳ Pendente | — | Não instalado. Etapa 10 |
| SheetJS (xlsx) | ✅ | `package.json`, `ModalImportar.tsx` | OK |
| FullCalendar | ⏳ Pendente | — | Não instalado. Etapa 8 |
| Recharts | ⚠️ Divergente | `Inicio.tsx` | Gráfico "por cidade" feito com divs/CSS, não Recharts |
| Compatível com Capacitor | 🟡 Parcial | — | Estrutura React/Vite compatível, mas nada de Capacitor configurado |

---

## Seção 2 — RBAC (4 papéis)

**Todas as checagens de permissão no frontend (apenas estas 4):**

| Local | Linha | Regra | Gate |
|-------|-------|-------|------|
| `Inicio.tsx` | 80 | `perfil.papel === "administrador"` | painel de convite só admin |
| `Contatos.tsx` | 21 | `podeImportar = administrador \|\| coordenador` | botão importar |
| `Templates.tsx` | 25 | `podeEditar = administrador \|\| coordenador` | criar/editar/excluir template |
| `Envio.tsx` | 36-37 | `podeGerenciar` e `podeVerTodos = administrador \|\| coordenador` | gerenciar templates + ver fila de todos |

**Veredito por papel:**

| Papel | Projetado | Implementado | Status |
|-------|-----------|--------------|--------|
| administrador | acesso total + convidar + exportar + anonimizar | convida ✅; exportar/anonimizar ⏳ não existem | 🟡 |
| coordenador | sua região + exporta região + templates | gerencia templates ✅; "sua região" e exportar ⏳ não existem | 🟡 |
| assessor | cadastra/vê/edita só o que criou | cadastra ✅; editar ⏳ não existe | 🟡 |
| voluntario | cadastra/vê só o que criou, não exporta | cadastra ✅ | 🟡 |

**Divergências concretas:**

1. **Assessor e voluntário são idênticos no frontend.** Nenhuma checagem distingue os dois (editar e exportar não existem).
2. **`podeVerTodos` (Envio:81) é a única aplicação de "ver só o que criou"** — adiciona `.eq("criado_por", perfil.id)` quando não é admin/coord. Mas **`Contatos.tsx:25` busca a base inteira sem filtrar `criado_por`** — confia 100% no RLS. Não verificável pelo repo.
3. Toda checagem é cosmética (esconde botão). Segurança real depende do RLS, que não está versionado.

---

## Seção 3 — Roadmap 10 etapas

| Etapa | Status | Onde / lacuna específica |
|-------|--------|--------------------------|
| 1 — Banco/RLS/LGPD | ❓ Não verificável | Frontend consome `profiles`, `contacts`, RPCs `meu_workspace`/`ver_convite`/`criar_convite`/`painel_resumo`, views `v_contatos_por_cidade`/`v_ranking_cadastradores`. Schema não versionado |
| 2 — Auth + convites | ✅ | `Entrar/CriarCampanha/Convite/RedefinirSenha` + `CampoSenha`. Completo |
| 3 — Cadastro offline + 5 abas | ✅ | `NovoContato`, `App.tsx`, `db.ts` |
| 4 — Base completa | 🟡 | `Contatos.tsx`: busca, filtro cidade, cards. **Faltam:** filtro bairro, filtro tag, editar, arquivar, anonimizar, excluir (código admite em `Contatos.tsx:107`) |
| 5 — Importação | 🟡 | `ModalImportar.tsx`: XLSX ✅, dedup ✅, selecionar todos ✅, registro `imports` ✅, fallback iOS ✅. **Google OAuth bloqueado** (provider não habilitado). Agenda: Contact Picker API só, sem `Capacitor.Contacts` |
| 6 — Exportação + auditoria | ⏳ | Inexistente |
| 7 — WhatsApp + templates + mídia | ✅ | `Envio.tsx`, `Templates.tsx`: normal+optin, `{nome}/{regiao}`, mídia via Storage, Web Share+fallback, `send_logs` |
| 8 — Agenda/realtime/GCal/push | ⏳ | `App.tsx:75` é placeholder de texto |
| 9 — Dashboard | 🟡 | `Inicio.tsx`: 4 cartões ✅, por-cidade (barras CSS) ✅, ranking ✅. **Faltam:** evolução diária, envios por dia, mapa de calor estilizado |
| 10 — Mapa de calor | ⏳ | Inexistente |

---

## Seção 4 — Regras inegociáveis

| # | Regra | Garantida? | Evidência exata |
|---|-------|-----------|-----------------|
| 1 | Nada vaza entre workspaces (RLS testado) | ❓ Não verificável | Frontend nunca filtra `workspace_id` na leitura (`Contatos.tsx:25`, `Envio.tsx:75`). Depende do RLS. Testes não no repo |
| 2 | Sem `consent='sim'` não entra em fila normal | ✅ Garantida | `Envio.tsx:79-80`: modo normal força `.eq("consent","sim").eq("status","ativo")` |
| 3 | Importados entram `consent='pendente'` | ✅ Garantida | `ModalImportar.tsx:197` insert com `consent:"pendente"` fixo |
| 4 | Telefones sempre E.164 | 🟡 Parcial | `format.ts:11` `paraE164` prefixa `+55` mas não valida tamanho (validado antes em `NovoContato.tsx:39`). `normalizarImportado` (import) é rigoroso |
| 5 | Export/exclusão/anonimização → `audit_logs` | ❓ Não verificável | Essas ações não existem no front. Nada registrado por elas hoje |
| 6 | Cidade obrigatória, bairro opcional c/ autocomplete | ✅ Garantida | `NovoContato.tsx:40` valida cidade; bairro é `datalist` (136-142) que aprende da base |
| 7 | Dedup por celular no workspace | 🟡 Parcial | `ModalImportar.tsx:48-52` pré-checa (query `limit(5000)`, sem filtro workspace); criação trata `23505` (`NovoContato.tsx:58`, `db.ts:50`). Escopo da constraint não verificável |

---

## Seção 5 — Personalização por cliente (SaaS)

**`workspace_settings` NÃO é usado no frontend. Tudo hardcoded.**

| Evidência | Local |
|-----------|-------|
| Nenhuma query a `workspace_settings` | grep no `src/`: zero ocorrências |
| Cores fixas | `tailwind.config.js:4-8` — `marca: "#0E5E6F"` estático |
| Logo fixo "B5" | `App.tsx:57`, `Entrar.tsx:41` e telas de auth |
| Nome fixo "Base 5.0" | `App.tsx:59` |
| `nome_candidato`/`nome_gabinete`/`logo_url`/`cor_primaria`/`cor_secundaria` | nunca consumidos |

**Veredito:** ⚠️ Divergente / **0% implementado**. Mesmo que a tabela exista no banco, o app não lê nenhum campo. Bloqueio para o modelo white-label.

---

## Seção 6 — Offline-first

| Pergunta | Resposta | Evidência |
|----------|----------|-----------|
| Nome real do store | **`fila`** (não `sync_queue`); DB `base50` | `db.ts:22` `this.version(1).stores({ fila: "++id, celular_e164" })` |
| Contador "N pendentes" | `pendentes()` faz `db.fila.count()` (`db.ts:29`); exibido em `NovoContato.tsx:87`; recalcula no `useEffect [salvo]` (21) e após sync | — |
| Sync automático ao voltar online | ✅ | `App.tsx:33-40`: listener `online` + chamada no mount; só sincroniza se `pendentes() > 0` |
| Sync manual | ✅ "Sincronizar agora" | `NovoContato.tsx:70-74` |

**Limitações concretas:**

1. Cobertura: só criação de contato.
2. **Tags são perdidas no sync.** `ContatoPendente` guarda `tags` (`db.ts:15`), mas `sincronizar()` (`db.ts:38-48`) não as insere — e o insert online (`NovoContato.tsx:54`) também omite. Tags nunca chegam ao banco.
3. Contador pode ficar defasado entre abas (atualiza no re-render).
4. `origem` é gravada no offline (`db.ts:43`); só tags se perdem.

---

## Seção 7 — Auditoria (`audit_logs`)

**O frontend NUNCA escreve em `audit_logs`. Cobertura pela aplicação = 0.**

| Ação projetada | Registrada pelo front? | Onde |
|----------------|------------------------|------|
| login / logout | ❌ | — |
| criar contato | ❌ em audit_logs | insert direto em `contacts`, sem log |
| editar | ❌ | edição não existe |
| exportar | ❌ | export não existe |
| importar | 🟡 grava em **`imports`** | `ModalImportar.tsx:206` (try/catch não-fatal) |
| convite | 🟡 via RPC `criar_convite` | `Inicio.tsx:25` |
| anonimizar | ❌ | não existe no front |
| envio WhatsApp | 🟡 grava em **`send_logs`** | `Envio.tsx:143` |

**Veredito:** alimenta `imports` e `send_logs`, mas **nenhuma `audit_logs` unificada**. Se populada, só por triggers no banco (não verificável). Campos `ip`/`detalhes`/`entidade` não são enviados pelo front; `ip` exigiria captura server-side.

---

## A) Top 3 lacunas críticas para o MVP

1. **Etapa 4 (gestão de contatos) inexistente** — sem editar/arquivar/excluir/anonimizar e sem filtro bairro/tag. Função-núcleo de CRM; sem anonimização, a promessa LGPD art. 18 não se cumpre pelo app.
2. **Personalização SaaS em 0%** — nome, logo e cores fixos. Bloqueio comercial do white-label.
3. **Tags quebradas de ponta a ponta** — usuário marca, somem (nunca vão ao banco), filtro de tags no Envio é só visual.

## B) Top 3 dívidas técnicas antes da Fase 3 (lojas)

1. **Versionar os SQLs no repositório.** Backend é caixa-preta fora do Git: impossível auditar RLS/isolamento (regra nº1), reproduzir ambiente ou revisar trilha LGPD.
2. **Camada de dados ad-hoc (sem React Query/Zod).** Fetch cru no `useEffect` em cada tela; uma query com campo `null` derrubou o app duas vezes. Cache/retry/validação cortariam essa classe de bug.
3. **ErrorBoundary permanente ausente.** Um `.replace` em `undefined` zerou o app para todos. Antes de empacotar em loja, é essencial fallback amigável + log.

## C) Feito melhor/diferente do projetado — e por quê

- **Autocomplete de bairro que aprende da base** (`NovoContato.tsx:24-31`): consulta bairros reais já cadastrados na cidade do workspace, em vez de lista fixa.
- **Tratamento de erros de Auth acima do spec** (`Entrar`/`CriarCampanha`/`Convite`): distingue e-mail não confirmado, conta já existente (truque `identities.length===0`) e senha fraca.
- **Gráfico por cidade em CSS, não Recharts** (`Inicio.tsx:53-63`): divergência consciente para não adicionar dependência num gráfico simples. Precisará de Recharts na Etapa 9.
- **Fallback de mídia iOS** (`Envio.tsx:123-145`): Web Share API Level 2 + download automático com instrução quando o share de arquivos não é suportado.

---

*Nenhum código foi alterado nesta auditoria. Os pontos "❓ não verificável" (Seções 1-banco, 4 e 7) só fecham com os arquivos `.sql` versionados no repo.*
