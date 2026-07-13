// Configuração central do site. Edite aqui sem precisar mexer nos componentes.
// Tudo marcado com [SUBSTITUIR] deve ser revisado antes de publicar.

export const config = {
  candidato: {
    nome: "Gustavo Antoniassi",
    numero: "[SUBSTITUIR-NUMERO]",
    slogan: "[SUBSTITUIR: slogan de campanha]",
    cargo: "Deputado Federal",
    partido: "[SUBSTITUIR-PARTIDO]",
    anoEleicao: "2026",
    domicilioEleitoral: "Santa Bárbara d'Oeste (SP)",
  },

  // Ordem fixa do projeto: sempre citar as cidades nesta ordem.
  regiaoAtuacao: ["Santa Bárbara d'Oeste", "Americana", "Nova Odessa"],

  imagens: {
    // [SUBSTITUIR] pela foto oficial em alta resolução (recomendado: 1200x1500px, .jpg)
    // Substitua o arquivo em /public/hero.jpg e troque este caminho para "/hero.jpg"
    hero: "/placeholders/hero.svg",
  },

  redesSociais: {
    instagram: "https://instagram.com/[SUBSTITUIR]",
    facebook: "https://facebook.com/[SUBSTITUIR]",
    whatsapp: "https://wa.me/55[SUBSTITUIR-DDD-NUMERO]",
  },

  doacao: {
    // Canal oficial externo de doação (TSE / plataforma de arrecadação). O site NÃO processa pagamentos.
    url: "https://[SUBSTITUIR-URL-DOACAO-OFICIAL]",
  },

  contato: {
    email: "[SUBSTITUIR@email.com]",
  },

  // Texto obrigatório de rodapé — sujeito a orientação jurídica sobre período eleitoral.
  rodapeJuridico: {
    textoObrigatorio:
      "Gustavo Antoniassi — pré-campanha 2026. Este material não representa pedido de voto.",
    fichaTecnica: "[SUBSTITUIR: responsável pelo conteúdo / produção do site]",
  },

  supabase: {
    tabelaLeads: "site_leads",
  },
} as const;
