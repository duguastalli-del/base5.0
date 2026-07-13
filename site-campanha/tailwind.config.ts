import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta de referência: azul institucional + branco + detalhe vermelho
        azul: {
          DEFAULT: "#0a3d7a",
          escuro: "#062a56",
          claro: "#1e5aa8",
        },
        vermelho: {
          DEFAULT: "#d61f2c",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradiente-azul": "linear-gradient(135deg, #062a56 0%, #0a3d7a 55%, #1e5aa8 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
