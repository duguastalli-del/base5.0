import { config } from "@/data/config";

export function Footer() {
  return (
    <footer className="bg-azul-escuro px-4 py-8 text-center text-white/80 md:px-8">
      <div className="divisor-campanha -mt-8 mb-8" />

      <p className="text-sm">{config.rodapeJuridico.textoObrigatorio}</p>

      <p className="mt-2 text-xs text-white/60">
        {config.candidato.partido} · Número {config.candidato.numero}
      </p>

      <p className="mt-1 text-xs text-white/60">
        Ficha técnica: {config.rodapeJuridico.fichaTecnica}
      </p>
    </footer>
  );
}
