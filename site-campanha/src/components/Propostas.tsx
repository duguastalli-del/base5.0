import { HeartPulse, Landmark, Building2, Factory, Trees, type LucideIcon } from "lucide-react";
import { propostas, type Proposta } from "@/data/propostas";

const icones: Record<Proposta["icone"], LucideIcon> = {
  HeartPulse,
  Landmark,
  Building2,
  Factory,
  Trees,
};

export function Propostas() {
  return (
    <section id="propostas" className="bg-slate-50 px-4 py-16 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-extrabold text-azul-escuro">
          Propostas
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">
          Uma pauta construída a partir do diálogo direto com quem vive Santa Bárbara
          d&apos;Oeste, Americana e Nova Odessa no dia a dia.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {propostas.map((proposta) => {
            const Icone = icones[proposta.icone];
            return (
              <div
                key={proposta.titulo}
                className="flex flex-col rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100 transition hover:shadow-lg"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-azul/10 text-azul">
                  <Icone size={26} />
                </div>
                <h3 className="mt-4 text-lg font-bold text-azul-escuro">
                  {proposta.titulo}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {proposta.texto}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
