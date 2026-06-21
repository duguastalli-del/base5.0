export type Vertical =
  | 'politica'
  | 'religioso'
  | 'imobiliario'
  | 'varejo'
  | 'pesquisa'
  | 'publicidade'
  | 'ong'
  | 'outro';

export interface Terminologia {
  contato: string;
  contatos: string;
  novo_contato: string;
  base_contatos: string;
  captador: string;
  captadores: string;
  operacao: string;
}

export const TERMOS_PADRAO: Record<Vertical, Terminologia> = {
  politica: {
    contato: 'Apoiador',
    contatos: 'Apoiadores',
    novo_contato: 'Novo Apoiador',
    base_contatos: 'Base de Apoiadores',
    captador: 'Voluntário',
    captadores: 'Voluntários',
    operacao: 'Campanha',
  },
  religioso: {
    contato: 'Membro',
    contatos: 'Membros',
    novo_contato: 'Novo Membro',
    base_contatos: 'Comunidade',
    captador: 'Liderança',
    captadores: 'Lideranças',
    operacao: 'Ação Pastoral',
  },
  imobiliario: {
    contato: 'Lead',
    contatos: 'Leads',
    novo_contato: 'Novo Lead',
    base_contatos: 'Pipeline',
    captador: 'Corretor',
    captadores: 'Corretores',
    operacao: 'Captação',
  },
  varejo: {
    contato: 'Cliente',
    contatos: 'Clientes',
    novo_contato: 'Novo Cliente',
    base_contatos: 'Base de Clientes',
    captador: 'Vendedor',
    captadores: 'Vendedores',
    operacao: 'Promoção',
  },
  pesquisa: {
    contato: 'Pesquisado',
    contatos: 'Pesquisados',
    novo_contato: 'Novo Pesquisado',
    base_contatos: 'Amostra',
    captador: 'Pesquisador',
    captadores: 'Pesquisadores',
    operacao: 'Pesquisa',
  },
  publicidade: {
    contato: 'Lead',
    contatos: 'Leads',
    novo_contato: 'Novo Lead',
    base_contatos: 'Base',
    captador: 'Agente',
    captadores: 'Agentes',
    operacao: 'Ativação',
  },
  ong: {
    contato: 'Apoiador',
    contatos: 'Apoiadores',
    novo_contato: 'Novo Apoiador',
    base_contatos: 'Rede de Apoio',
    captador: 'Voluntário',
    captadores: 'Voluntários',
    operacao: 'Ação',
  },
  outro: {
    contato: 'Contato',
    contatos: 'Contatos',
    novo_contato: 'Novo Contato',
    base_contatos: 'Base de Contatos',
    captador: 'Agente',
    captadores: 'Agentes',
    operacao: 'Operação',
  },
};
