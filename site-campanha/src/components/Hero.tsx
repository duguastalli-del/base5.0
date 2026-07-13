import Image from "next/image";
import { config } from "@/data/config";

export function Hero() {
  return (
    <section
      id="inicio"
      className="bg-gradiente-azul text-white"
    >
      <div className="mx-auto flex max-w-6xl flex-col-reverse items-center gap-8 px-4 py-12 md:flex-row md:gap-12 md:px-8 md:py-20">
        <div className="flex-1 text-center md:text-left">
          <p className="text-sm font-semibold uppercase tracking-widest text-vermelho">
            Pré-candidato a {config.candidato.cargo}
          </p>
          <h1 className="mt-2 text-4xl font-extrabold leading-tight md:text-5xl">
            {config.candidato.nome}
          </h1>
          <p className="mt-2 text-lg text-white/80">
            Número: <span className="font-bold">{config.candidato.numero}</span>
          </p>
          <p className="mt-4 text-xl italic text-white/90">
            &ldquo;{config.candidato.slogan}&rdquo;
          </p>
          <p className="mt-4 text-white/70">
            Domicílio eleitoral em {config.candidato.domicilioEleitoral} — atuação em{" "}
            {config.regiaoAtuacao.join(", ")}.
          </p>

          <a
            href="#propostas"
            className="mt-8 inline-block rounded-full bg-vermelho px-8 py-3 font-semibold text-white shadow-lg transition hover:bg-vermelho/90"
          >
            Conheça as propostas
          </a>
        </div>

        <div className="w-56 flex-shrink-0 md:w-80">
          <div className="overflow-hidden rounded-2xl border-4 border-white/20 shadow-2xl">
            <Image
              src={config.imagens.hero}
              alt={config.candidato.nome}
              width={800}
              height={1000}
              priority
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>

      <div className="divisor-campanha" />
    </section>
  );
}
