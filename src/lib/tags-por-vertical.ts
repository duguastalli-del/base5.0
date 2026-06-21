import type { Vertical } from "./terminologia";

export const TAGS_POR_VERTICAL: Record<Vertical, string[]> = {
  politica:    ["Apoiador", "Liderança", "Indeciso", "Comerciante", "Igreja", "Esporte"],
  religioso:   ["Membro", "Visitante", "Líder", "Dizimista", "Voluntário", "Jovem", "Idoso"],
  imobiliario: ["Comprador", "Vendedor", "Investidor", "Locatário", "Interessado", "Visitante"],
  varejo:      ["VIP", "Recorrente", "Recente", "Inativo", "Promoção", "Newsletter"],
  pesquisa:    ["Respondido", "Pendente", "Recusou", "Em campo", "Concluído"],
  publicidade: ["Lead Quente", "Lead Frio", "Convertido", "Engajado", "Interessado"],
  ong:         ["Doador", "Voluntário", "Beneficiário", "Parceiro", "Apoiador"],
  outro:       ["Contato 1", "Contato 2", "Contato 3"],
};

export const ORIGENS_POR_VERTICAL: Record<Vertical, string[]> = {
  politica:    ["Porta a porta", "Evento", "Indicação", "Importado", "Reunião"],
  religioso:   ["Culto", "Visita pastoral", "Indicação", "Evento", "Online"],
  imobiliario: ["Site", "Indicação", "Anúncio", "Visita à imobiliária", "Outros"],
  varejo:      ["Loja física", "Site", "Anúncio", "Indicação", "Promoção"],
  pesquisa:    ["Telefone", "Presencial", "Online", "Aleatória"],
  publicidade: ["Landing page", "Anúncio", "Indicação", "Evento"],
  ong:         ["Visita", "Evento", "Indicação", "Site", "Doação"],
  outro:       ["Manual", "Importado", "Outros"],
};
