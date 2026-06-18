import { useEffect, useState, useCallback } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { RefreshCw, Loader2, MessageCircle, Ban } from "lucide-react";

interface Mensagem {
  id: string;
  disparo_id: string | null;
  contact_id: string;
  status: string;
  resposta_texto: string | null;
  respondido_em: string | null;
}

interface Contato {
  id: string;
  nome: string | null;
  celular_e164: string | null;
}

interface Campanha {
  id: string;
  nome: string;
}

interface RespostaEnriquecida extends Mensagem {
  contato: Contato | null;
  campanha: Campanha | null;
}

const STATUS_LABEL: Record<string, string> = {
  respondido: "Respondeu",
  opt_out: "Opt-out",
};
const STATUS_BADGE: Record<string, string> = {
  respondido: "bg-green-100 text-green-700",
  opt_out: "bg-red-100 text-red-700",
};

export default function WhatsAppRespostas({ perfil }: { perfil: Perfil }) {
  const [respostas, setRespostas] = useState<RespostaEnriquecida[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "respondido" | "opt_out">("todos");

  const carregar = useCallback(async () => {
    setCarregando(true);

    const { data: msgs } = await supabase
      .from("whatsapp_mensagens")
      .select("id, disparo_id, contact_id, status, resposta_texto, respondido_em")
      .eq("workspace_id", perfil.workspace_id)
      .in("status", ["respondido", "opt_out"])
      .order("respondido_em", { ascending: false })
      .limit(200);

    const lista = (msgs ?? []) as Mensagem[];
    if (lista.length === 0) { setRespostas([]); setCarregando(false); return; }

    const contactIds = [...new Set(lista.map((m) => m.contact_id))];
    const disparoIds = [...new Set(lista.map((m) => m.disparo_id).filter(Boolean) as string[])];

    const [{ data: contatosData }, { data: campanhasData }] = await Promise.all([
      supabase.from("contacts").select("id, nome, celular_e164").in("id", contactIds),
      disparoIds.length > 0
        ? supabase.from("whatsapp_disparos").select("id, nome").in("id", disparoIds)
        : Promise.resolve({ data: [] }),
    ]);

    const contatosMap = new Map((contatosData ?? []).map((c) => [c.id, c as Contato]));
    const campanhasMap = new Map((campanhasData ?? []).map((c) => [c.id, c as Campanha]));

    setRespostas(
      lista.map((m) => ({
        ...m,
        contato: contatosMap.get(m.contact_id) ?? null,
        campanha: m.disparo_id ? (campanhasMap.get(m.disparo_id) ?? null) : null,
      }))
    );
    setCarregando(false);
  }, [perfil.workspace_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = filtroStatus === "todos"
    ? respostas
    : respostas.filter((r) => r.status === filtroStatus);

  const totalRespondido = respostas.filter((r) => r.status === "respondido").length;
  const totalOptOut = respostas.filter((r) => r.status === "opt_out").length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-texto">Respostas recebidas</p>
        <button onClick={carregar} className="p-2 rounded-xl border border-linha bg-white text-apoio">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white rounded-2xl border border-linha p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{totalRespondido}</p>
          <p className="text-xs text-apoio mt-0.5">Responderam</p>
        </div>
        <div className="bg-white rounded-2xl border border-linha p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{totalOptOut}</p>
          <p className="text-xs text-apoio mt-0.5">Opt-outs</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-1.5">
        {(["todos", "respondido", "opt_out"] as const).map((f) => (
          <button key={f} onClick={() => setFiltroStatus(f)}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
              filtroStatus === f ? "bg-marca text-white" : "bg-white text-apoio border border-linha"
            }`}>
            {f === "todos" ? "Todos" : f === "respondido" ? "Respostas" : "Opt-outs"}
          </button>
        ))}
      </div>

      {/* Lista */}
      {carregando ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-marca" />
        </div>
      ) : visiveis.length === 0 ? (
        <div className="bg-white rounded-2xl border border-linha p-8 text-center">
          <p className="text-sm text-apoio">Nenhuma resposta encontrada.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visiveis.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-linha p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-texto text-sm truncate">
                    {r.contato?.nome ?? r.contato?.celular_e164 ?? "Contato desconhecido"}
                  </p>
                  {r.contato?.celular_e164 && r.contato.nome && (
                    <p className="text-xs text-apoio">{r.contato.celular_e164}</p>
                  )}
                  {r.campanha && (
                    <p className="text-xs text-apoio mt-0.5 truncate">Campanha: {r.campanha.nome}</p>
                  )}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[r.status] ?? "bg-zinc-100 text-zinc-600"}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>

              {r.resposta_texto && (
                <div className="flex items-start gap-2 bg-zinc-50 rounded-xl p-2.5">
                  {r.status === "opt_out"
                    ? <Ban size={13} className="text-red-500 shrink-0 mt-0.5" />
                    : <MessageCircle size={13} className="text-green-600 shrink-0 mt-0.5" />
                  }
                  <p className="text-xs text-texto italic">"{r.resposta_texto}"</p>
                </div>
              )}

              {r.respondido_em && (
                <p className="text-xs text-apoio">
                  {new Date(r.respondido_em).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
