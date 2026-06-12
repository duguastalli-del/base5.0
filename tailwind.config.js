/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: {
    marca: "#0E5E6F", marcaEscura: "#0A4753",
    tinta: "#1C2530", apoio: "#5C6B7A",
    fundo: "#F2F4F6", linha: "#E3E8EC",
    ok: "#1E8E5A", alerta: "#B7791F", erro: "#B3372E",
  }}},
  plugins: [],
}
