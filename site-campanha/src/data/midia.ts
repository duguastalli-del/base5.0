// Itens da seção "Mídia". Adicione novos posts aqui — não é preciso mexer em componentes.
// Troque "imagem" pelo print/foto real em /public/midia/ e "link" pela URL do post original.

export type ItemMidia = {
  imagem: string;
  legenda: string;
  link: string;
  rede: "instagram" | "facebook";
};

export const midia: ItemMidia[] = [
  {
    imagem: "/placeholders/midia-1.svg",
    legenda: "[SUBSTITUIR] Legenda do post — evento em Santa Bárbara d'Oeste.",
    link: "https://instagram.com/[SUBSTITUIR]",
    rede: "instagram",
  },
  {
    imagem: "/placeholders/midia-2.svg",
    legenda: "[SUBSTITUIR] Legenda do post — agenda em Americana.",
    link: "https://facebook.com/[SUBSTITUIR]",
    rede: "facebook",
  },
  {
    imagem: "/placeholders/midia-3.svg",
    legenda: "[SUBSTITUIR] Legenda do post — visita a Nova Odessa.",
    link: "https://instagram.com/[SUBSTITUIR]",
    rede: "instagram",
  },
];
