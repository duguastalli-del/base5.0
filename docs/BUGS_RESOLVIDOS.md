# Bugs Resolvidos — Base 5.0

Registro histórico de bugs confirmados e corrigidos. Data de cada entrada = data da correção.

---

## BUG-01 — Tags de cadastros offline não persistiam ao sincronizar (Etapa 3)

**Data da correção:** 2026-06-15
**Commit de correção:** `5f5c428` — "fix: tags persistindo no banco (online + offline) + filtros funcionais"
**Identificado por:** auditoria de código em 2026-06-15 (AUDITORIA.md)
**Tempo em produção antes da correção:** ~3 dias (introduzido no commit inicial da Etapa 3, `711a83d` em 2026-06-12)

### Descrição

O campo `tags: string[]` existia na interface `ContatoPendente` no IndexedDB (Dexie) e era preenchido corretamente pelo formulário `NovoContato.tsx` no modo offline. Porém:

1. A função `sincronizar()` em `src/lib/db.ts` não chamava nenhuma função para inserir essas tags em `contact_tags` após sincronizar o contato com o Supabase.
2. O caminho online em `NovoContato.tsx` também não salvava as tags — o insert em `contacts` retornava sem ID, impedindo a associação.

**Resultado:** tags de contatos cadastrados sem internet eram silenciosamente perdidas ao sincronizar. Cadastros feitos com internet também perdiam as tags.

### O que foi corrigido

**`src/lib/db.ts`:**
- Criada função `salvarContactTags(contactId, tagNames, workspaceId)`:
  - Faz lookup das tags existentes no workspace (case-insensitive)
  - Cria novas tags que não existirem
  - Faz `upsert` em `contact_tags` com `ignoreDuplicates: true`
- `sincronizar()` alterada para usar `.select("id").single()` e chamar `salvarContactTags` após inserir o contato

**`src/pages/NovoContato.tsx`:**
- Insert online alterado para `.select("id").single()`
- Após obter o `contactData.id`, chama `salvarContactTags`

### Impacto residual

Contatos cadastrados offline **antes da correção** (entre 2026-06-12 e 2026-06-15) que foram sincronizados nesse período perderam suas tags permanentemente. Esses dados não são recuperáveis sem inventário manual.

Contatos offline **que ainda estavam na fila** (não sincronizados) no momento do deploy da correção tiveram suas tags salvas corretamente na próxima sincronização.

### Teste manual recomendado (para validação em produção)

1. Ative o modo avião no celular
2. Abra o app e cadastre um novo contato com 2 ou mais tags selecionadas
3. Verifique que aparece o banner "1 registro aguardando sincronizar"
4. Reative a internet e toque em "Sincronizar agora"
5. Vá em Contatos → busque o contato criado → confirme que as tags aparecem no card
6. Opcional: abra o Supabase → Table Editor → `contact_tags` e verifique a linha com o `contact_id` do novo contato

---

## BUG-02 — Crash por `.replace()` em campo null do banco (transversal)

**Data da correção:** 2026-06-15
**Commit de correção:** `297a339` — "fix: null safety em replace() — previne crash quando campo do banco é null/undefined"
**Identificado por:** crash em produção reportado pelo usuário
**Tempo em produção:** desconhecido (introduzido em etapas anteriores)

### Descrição

Chamadas `.replace()` diretas em strings que poderiam ser `null` ou `undefined` causavam crash silencioso na tela, zerando a UI para o usuário sem mensagem de erro.

Exemplo:
```ts
// ANTES (crashava)
celular_e164.replace("+55", "")

// DEPOIS (safe)
(celular_e164 ?? "").replace("+55", "")
```

### O que foi corrigido

Aplicado padrão `(valor ?? "").metodo()` em todos os pontos onde campos do banco (potencialmente null) eram usados com métodos de string. Adicionado `ErrorBoundary` temporário para expor o erro na tela durante diagnóstico (removido após fix).

### Padrão adotado a partir daí

Todo o código produzido após esta correção segue NULL safety explícita:
- Strings: `(x ?? "").metodo()`
- Arrays: `(lista ?? []).map()`
- Objetos: `objeto?.campo`

---

## BUG-03 — Tela Envio em branco (Map/Set incompatíveis + nested select)

**Data da correção:** 2026-06-15
**Commit de correção:** `88203e7` — "fix: tela Envio em branco — substituir Map/Set por Record/array, remover nested select contact_tags"
**Identificado por:** usuário relatou tela branca ao abrir aba Envio

### Descrição

Dois problemas simultâneos zeravam a tela Envio.tsx:

1. Uso de `Map` e `Set` do JavaScript em contexto que não serializava corretamente para o estado React
2. Query com nested select em `contact_tags` gerava erro no Supabase (política de RLS ou sintaxe incompatível)

### O que foi corrigido

- Substituído `Map<>` por `Record<string, T>` e `Set<>` por array com dedup manual
- Query de tags separada em duas etapas: fetch `contact_tags` + fetch `tags`, join em memória

---

## BUG-04 — Botão "Exportar" não aparecia na tela Contatos em produção

**Data da correção:** 2026-06-19
**Commit de correção:** (ver abaixo) — "fix: botão Exportar agora aparece em Contatos para admin/coord (BUG-04)"
**Identificado por:** Eduardo ao validar em produção (base5-0.vercel.app)

### Descrição

O botão "Exportar" foi implementado corretamente na sessão anterior (commit `1bdd407`). O JSX, o estado `exportar`, a constante `podeExportar` e o import de `ExportarContatos` estavam todos presentes e corretos em `src/pages/Contatos.tsx`. **O código nunca foi o problema.**

### Causa raiz real

O deploy no Vercel estava **travado na versão anterior a `1bdd407`** porque todos os commits subsequentes quebraram o build. O `npm run build` (`tsc -b && vite build`) falhava com **13 erros TypeScript** que foram introduzidos na mesma sessão do `1bdd407` (sessão autônoma de madrugada 19/jun):

1. **`Property 'catch' does not exist on type 'PostgrestFilterBuilder'` (8 ocorrências):**
   Todos os audit logs adicionados na sessão usavam `.catch(() => {})` diretamente no retorno de `supabase.from(...).insert({})`. O tipo `PostgrestFilterBuilder` do Supabase implementa `PromiseLike` (tem `.then()`), mas **não** expõe `.catch()` nos tipos TypeScript. Isso é pego pelo compilador `tsc -b` mas NÃO pelo `npx tsc --noEmit`, porque `tsc -b` (build mode) usa `tsconfig.app.json` que tem `noUnusedLocals: true` e tipo mais estrito.

2. **`noUnusedLocals` violations (5 ocorrências):**
   - `MapPin` importado em `Inicio.tsx` mas não usado no JSX refatorado
   - `dataFim` como parâmetro em `periodoInicio()` declarado mas nunca lido no corpo
   - `useCallback` importado em `MapaCalor.tsx` mas não utilizado
   - `tagsDisp/setTagsDisp` declarado mas nunca lido fora do setter
   - `tagsFiltro/setTagsFiltro` declarado mas nunca usado no filtro

### O que foi corrigido

**Em `src/pages/Inicio.tsx`:**
- Removido `MapPin` do import de lucide-react (linha ~4)
- Removido parâmetro `dataFim` de `periodoInicio()` — não era usado no corpo (linha ~36)
- Corrigido call: `periodoInicio(periodo, dataInicio)` em vez de com `dataFim`
- Substituído `.catch(() => {})` por `.then(undefined, () => {})` (2 ocorrências)

**Em `src/pages/MapaCalor.tsx`:**
- Removido `useCallback` do import React
- Removido estado `tagsDisp/setTagsDisp` e a query de tags (não usados no filtro)
- Removido estado `tagsFiltro/setTagsFiltro` (declarado mas não conectado ao filtro)
- Removida interface `TagItem` que ficou órfã
- Substituído `.catch(() => {})` por `.then(undefined, () => {})`

**Em `src/components/ExportarContatos.tsx`, `src/pages/WhatsAppCampanhas.tsx`, `src/pages/WhatsAppConfig.tsx`, `src/pages/WhatsAppTemplates.tsx`:**
- Substituído `.catch(() => {})` por `.then(undefined, () => {})` (1-2 ocorrências cada)

### Por que `npx tsc --noEmit` não pegou esses erros antes

`npx tsc --noEmit` (sem `-b`) não usa o modo de build composto. Ele provavelmente não estava executando com as opções de `tsconfig.app.json` (que tem `noUnusedLocals: true`). O `npm run build` usa `tsc -b` que processa o grafo de referências e usa as configurações corretas.

**Lição:** Antes de cada push, rodar `npm run build` (não apenas `tsc --noEmit`) para garantir que o build completo de produção passe. Validação visual em produção após cada feature também é obrigatória.

### Arquivo alterado com mais impacto

`src/pages/Inicio.tsx` — ~5 linhas. `src/pages/MapaCalor.tsx` — ~8 linhas. Os WhatsApp files foram mudados apenas na linha `.catch()`.

---

*Arquivo atualizado em: 2026-06-19*
