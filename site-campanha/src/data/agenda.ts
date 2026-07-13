// Agenda de eventos. Adicione, edite ou remova itens deste array — não é preciso mexer em componentes.
// Datas em formato ISO (AAAA-MM-DD) para ordenação correta.

export type EventoAgenda = {
  data: string; // AAAA-MM-DD
  cidade: "Santa Bárbara d'Oeste" | "Americana" | "Nova Odessa";
  local: string;
  descricao: string;
};

export const agenda: EventoAgenda[] = [
  {
    data: "[SUBSTITUIR-AAAA-MM-DD]",
    cidade: "Santa Bárbara d'Oeste",
    local: "[SUBSTITUIR: nome do local]",
    descricao: "[SUBSTITUIR] Reunião com lideranças comunitárias do bairro.",
  },
  {
    data: "[SUBSTITUIR-AAAA-MM-DD]",
    cidade: "Americana",
    local: "[SUBSTITUIR: nome do local]",
    descricao: "[SUBSTITUIR] Visita a associação de moradores.",
  },
  {
    data: "[SUBSTITUIR-AAAA-MM-DD]",
    cidade: "Nova Odessa",
    local: "[SUBSTITUIR: nome do local]",
    descricao: "[SUBSTITUIR] Encontro com categoria profissional.",
  },
];
