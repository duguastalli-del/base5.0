import { useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { X, Trash2, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

export interface Evento {
  id: string;
  workspace_id: string;
  titulo: string;
  inicio: string;
  fim: string | null;
  local: string | null;
  cidade: string | null;
  descricao: string | null;
  responsavel: string | null;
  lembrete_minutos: number | null;
  google_event_id: string | null;
}

const LEMBRETES = [
  { label: "Sem lembrete", val: 0 },
  { label: "5 minutos antes", val: 5 },
  { label: "15 minutos antes", val: 15 },
  { label: "30 minutos antes", val: 30 },
  { label: "1 hora antes", val: 60 },
  { label: "2 horas antes", val: 120 },
  { label: "1 dia antes", val: 1440 },
];

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

function dataInicialParaDatetime(dateStr: string): string {
  // dateStr = "YYYY-MM-DD" from FullCalendar dateClick
  return `${dateStr}T09:00`;
}

export default function EventoModal({
  perfil, evento, dataInicial, onFechar, onAlterado, agendarNotificacao,
}: {
  perfil: Perfil;
  evento: Evento | null;
  dataInicial?: string;
  onFechar: () => void;
  onAlterado: () => void;
  agendarNotificacao: (ev: Evento) => void;
}) {
  const isNovo = evento === null;
  const [titulo, setTitulo] = useState(evento?.titulo ?? "");
  const [inicio, setInicio] = useState(
    evento
      ? toDatetimeLocal(evento.inicio)
      : dataInicial
        ? dataInicialParaDatetime(dataInicial)
        : toDatetimeLocal(new Date().toISOString())
  );
  const [fim, setFim] = useState(toDatetimeLocal(evento?.fim));
  const [local, setLocal] = useState(evento?.local ?? "");
  const [cidade, setCidade] = useState(evento?.cidade ?? "");
  const [descricao, setDescricao] = useState(evento?.descricao ?? "");
  const [lembrete, setLembrete] = useState(evento?.lembrete_minutos ?? 30);
  const [carregando, setCarregando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmExcluir, setConfirmExcluir] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const salvar = async () => {
    setErro("");
    if (!(titulo ?? "").trim()) return setErro("Título é obrigatório.");
    if (!inicio) return setErro("Data de início é obrigatória.");
    if (fim && fim < inicio) return setErro("O fim não pode ser antes do início.");
    setCarregando(true);

    const payload = {
      titulo: titulo.trim(),
      inicio: new Date(inicio).toISOString(),
      fim: fim ? new Date(fim).toISOString() : null,
      local: local.trim() || null,
      cidade: cidade.trim() || null,
      descricao: descricao.trim() || null,
      responsavel: perfil.id,
      lembrete_minutos: lembrete > 0 ? lembrete : null,
    };

    let savedEvento: Evento | null = null;

    if (isNovo) {
      const { data, error } = await supabase
        .from("events")
        .insert({ ...payload, workspace_id: perfil.workspace_id })
        .select("*")
        .single();
      setCarregando(false);
      if (error) return setErro("Falha ao criar: " + error.message);
      savedEvento = data as Evento;
    } else {
      const { data, error } = await supabase
        .from("events")
        .update(payload)
        .eq("id", evento!.id)
        .select("*")
        .single();
      setCarregando(false);
      if (error) return setErro("Falha ao salvar: " + error.message);
      savedEvento = data as Evento;
    }

    if (savedEvento && lembrete > 0) {
      agendarNotificacao(savedEvento);
    }

    setSucesso(isNovo ? "Evento criado!" : "Evento atualizado!");
    setTimeout(() => { onAlterado(); onFechar(); }, 900);
  };

  const excluir = async () => {
    setExcluindo(true);
    await supabase.from("events").delete().eq("id", evento!.id);
    setExcluindo(false);
    onAlterado(); onFechar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onFechar}>
      <div className="w-full sm:max-w-md bg-fundo rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-linha">
          <span className="text-sm font-bold text-tinta">{isNovo ? "Novo evento" : "Editar evento"}</span>
          <button onClick={onFechar} className="text-apoio p-1"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold mb-1 block text-tinta">Título *</label>
            <input className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
              value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Reunião de equipe" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold mb-1 block text-tinta">Início *</label>
              <input type="datetime-local" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
                value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block text-tinta">Fim</label>
              <input type="datetime-local" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
                value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold mb-1 block text-tinta">Local</label>
              <input className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
                value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Endereço..." />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block text-tinta">Cidade</label>
              <input className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
                value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Americana..." />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold mb-1 block text-tinta">Descrição</label>
            <textarea className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white min-h-[60px]"
              value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Pauta, contexto..." />
          </div>

          <div>
            <label className="text-xs font-semibold mb-1 block text-tinta">Lembrete</label>
            <select className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
              value={lembrete} onChange={(e) => setLembrete(Number(e.target.value))}>
              {LEMBRETES.map((l) => (
                <option key={l.val} value={l.val}>{l.label}</option>
              ))}
            </select>
          </div>

          {erro && <p className="text-xs flex items-center gap-1.5 font-medium text-erro"><AlertTriangle size={12} /> {erro}</p>}
          {sucesso && <p className="text-xs flex items-center gap-1.5 font-medium text-ok"><CheckCircle2 size={12} /> {sucesso}</p>}

          {confirmExcluir && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-erro">Excluir este evento?</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmExcluir(false)}
                  className="flex-1 rounded-xl py-2 text-xs font-semibold border border-linha text-apoio bg-white">Cancelar</button>
                <button onClick={excluir} disabled={excluindo}
                  className="flex-1 rounded-xl py-2 text-xs font-bold text-white bg-erro disabled:opacity-60 flex items-center justify-center gap-1">
                  {excluindo ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  {excluindo ? "..." : "Excluir"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-white border-t border-linha space-y-2">
          <div className="flex gap-2">
            <button onClick={onFechar} className="flex-1 rounded-xl py-2.5 text-sm font-semibold border border-linha text-apoio">
              Cancelar
            </button>
            <button onClick={salvar} disabled={carregando}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white bg-marca disabled:opacity-60 flex items-center justify-center gap-1.5">
              {carregando ? <Loader2 size={14} className="animate-spin" /> : null}
              {carregando ? "Salvando..." : "Salvar"}
            </button>
          </div>
          {!isNovo && !confirmExcluir && (
            <button onClick={() => setConfirmExcluir(true)}
              className="w-full rounded-xl py-2 text-xs font-semibold text-erro border border-red-200 bg-red-50 flex items-center justify-center gap-1">
              <Trash2 size={12} /> Excluir evento
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
