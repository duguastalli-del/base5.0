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

*Arquivo atualizado em: 2026-06-19*
