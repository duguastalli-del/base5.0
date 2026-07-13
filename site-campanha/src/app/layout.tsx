import type { Metadata } from "next";
import "./globals.css";
import { config } from "@/data/config";

export const metadata: Metadata = {
  title: `${config.candidato.nome} — Pré-campanha ${config.candidato.anoEleicao}`,
  description: `${config.candidato.nome}, pré-candidato a ${config.candidato.cargo}. Atuação em ${config.regiaoAtuacao.join(", ")}.`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
