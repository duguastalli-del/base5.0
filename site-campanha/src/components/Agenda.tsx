import { Calendar, MapPin } from "lucide-react";
import { agenda } from "@/data/agenda";

function formatarData(data: string): string {
  const d = new Date(`${data}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return data;
  }
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function Agenda() {
  return (
    <section id="agenda" className="bg-white px-4 py-16 md:px-8">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-extrabold text-azul-escuro">
          Agenda
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">
          Próximos compromissos em Santa Bárbara d&apos;Oeste, Americana e Nova Odessa.
        </p>

        <ul className="mt-10 space-y-4">
          {agenda.map((evento, i) => (
            <li
              key={i}
              className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-5 shadow-sm sm:flex-row sm:items-center sm:gap-6"
            >
              <div className="flex items-center gap-2 text-azul sm:w-48 sm:flex-shrink-0">
                <Calendar size={20} />
                <span className="font-semibold">{formatarData(evento.data)}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 font-bold text-azul-escuro">
                  <MapPin size={18} className="text-vermelho" />
                  {evento.cidade} — {evento.local}
                </div>
                <p className="mt-1 text-sm text-slate-600">{evento.descricao}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
