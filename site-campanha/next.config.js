/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Necessário porque as imagens de placeholder em /public/placeholders são SVG.
    // Ao substituir por fotos reais (.jpg/.png) esta opção pode ser removida.
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
  },
};

module.exports = nextConfig;
