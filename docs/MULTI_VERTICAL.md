# Multi-Vertical — Base 5.0

**Última atualização:** 2026-06-20

Base 5.0 é um CRM mobile-first de captação em campo. O sistema multi-vertical permite que cada workspace adapte a terminologia da interface ao contexto do seu negócio, sem alterar as funcionalidades core.

---

## O que é "vertical"

Um vertical é o segmento de atuação do workspace. Ele determina qual vocabulário é usado em toda a interface: como os contatos são chamados ("Apoiador", "Cliente", "Membro"...), como o captador é chamado ("Voluntário", "Corretor"...) e como a operação é nomeada ("Campanha", "Captação", "Ação Pastoral"...).

O vertical é armazenado em `workspace_settings.vertical` e pode ser sobrescrito por termos personalizados via `workspace_settings.vocabulario` (jsonb).

---

## Os 8 verticais suportados (V1)

| Vertical | contato | contatos | novo_contato | base_contatos | captador | operacao |
|---|---|---|---|---|---|---|
| `politica` | Apoiador | Apoiadores | Novo Apoiador | Base de Apoiadores | Voluntário | Campanha |
| `religioso` | Membro | Membros | Novo Membro | Comunidade | Liderança | Ação Pastoral |
| `imobiliario` | Lead | Leads | Novo Lead | Pipeline | Corretor | Captação |
| `varejo` | Cliente | Clientes | Novo Cliente | Base de Clientes | Vendedor | Promoção |
| `pesquisa` | Pesquisado | Pesquisados | Novo Pesquisado | Amostra | Pesquisador | Pesquisa |
| `publicidade` | Lead | Leads | Novo Lead | Base | Agente | Ativação |
| `ong` | Apoiador | Apoiadores | Novo Apoiador | Rede de Apoio | Voluntário | Ação |
| `outro` | Contato | Contatos | Novo Contato | Base de Contatos | Agente | Operação |

---

## Como o hook useTerminologia() funciona

### Arquitetura

```
workspace_settings (Supabase)
        │
        ▼
TerminologiaProvider (src/contexts/TerminologiaContext.tsx)
        │   carrega { vertical, vocabulario } ao montar
        │   mescla TERMOS_PADRAO[vertical] + vocabulario (override)
        │   cache em memória (Map) por workspace_id
        ▼
useTerminologia() → { t, vertical }
        │
        ▼
Componentes: t('contatos') → "Apoiadores" | "Clientes" | ...
```

### Fluxo de resolução de um termo

1. Busca `workspace_settings` do workspace ativo no Supabase
2. Identifica o `vertical` (ex: `'politica'`)
3. Carrega `TERMOS_PADRAO['politica']` como base
4. Mescla com `vocabulario` (override por chave, ex: `{ "contatos": "Eleitores" }`)
5. Retorna a função `t(chave)` que resolve qualquer chave da interface `Terminologia`

### Fallback

Se `workspace_settings` não existir ou a query falhar, o provider usa `vertical='politica'` como padrão. Isso garante retrocompatibilidade total com workspaces existentes (ex: Antoniassi 2026).

### Uso nos componentes

```tsx
import { useTerminologia } from "../contexts/TerminologiaContext";

function MeuComponente() {
  const { t } = useTerminologia();

  return (
    <p>{t('contatos')}</p>  // → "Apoiadores" (politica) | "Clientes" (varejo) | ...
  );
}
```

### Chaves disponíveis

| Chave | Descrição |
|---|---|
| `contato` | Singular do contato (ex: "Apoiador") |
| `contatos` | Plural do contato (ex: "Apoiadores") |
| `novo_contato` | Ação de criar (ex: "Novo Apoiador") |
| `base_contatos` | Nome da coleção (ex: "Base de Apoiadores") |
| `captador` | Quem cadastra (ex: "Voluntário") |
| `operacao` | Nome da operação (ex: "Campanha") |

---

## Como customizar vocabulário via workspace_settings.vocabulario

O campo `vocabulario` (jsonb) permite sobrescrever termos individuais sem mudar o vertical:

```sql
UPDATE workspace_settings
SET vocabulario = '{ "contatos": "Eleitores", "contato": "Eleitor" }'::jsonb
WHERE workspace_id = '<uuid>';
```

O hook mescla: `TERMOS_PADRAO[vertical]` + `vocabulario`. Qualquer chave presente em `vocabulario` prevalece sobre o padrão do vertical.

**Nota V1:** a UI de edição de vocabulário ainda não existe. As customizações precisam ser feitas diretamente no banco (SQL ou Supabase Dashboard → Table Editor → workspace_settings).

---

## Como adicionar um novo vertical

1. **`src/lib/terminologia.ts`** — adicionar o novo vertical ao tipo `Vertical` e ao objeto `TERMOS_PADRAO`:
   ```ts
   export type Vertical = '...' | 'meuvertical';

   export const TERMOS_PADRAO: Record<Vertical, Terminologia> = {
     // ...
     meuvertical: {
       contato: 'Paciente',
       contatos: 'Pacientes',
       novo_contato: 'Novo Paciente',
       base_contatos: 'Pacientes Cadastrados',
       captador: 'Atendente',
       operacao: 'Campanha de Saúde',
     },
   };
   ```

2. **`supabase/migrations/`** — criar nova migration que adiciona o valor ao CHECK constraint:
   ```sql
   ALTER TABLE workspace_settings
     DROP CONSTRAINT workspace_settings_vertical_check,
     ADD CONSTRAINT workspace_settings_vertical_check
       CHECK (vertical IN ('politica', ..., 'meuvertical'));
   ```

3. **Testar** com `npm run build` e validar no preview.

---

## Limitações V1 — telas adaptadas vs. não adaptadas

### Telas adaptadas (V1 — esta sessão)

| Arquivo | O que muda |
|---|---|
| `src/App.tsx` (Shell) | h1 "Base de Apoiadores" (aba contatos) · h1 "Novo Apoiador" (aba novo) |
| `src/pages/Contatos.tsx` | contador "X Apoiadores" |
| `src/pages/Inicio.tsx` | KPI "Total de Apoiadores" |
| `src/pages/Envio.tsx` | contador "X Apoiadores na fila" · mensagens de estado vazio |
| `src/pages/NovoContato.tsx` | botão "Salvar Apoiador" · toast "Apoiador salvo na base!" |

### Telas NÃO adaptadas (roadmap V2)

| Arquivo | O que precisa mudar |
|---|---|
| `src/pages/NovoContato.tsx` | TAGS e ORIGENS hardcoded para política |
| `src/components/DetalheContato.tsx` | labels de campos e textos de ações |
| `src/components/ExportarContatos.tsx` | cabeçalho do XLSX/CSV |
| `src/components/ModalImportar.tsx` | textos de instrução |
| `src/components/EnvioLista.tsx` | textos da lista de transmissão |
| `src/pages/Agenda.tsx` | "Agenda da equipe" no h1 |
| `src/pages/MapaCalor.tsx` | legenda do painel de estatísticas |
| `src/pages/Inicio.tsx` | título "Ranking de cadastradores" → t('captador') |
| PDF export (Inicio.tsx) | cabeçalho do PDF |

---

## Roadmap Multi-Vertical

### V1 (2026-06-20 — esta sessão)
- Tabela `workspace_settings` com RLS
- Hook `useTerminologia()` + `TerminologiaProvider`
- 4 telas adaptadas: Contatos, Inicio, Envio, NovoContato + Shell h1s

### V2 (próxima sessão)
- Adaptar todas as telas restantes (ver lista acima)
- Adaptar TAGS e ORIGENS padrão por vertical (NovoContato.tsx)
- Adaptar cabeçalho do PDF e do XLSX exportado

### V3
- Tela de onboarding para escolha de vertical ao criar workspace
- UI de edição de vocabulário personalizado (workspace_settings.vocabulario)
- Paleta de cores por vertical (cor_primaria / cor_secundaria)

### V4
- Capacitor + Google Play + App Store
- Primeiro cliente não-político em produção
