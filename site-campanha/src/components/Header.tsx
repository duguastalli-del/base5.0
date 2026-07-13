"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { config } from "@/data/config";

const links = [
  { href: "#inicio", label: "Início" },
  { href: "#sobre", label: "Sobre" },
  { href: "#propostas", label: "Propostas" },
  { href: "#agenda", label: "Agenda" },
  { href: "#midia", label: "Mídia" },
  { href: "#ajude", label: "Ajude" },
  { href: "#contato", label: "Contato" },
];

export function Header() {
  const [aberto, setAberto] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-azul-escuro/95 backdrop-blur shadow-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
        <a href="#inicio" className="text-lg font-bold text-white">
          {config.candidato.nome}
        </a>

        <button
          type="button"
          aria-label="Abrir menu"
          className="text-white md:hidden"
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? <X size={28} /> : <Menu size={28} />}
        </button>

        <nav className="hidden md:flex md:gap-6">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-white/90 transition hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>

      {aberto && (
        <nav className="flex flex-col gap-1 border-t border-white/10 bg-azul-escuro px-4 pb-4 md:hidden">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded px-2 py-2 text-white/90 hover:bg-white/10"
              onClick={() => setAberto(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}

      <div className="divisor-campanha" />
    </header>
  );
}
