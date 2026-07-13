# Site institucional — Gustavo Antoniassi (pré-campanha)

Site institucional em página única para a pré-campanha de Gustavo Antoniassi,
pré-candidato a Deputado Federal com domicílio eleitoral em Santa Bárbara
d'Oeste (SP). Região de atuação: Santa Bárbara d'Oeste, Americana e Nova
Odessa.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Supabase (`@supabase/supabase-js`) para gravar os contatos do formulário de
  voluntários
- Deploy alvo: Vercel

## Como rodar localmente

```bash
cd site-campanha
npm install
cp .env.local.example .env.local
# edite .env.local com a anon key do projeto Supabase
npm run dev
```

Acesse http://localhost:3000

## Variáveis de ambiente

Crie `.env.local` (veja `.env.local.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://mdkinyexgzekrraftwqx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<sua-anon-key>
```

Ambos os valores estão em: Supabase Dashboard → Project Settings → API.

## Banco de dados (Supabase)

O formulário da seção "Ajude a campanha" grava na tabela `site_leads`. Rode o
script `supabase/site_leads.sql` no SQL Editor do projeto Supabase
(`mdkinyexgzekrraftwqx`) antes do primeiro uso. Ele cria a tabela e a política
de RLS que permite apenas **inserção** via chave anônima (o site não lê os
leads de volta).

Colunas: `id, nome, telefone, cidade, bairro, mensagem, created_at`.

## Conteúdo editável (sem mexer em componentes)

Todo o conteúdo real fica centralizado em `src/data/`:

| Arquivo | Conteúdo |
|---|---|
| `config.ts` | Nome, número, slogan, partido, redes sociais, link de doação, texto jurídico do rodapé |
| `bio.ts` | Textos da seção "Sobre" |
| `propostas.ts` | Cards da seção "Propostas" |
| `agenda.ts` | Eventos da seção "Agenda" |
| `midia.ts` | Posts da seção "Mídia" |

Qualquer texto marcado com `[SUBSTITUIR]` é placeholder e precisa ser revisado
antes de publicar.

### Imagens (placeholders)

As imagens reais ainda não foram fornecidas. Os componentes referenciam SVGs
de placeholder em `public/placeholders/` (`hero.svg`, `midia-1.svg`,
`midia-2.svg`, `midia-3.svg`), gerados só para o layout não quebrar.

Para trocar pela foto oficial do candidato:

1. Coloque o arquivo em `public/hero.jpg` (recomendado 1200×1500px).
2. Em `src/data/config.ts`, troque `imagens.hero` para `"/hero.jpg"`.
3. Repita o processo para os prints de mídia em `src/data/midia.ts`.
4. Depois de trocar todos os placeholders SVG por fotos reais, remova
   `images.dangerouslyAllowSVG` de `next.config.js` (ele só existe para os
   SVGs de placeholder funcionarem com o componente `next/image`).

## Estrutura

```
src/
├── app/            layout.tsx, page.tsx, globals.css
├── components/     Header, Hero, Sobre, Propostas, Agenda, Midia, Ajude, Contato, Footer
├── data/           conteúdo editável (config, bio, propostas, agenda, midia)
└── lib/            cliente Supabase + máscara de telefone BR
supabase/
└── site_leads.sql  script de criação da tabela + RLS
```

## Deploy na Vercel

1. Suba este projeto (pasta `site-campanha`) para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com), **Add New Project** → importe o
   repositório. Se o projeto Next.js não estiver na raiz do repositório,
   defina o **Root Directory** como `site-campanha` nas configurações do
   projeto Vercel.
3. Em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. A Vercel detecta o Next.js automaticamente (build `next build`).

## Observações importantes

- O site **não processa pagamentos**. O botão "Doar pelo canal oficial"
  apenas linka para uma URL externa configurada em `config.doacao.url`.
- O texto do rodapé jurídico (`rodapeJuridico.textoObrigatorio` em
  `config.ts`) deve ser validado com assessoria jurídica conforme o período
  eleitoral vigente.
- Sempre que as três cidades forem citadas juntas no conteúdo, mantenha a
  ordem: Santa Bárbara d'Oeste, Americana, Nova Odessa (regra fixa do
  projeto, já refletida em `config.regiaoAtuacao`).
