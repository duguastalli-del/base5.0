import { useEffect, useMemo, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { linkWa, mascaraCelular } from "../lib/format";
import ModalImportar from "../components/ModalImportar";
import { Search, ChevronRight, MessageCircle, Tag, CheckCircle2, AlertTriangle, X, Building2, Smartphone } from "lucide-react";

interface Contato {
  id: string; nome: string; celular_e164: string; cidade: string;
  bairro: string | null; origem: string | null; obs: string | null;
  consent: "sim" | "pendente" | "recusou"; criado_em: string;
}

export default function Contatos({ perfil }: { perfil: Perfil }) {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [busca, setBusca] = useState("");
  const [cidadeF, setCidadeF] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [importar, setImportar] = useState(false);

  const podeImportar = perfil.papel === "administrador" || perfil.papel === "coordenador";

  const carregar = async () => {
    setCarregando(true);
    const { data } = await supabase.from("contacts").select("*")
      .neq("status", "anonimizado").order("criado_em", { ascending: false }).limit(500);
    setContatos((data as Contato[]) ?? []);
    setCarregando(false);
  };
  useEffect(() => { carregar(); }, []);

  const cidades = useMemo(() => [...new Set(contatos.map((c) => c.cidade))].sort(), [contatos]);

  const lista = contatos.filter((c) =>
    (!cidadeF || c.cidade === cidadeF) &&
    (!busca || c.nome.toLowerCase().includes(busca.toLowerCase()) || c.celular_e164.includes(busca.replace(/\D/g, ""))));

  const exibirCelular = (e164: string) => mascaraCelular(e164.replace("+55", ""));

  return (
    <div className="space-y-3 pb-4">
      <button onClick={() => podeImportar && setImportar(true)} disabled={!podeImportar}
        title={podeImportar ? "" : "Apenas administrador e coordenador podem importar"}
        className="w-full rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 text-white bg-marca disabled:opacity-50 disabled:cursor-not-allowed">
        <Smartphone size={16} /> + Importar contatos
      </button>

      {importar && (
        <ModalImportar perfil={perfil} cidades={cidades}
          onClose={() => setImportar(false)} onImportado={carregar} />
      )}

      <div className="flex items-center gap-2 rounded-xl px-3 bg-white border border-linha">
        <Search size={15} className="text-apoio" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou celular"
          className="w-full py-2.5 text-sm bg-transparent outline-none text-tinta" />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setCidadeF("")}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${!cidadeF ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
          Todas
        </button>
        {cidades.map((cd) => (
          <button key={cd} onClick={() => setCidadeF(cd === cidadeF ? "" : cd)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium inline-flex items-center gap-1 ${cidadeF === cd ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
            <Building2 size={10} /> {cd}
          </button>
        ))}
      </div>

      <div className="text-xs text-apoio">{carregando ? "Carregando..." : `${lista.length} contato(s)`}</div>

      {!carregando && lista.length === 0 && (
        <div className="bg-white border border-linha rounded-xl p-5 text-center">
          <p className="text-sm text-apoio">Base vazia por aqui. Vá em <b className="text-marca">Novo</b> e cadastre o primeiro!</p>
        </div>
      )}

      {lista.map((c) => (
        <div key={c.id} onClick={() => setAberto(aberto === c.id ? null : c.id)}
          className="bg-white border border-linha rounded-xl p-4 cursor-pointer active:opacity-80">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-tinta">{c.nome}</div>
              <div className="text-xs mt-0.5 text-apoio">
                {exibirCelular(c.celular_e164)} · {c.bairro ? `${c.bairro} · ` : ""}{c.cidade}
              </div>
            </div>
            <ChevronRight size={16} className="text-apoio" style={{ transform: aberto === c.id ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {c.consent === "sim" && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-50 text-ok"><CheckCircle2 size={10} /> LGPD ok</span>}
            {c.consent === "pendente" && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-alerta"><AlertTriangle size={10} /> Opt-in pendente</span>}
            {c.consent === "recusou" && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-erro"><X size={10} /> Recusou</span>}
            {c.origem && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-fundo text-apoio"><Tag size={10} /> {c.origem}</span>}
          </div>
          {aberto === c.id && (
            <div className="mt-3 pt-3 border-t border-linha space-y-2">
              {c.obs && <p className="text-xs text-apoio"><b className="text-tinta">Obs:</b> {c.obs}</p>}
              <a href={linkWa(c.celular_e164, `Olá ${c.nome.split(" ")[0]}, tudo bem?`)} target="_blank" rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                style={{ background: "#1FAF5E" }}>
                <MessageCircle size={13} /> WhatsApp
              </a>
              <p className="text-[10px] text-apoio">Editar, arquivar e excluir chegam na Etapa 4.</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
