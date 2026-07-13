import { bio } from "@/data/bio";

export function Sobre() {
  return (
    <section id="sobre" className="bg-white px-4 py-16 md:px-8">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-extrabold text-azul-escuro">
          {bio.titulo}
        </h2>

        <div className="mt-8 space-y-4 text-lg leading-relaxed text-slate-700">
          {bio.paragrafos.map((paragrafo, i) => (
            <p key={i}>{paragrafo}</p>
          ))}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {bio.trajetoria.map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-azul/10 bg-azul/5 p-4 text-center"
            >
              <p className="font-bold text-azul">{item.periodo}</p>
              <p className="mt-1 text-sm text-slate-600">{item.titulo}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
