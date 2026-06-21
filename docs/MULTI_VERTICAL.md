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

## Telas adaptadas (V2 — completo)

Todas as telas do sistema agora usam `useTerminologia()`:

| Arquivo | O que adapta |
|---|---|
| `src/App.tsx` (Shell) | h1 "Base de Apoiadores" / "Novo Apoiador" |
| `src/pages/Contatos.tsx` | contador "X Apoiadores" |
| `src/pages/Inicio.tsx` | KPI total, "Ranking de voluntários", cabeçalho PDF |
| `src/pages/Envio.tsx` | contador na fila, estados vazios |
| `src/pages/NovoContato.tsx` | botão salvar, toast, TAGS e ORIGENS dinâmicas por vertical |
| `src/components/DetalheContato.tsx` | título do modal, toast, ORIGENS dinâmicas |
| `src/components/ExportarContatos.tsx` | título, aba XLSX, escopo, mensagens de erro |
| `src/components/ModalImportar.tsx` | título, botão de importação |
| `src/components/EnvioLista.tsx` | contador, lote, botão registrar, estado vazio |

### Tags e origens por vertical (`src/lib/tags-por-vertical.ts`)

`TAGS_POR_VERTICAL` e `ORIGENS_POR_VERTICAL` definem chips específicos para cada um dos 8 verticais. `NovoContato.tsx` e `DetalheContato.tsx` usam `vertical` do hook para selecionar o conjunto correto.

### Chave `captadores` (plural)

Adicionada à interface `Terminologia` e ao `TERMOS_PADRAO` para todos os 8 verticais, usada em "Ranking de voluntários" (Inicio.tsx).

---

## Onboarding V3 — EscolherVertical

`src/pages/EscolherVertical.tsx` é exibida quando um workspace não tem `workspace_settings` (novo workspace) e o usuário é administrador.

### Fluxo

1. **Etapa 1:** Grid 2×4 com emoji + nome + descrição de cada vertical. Administrador seleciona e avança.
2. **Etapa 2 (opcional):** Nome de exibição do workspace + paleta de 6 cores. Pode pular.
3. **Confirmação:** INSERT em `workspace_settings` + audit log + `window.location.href = "/"` para garantir limpeza do cache de terminologia.

### Detecção em App.tsx

`App.tsx` mantém estado `hasSettings: boolean | undefined`. Após carregar o perfil, consulta `workspace_settings.workspace_id`. Se `false`:
- Admin → renderiza `<EscolherVertical />`
- Não-admin → tela de espera "Aguardando administrador configurar o workspace"

Antoniassi 2026 (vertical='politica') já tem settings → fluxo 100% inalterado.

---

## Roadmap Multi-Vertical

### V1 (2026-06-20) ✅
- Tabela `workspace_settings` com RLS
- Hook `useTerminologia()` + `TerminologiaProvider`
- 4 telas adaptadas: Contatos, Inicio, Envio, NovoContato + Shell h1s

### V2 (2026-06-21) ✅
- Todas as telas adaptadas (ver tabela acima)
- TAGS e ORIGENS dinâmicas por vertical (`tags-por-vertical.ts`)
- Chave `captadores` adicionada à interface Terminologia
- Cabeçalho do PDF e aba do XLSX adaptados

### V3 (2026-06-21) ✅
- `EscolherVertical.tsx`: onboarding de 2 etapas (vertical + personalização opcional)
- `App.tsx`: detecção de workspace sem settings + roteamento para onboarding
- Tela de espera para não-admins em workspaces sem configuração

### V4 🟡
- Capacitor + Google Play + App Store
- Primeiro cliente não-político em produção
- UI de edição de vocabulário personalizado (`workspace_settings.vocabulario`)
- Paleta de cores por vertical aplicada ao CSS (tematização real)

---

## Limitações conhecidas

### MapaCalor.tsx não usa useTerminologia (BUG-06)

`src/pages/MapaCalor.tsx` exibe "contato/contatos" em português genérico, independente do vertical. Isso é intencional após BUG-06 (2026-06-21).

**Causa:** `MapaCalor.tsx` é carregado via `React.lazy()` em App.tsx (correção do BUG-05). Adicionar `import { useTerminologia }` no chunk lazy criava uma dependência ESM circular com o bundle principal, causando tela branca total em runtime.

**Regra derivada:** componentes em `React.lazy()` não podem importar do TerminologiaContext (nem de nenhum outro módulo que resida no bundle principal e seja referenciado de volta pelo bundle principal via dynamic import).

Ver `docs/BUGS_RESOLVIDOS.md#BUG-06` para diagnóstico completo.
