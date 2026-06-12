# Base 5.0 — Etapa 3 pronta (código compilado e verificado)

## Para rodar no seu computador (5 passos)

1. Instale o Node.js (nodejs.org, versão LTS) se ainda não tem
2. Descompacte esta pasta e abra o terminal dentro dela
3. Copie `.env.local.exemplo` para `.env.local` e cole seus valores do
   Supabase (Settings → API → Project URL e anon public key)
4. Rode: `npm install`
5. Rode: `npm run dev` → abra http://localhost:5173

## Primeiro uso
- Toque em "Criar minha campanha" → você entra como administrador,
  com templates e tags já criados pelo banco
- Aba Início → "Convidar pessoa para a equipe" → gera o link → manda
  por WhatsApp → a pessoa cria a senha e entra com o papel certo

## O que esta etapa entrega
- Login real (Supabase Auth) + criar campanha + convites funcionando
- Cadastro rápido modo rua: cidade obrigatória, bairro opcional com
  autocomplete que aprende da base, consentimento LGPD obrigatório
- OFFLINE: sem internet, salva no aparelho e sincroniza sozinho quando
  a conexão volta (banner mostra os pendentes)
- Base de contatos: busca, filtro por cidade, WhatsApp 1-clique
- Dashboard: cartões, contatos por cidade, ranking (dados reais do banco)
- PWA instalável (Safari/Chrome → Compartilhar → Adicionar à Tela de Início)

## Para publicar na internet (Vercel)
1. Suba a pasta para um repositório no GitHub
2. vercel.com → Add New Project → importa o repositório
3. Em Environment Variables, adicione VITE_SUPABASE_URL e
   VITE_SUPABASE_ANON_KEY
4. Deploy → o app ganha endereço público → instala no celular

## Próximas etapas (com o Claude Code, usando o briefing)
4: editar/arquivar/excluir · 5: importação · 6: exportação XLSX
7: envio assistido + opt-in · 8: agenda · 9: gráficos · 10: mapa de calor
