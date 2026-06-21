import { useEffect, useMemo, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { mascaraCelular } from "../lib/format";
import ModalImportar from "../components/ModalImportar";
import DetalheContato from "../components/DetalheContato";
import ExportarContatos from "../components/ExportarContatos";
import {
  Search, Tag, CheckCircle2, AlertTriangle, X,
  Building2, Smartphone, Archive, Download,
} from "lucide-react";

interface Contato {
  id: string; nome: string; celular_e164: string; cidade: string;
  bairro: string | null; origem: string | null; obs: string | null;
  consent: "sim" | "pendente" | "recusou"; status: string; criado_em: string;
  criado_por: string | null;
}

interface TagItem { id: string; nome: string; }

export default function Contatos({ perfil }: { perfil: Perfil }) {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [busca, setBusca] = useState("");
  const [cidadeF, setCidadeF] = useState("");
  const [bairroF, setBairroF] = useState("");
  const [consentF, setConsentF] = useState("");
  const [origemF, setOrigemF] = useState("");
  const [tagsFiltro, setTagsFiltro] = useState<string[]>([]);
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  const [tagsDisponiveis, setTagsDisponiveis] = useState<TagItem[]>([]);
  const [contatoTags, setContatoTags] = useState<Record<string, string[]>>({});
  const [detalhe, setDetalhe] = useState<Contato | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [importar, setImportar] = useState(false);

  const podeImportar = perfil.papel === "administrador" || perfil.papel === "coordenador";
  const podeExportar = perfil.papel === "administrador" || perfil.papel === "coordenador";
  const [exportar, setExportar] = useState(false);

  useEffect(() => {
    supabase.from("tags").select("id, nome").then(({ data }) =>
      setTagsDisponiveis((data as TagItem[]) ?? [])
    );
  }, []);

  const carregar = async () => {
    setCarregando(true);
    let q = supabase.from("contacts").select("*")
      .order("criado_em", { ascending: false }).limit(500);
    if (mostrarArquivados) {
      q = q.in("status", ["ativo", "arquivado"]);
    } else {
      q = q.eq("status", "ativo");
    }
    const { data } = await q;
    const lista = (data as Contato[]) ?? [];
    setContatos(lista);

    if (lista.length > 0) {
      const ids = lista.map((c) => c.id);
      const { data: ctData } = await supabase
        .from("contact_tags").select("contact_id, tag_id").in("contact_id", ids);
      const mapa: Record<string, string[]> = {};
      for (const row of (ctData ?? [])) {
        if (!mapa[row.contact_id]) mapa[row.contact_id] = [];
        mapa[row.contact_id].push(row.tag_id);
      }
      setContatoTags(mapa);
    } else {
      setContatoTags({});
    }
    setCarregando(false);
  };

  useEffect(() => { carregar(); }, [mostrarArquivados]);

  const cidades = useMemo(() => [...new Set(contatos.map((c) => c.cidade))].sort(), [contatos]);

  const bairrosDisp = useMemo(() => {
    if (!cidadeF) return [];
    return [...new Set(
      contatos.filter((c) => c.cidade === cidadeF && c.bairro).map((c) => c.bairro as string)
    )].sort();
  }, [contatos, cidadeF]);

  const origensDisp = useMemo(() =>
    [...new Set(contatos.map((c) => c.origem).filter(Boolean) as string[])].sort(),
    [contatos]
  );

  const lista = contatos.filter((c) => {
    if (cidadeF && c.cidade !== cidadeF) return false;
    if (bairroF && c.bairro !== bairroF) return false;
    if (consentF && c.consent !== consentF) return false;
    if (origemF && c.origem !== origemF) return false;
    if (busca && !(c.nome ?? "").toLowerCase().includes(busca.toLowerCase())
      && !(c.celular_e164 ?? "").includes(busca.replace(/\D/g, ""))) return false;
    if (tagsFiltro.length > 0) {
      const tagsDoContato = contatoTags[c.id] ?? [];
      if (!tagsFiltro.every((id) => tagsDoContato.includes(id))) return false;
    }
    return true;
  });

  const alternarTagFiltro = (id: string) =>
    setTagsFiltro((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const exibirCelular = (e164: string) => mascaraCelular((e164 ?? "").replace("+55", ""));

  const chipF = (ativo: boolean) =>
    `shrink-0 rounded-full px-3 py-1 text-xs font-medium ${ativo ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`;

  const temFiltro = !!(cidadeF || bairroF || consentF || origemF || busca || tagsFiltro.length);

  return (
    <div className="space-y-3 pb-4">
      <div className="flex gap-2">
        <button onClick={() => podeImportar && setImportar(true)} disabled={!podeImportar}
          title={podeImportar ? "" : "Apenas administrador e coordenador podem importar"}
          className="flex-1 rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 text-white bg-marca disabled:opacity-50 disabled:cursor-not-allowed">
          <Smartphone size={16} /> Importar
        </button>
        {podeExportar && (
          <button onClick={() => setExportar(true)}
            className="flex-1 rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 text-marca bg-white border border-marca">
            <Download size={16} /> Exportar
          </button>
        )}
      </div>

      {importar && (
        <ModalImportar perfil={perfil} cidades={cidades}
          onClose={() => setImportar(false)} onImportado={carregar} />
      )}

      {exportar && (
        <ExportarContatos
          perfil={perfil}
          filtrados={lista}
          contatoTags={contatoTags}
          tagsDisponiveis={tagsDisponiveis}
          onClose={() => setExportar(false)}
        />
      )}

      {/* Busca */}
      <div className="flex items-center gap-2 rounded-xl px-3 bg-white border border-linha">
        <Search size={15} className="text-apoio" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou celular"
          className="w-full py-2.5 text-sm bg-transparent outline-none text-tinta" />
        {busca && <button onClick={() => setBusca("")} className="text-apoio"><X size={14} /></button>}
      </div>

      {/* Filtro cidade */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => { setCidadeF(""); setBairroF(""); }} className={chipF(!cidadeF)}>Todas</button>
        {cidades.map((cd) => (
          <button key={cd} onClick={() => { setCidadeF(cd === cidadeF ? "" : cd); setBairroF(""); }}
            className={`${chipF(cidadeF === cd)} inline-flex items-center gap-1`}>
            <Building2 size={10} /> {cd}
          </button>
        ))}
      </div>

      {/* Filtro bairro (só quando cidade selecionada) */}
      {cidadeF && bairrosDisp.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button onClick={() => setBairroF("")} className={chipF(!bairroF)}>Todos bairros</button>
          {bairrosDisp.map((b) => (
            <button key={b} onClick={() => setBairroF(b === bairroF ? "" : b)} className={chipF(bairroF === b)}>{b}</button>
          ))}
        </div>
      )}

      {/* Filtros consent + origem */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setConsentF("")} className={chipF(!consentF)}>Todos</button>
        <button onClick={() => setConsentF(consentF === "sim" ? "" : "sim")}
          className={`${chipF(consentF === "sim")} inline-flex items-center gap-1`}>
          <CheckCircle2 size={9} /> LGPD ok
        </button>
        <button onClick={() => setConsentF(consentF === "pendente" ? "" : "pendente")}
          className={`${chipF(consentF === "pendente")} inline-flex items-center gap-1`}>
          <AlertTriangle size={9} /> Pendente
        </button>
        <button onClick={() => setConsentF(consentF === "recusou" ? "" : "recusou")}
          className={`${chipF(consentF === "recusou")} inline-flex items-center gap-1`}>
          <X size={9} /> Recusou
        </button>
        {origensDisp.map((o) => (
          <button key={o} onClick={() => setOrigemF(origemF === o ? "" : o)}
            className={chipF(origemF === o)}>{o}</button>
        ))}
      </div>

      {/* Filtro tags */}
      {tagsDisponiveis.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tagsDisponiveis.map((tg) => (
            <button key={tg.id} onClick={() => alternarTagFiltro(tg.id)}
              className={`${chipF(tagsFiltro.includes(tg.id))} inline-flex items-center gap-1`}>
              <Tag size={9} /> {tg.nome}
            </button>
          ))}
        </div>
      )}

      {/* Contador + toggle arquivados */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-apoio">
          {carregando ? "Carregando..." : `${lista.length} contato(s)`}
        </span>
        <button onClick={() => setMostrarArquivados((p) => !p)}
          className={`text-xs font-medium flex items-center gap-1 rounded-full px-2.5 py-1 border transition-colors ${mostrarArquivados ? "bg-alerta/10 border-amber-200 text-alerta" : "border-linha text-apoio bg-white"}`}>
          <Archive size={11} /> {mostrarArquivados ? "Ocultar arquivados" : "Ver arquivados"}
        </button>
      </div>

      {!carregando && lista.length === 0 && (
        <div className="bg-white border border-linha rounded-xl p-5 text-center">
          <p className="text-sm text-apoio">
            {temFiltro
              ? "Nenhum contato encontrado com esses filtros."
              : <>Base vazia. Vá em <b className="text-marca">Novo</b> e cadastre o primeiro!</>}
          </p>
        </div>
      )}

      {lista.map((c) => {
        const tagsDoContato = (contatoTags[c.id] ?? [])
          .map((tid) => tagsDisponiveis.find((t) => t.id === tid)?.nome)
          .filter(Boolean) as string[];
        const arquivado = c.status === "arquivado";

        return (
          <div key={c.id} onClick={() => setDetalhe(c)}
            className={`bg-white border rounded-xl p-4 cursor-pointer active:opacity-80 ${arquivado ? "opacity-70 border-amber-200" : "border-linha"}`}>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-tinta truncate">{c.nome}</div>
                <div className="text-xs mt-0.5 text-apoio">
                  {exibirCelular(c.celular_e164)} · {c.bairro ? `${c.bairro} · ` : ""}{c.cidade}
                </div>
              </div>
              {arquivado && (
                <span className="shrink-0 text-[10px] text-alerta font-medium flex items-center gap-0.5 ml-2">
                  <Archive size={10} /> Arquivado
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {c.consent === "sim" && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-50 text-ok">
                  <CheckCircle2 size={10} /> LGPD ok
                </span>
              )}
              {c.consent === "pendente" && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-alerta">
                  <AlertTriangle size={10} /> Opt-in pendente
                </span>
              )}
              {c.consent === "recusou" && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-erro">
                  <X size={10} /> Recusou
                </span>
              )}
              {c.origem && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-fundo text-apoio">
                  <Tag size={10} /> {c.origem}
                </span>
              )}
              {tagsDoContato.map((nome) => (
                <span key={nome} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-50 text-marca">
                  <Tag size={10} /> {nome}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {detalhe && (
        <DetalheContato
          perfil={perfil}
          contato={detalhe}
          cidades={cidades}
          onFechar={() => setDetalhe(null)}
          onAlterado={() => { carregar(); setDetalhe(null); }}
        />
      )}
    </div>
  );
}
