import Image from "next/image";
import { Instagram, Facebook } from "lucide-react";
import { midia } from "@/data/midia";

const iconesRede = {
  instagram: Instagram,
  facebook: Facebook,
};

export function Midia() {
  return (
    <section id="midia" className="bg-slate-50 px-4 py-16 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-extrabold text-azul-escuro">
          Mídia
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">
          Acompanhe os últimos registros da pré-campanha.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {midia.map((item, i) => {
            const IconeRede = iconesRede[item.rede];
            return (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-100 transition hover:shadow-lg"
              >
                <div className="relative aspect-square w-full overflow-hidden">
                  <Image
                    src={item.imagem}
                    alt={item.legenda}
                    fill
                    className="object-cover transition group-hover:scale-105"
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 text-azul">
                    <IconeRede size={18} />
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      Ver post original
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{item.legenda}</p>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
