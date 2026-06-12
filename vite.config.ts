import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Base 5.0",
        short_name: "Base 5.0",
        description: "CRM político conforme TSE e LGPD",
        theme_color: "#0E5E6F",
        background_color: "#F2F4F6",
        display: "standalone",
        icons: [
          { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});
