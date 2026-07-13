// Cards da seção "Propostas". Ícones referenciam nomes do pacote lucide-react.
// Texto de exemplo — revisar antes de publicar (evitar tratar o eleitor como número/estatística).

export type Proposta = {
  icone: "HeartPulse" | "Landmark" | "Building2" | "Factory" | "Trees";
  titulo: string;
  texto: string;
};

export const propostas: Proposta[] = [
  {
    icone: "Landmark",
    titulo: "INSS e direitos dos aposentados",
    texto:
      "[SUBSTITUIR] Atuação junto ao INSS para reduzir filas de perícia e análise de benefícios, com apoio direto a quem enfrenta dificuldade para acessar aposentadoria, pensão ou auxílio a que tem direito.",
  },
  {
    icone: "HeartPulse",
    titulo: "Saúde e gap hospitalar regional",
    texto:
      "[SUBSTITUIR] Defesa de mais recursos federais para ampliar a capacidade hospitalar da região, hoje insuficiente para atender Santa Bárbara d'Oeste, Americana e Nova Odessa com agilidade e qualidade.",
  },
  {
    icone: "Building2",
    titulo: "Pauta municipal — Santa Bárbara d'Oeste",
    texto:
      "[SUBSTITUIR] Articulação de recursos federais para infraestrutura urbana, saúde e educação em Santa Bárbara d'Oeste, em conjunto com lideranças e moradores do município.",
  },
  {
    icone: "Factory",
    titulo: "Pauta municipal — Americana",
    texto:
      "[SUBSTITUIR] Apoio a projetos de geração de emprego, mobilidade urbana e saúde para Americana, com atenção às demandas específicas trazidas pela comunidade local.",
  },
  {
    icone: "Trees",
    titulo: "Pauta municipal — Nova Odessa",
    texto:
      "[SUBSTITUIR] Fortalecimento de investimentos federais em infraestrutura, meio ambiente e serviços públicos para Nova Odessa, ouvindo diretamente quem vive na cidade.",
  },
];
