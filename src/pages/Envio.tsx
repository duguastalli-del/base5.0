import { useEffect, useMemo, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { useTerminologia } from "../contexts/TerminologiaContext";
import { linkWa, mascaraCelular } from "../lib/format";
import Templates from "./Templates";
import EnvioLista from "../components/EnvioLista";
import {
  AlertTriangle, ArrowLeft, Building2, Check, CheckCircle2,
  CheckSquare, Loader2, MessageCircle, Send, Settings,
  SkipForward, Square, Tag, X,
} from "lucide-react";

interface Template {
  id: string; nome: string; texto: string;
  tipo: "normal" | "optin";
  media_url: string | null; media_type: "image" | "video" | null;
}

interface ContatoFila {
  id: string; nome: string; celular_e164: string;
  cidade: string; bairro: string | null; consent: string;
  criado_por: string;
}

interface TagItem { id: string; nome: string; }

type StatusFila = "pendente" | "em_andamento" | "enviado" | "pulado";
interface ItemFila { contato: ContatoFila; status: StatusFila; }

const personalizar = (corpo: string, contato: ContatoFila) => {
  const nome = (contato.nome ?? "").split(" ")[0];
  const regiao = contato.bairro || contato.cidade || "";
  return (corpo ?? "").replace(/\{nome\}/g, nome).replace(/\{regiao\}/g, regiao);
};

export default function Envio({ perfil }: { perfil: Perfil }) {
  const [vista, setVista] = useState<"envio" | "templates">("envio");
  if (vista === "templates") return <Templates perfil={perfil} onVoltar={() => setVista("envio")} />;
  return <EnvioFila perfil={perfil} onGerenciarTemplates={() => setVista("templates")} />;
}

function EnvioFila({ perfil, onGerenciarTemplates }:
  { perfil: Perfil; onGerenciarTemplates: () => void }) {
  const { t } = useTerminologia();
  const podeGerenciar = perfil.papel === "administrador" || perfil.papel === "coordenador";
  const podeVerTodos = perfil.papel === "administrador" || perfil.papel === "coordenador";
  const [modo, setModo] = useState<"normal" | "optin" | "lista">("normal");

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSel, setTemplateSel] = useState<Template | null>(null);
  const [templateOptin, setTemplateOptin] = useState<Template | null>(null);

  // Fila de contatos
  const [fila, setFila] = useState<ContatoFila[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Filtros
  const [tags, setTags] = useState<TagItem[]>([]);
  const [filtCidade, setFiltCidade] = useState("");
  const [filtBairro, setFiltBairro] = useState("");
  const [filtTags, setFiltTags] = useState<string[]>([]);
  const [bairrosDisp, setBairrosDisp] = useState<string[]>([]);

  // Estado de envio individual por contato
  const [enviados, setEnviados] = useState<Record<string, string>>({}); // id → HH:MM
  const [autorizando, setAutorizando] = useState<string[]>([]);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [avisoFallback, setAvisoFallback] = useState<{ id: string; msg: string } | null>(null);

  // Seleção múltipla
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [showConfirmMassa, setShowConfirmMassa] = useState(false);

  // Fila de envio em massa
  const [filaItems, setFilaItems] = useState<ItemFila[] | null>(null);
  const [filaIndex, setFilaIndex] = useState(0);

  // Carrega templates e tags
  useEffect(() => {
    supabase.from("message_templates").select("*").then(({ data }) => {
      const ts = (data as Template[]) ?? [];
      setTemplates(ts);
      setTemplateSel(ts.find((tpl) => tpl.tipo === "normal") ?? null);
      setTemplateOptin(ts.find((tpl) => tpl.tipo === "optin") ?? null);
    });
    supabase.from("tags").select("id, nome").then(({ data }) => setTags((data as TagItem[]) ?? []));
  }, []);

  // Carrega fila de contatos
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    const carregar = async () => {
      let tagContactIds: string[] | null = null;
      if (filtTags.length > 0) {
        const { data: ctData } = await supabase
          .from("contact_tags")
          .select("contact_id, tag_id")
          .in("tag_id", filtTags);
        const contagens: Record<string, number> = {};
        for (const row of (ctData ?? [])) {
          contagens[row.contact_id] = (contagens[row.contact_id] ?? 0) + 1;
        }
        tagContactIds = Object.entries(contagens)
          .filter(([, n]) => n >= filtTags.length)
          .map(([id]) => id);
        if (tagContactIds.length === 0) {
          if (ativo) { setFila([]); setCarregando(false); }
          return;
        }
      }

      let q = supabase.from("contacts")
        .select("id, nome, celular_e164, cidade, bairro, consent, criado_por")
        .neq("status", "anonimizado")
        .neq("consent", "recusou");

      if (modo === "normal") q = q.eq("consent", "sim").eq("status", "ativo");
      else q = q.eq("consent", "pendente");

      if (!podeVerTodos) q = q.eq("criado_por", perfil.id);
      if (filtCidade) q = q.eq("cidade", filtCidade);
      if (tagContactIds !== null) q = q.in("id", tagContactIds);

      const { data } = await q.order("nome").limit(300);
      if (ativo) { setFila((data as ContatoFila[]) ?? []); setCarregando(false); }
    };
    carregar();
    return () => { ativo = false; };
  }, [modo, filtCidade, filtTags, podeVerTodos, perfil.id]);

  // Bairros disponíveis quando filtro de cidade muda
  useEffect(() => {
    setFiltBairro("");
    if (!filtCidade) { setBairrosDisp([]); return; }
    supabase.from("contacts").select("bairro").eq("cidade", filtCidade).not("bairro", "is", null).then(({ data }) => {
      const unicos = [...new Set((data ?? []).map((c) => c.bairro as string).filter(Boolean))].sort();
      setBairrosDisp(unicos);
    });
  }, [filtCidade]);

  // Limpar seleção quando filtros ou modo mudam
  useEffect(() => {
    setSelecionados(new Set());
  }, [filtCidade, filtBairro, filtTags, modo]);

  const cidades = useMemo(() => [...new Set(fila.map((c) => c.cidade))].sort(), [fila]);

  const listaFiltrada = useMemo(() => {
    let l = fila;
    if (filtBairro) l = l.filter((c) => c.bairro === filtBairro);
    return l;
  }, [fila, filtBairro]);

  const templateAtual = modo === "normal" ? templateSel : templateOptin;

  const alternarTag = (id: string) =>
    setFiltTags((p) => p.includes(id) ? p.filter((tg) => tg !== id) : [...p, id]);

  // --- Seleção múltipla ---
  const toggleSelecionado = (id: string) =>
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const todosSelecionados =
    listaFiltrada.length > 0 && listaFiltrada.every((c) => selecionados.has(c.id));

  const alguemSelecionado = selecionados.size > 0;

  const selecionarTodos = () => {
    if (todosSelecionados) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(listaFiltrada.map((c) => c.id)));
    }
  };

  const numSelecionados = listaFiltrada.filter((c) => selecionados.has(c.id)).length;

  // --- Envio individual ---
  const enviar = async (contato: ContatoFila) => {
    if (!templateAtual) return;
    setEnviandoId(contato.id);
    const msg = personalizar(templateAtual.texto, contato);
    let abrirWa = true;

    if (templateAtual.media_url) {
      try {
        const res = await fetch(templateAtual.media_url);
        const blob = await res.blob();
        const ext = templateAtual.media_type === "video" ? "mp4" : "jpg";
        const file = new File([blob], `campanha.${ext}`, { type: blob.type });

        if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: msg });
          abrirWa = false;
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = `campanha.${ext}`; a.click();
          URL.revokeObjectURL(url);
          setAvisoFallback({ id: contato.id, msg: `${templateAtual.media_type === "video" ? "Vídeo" : "Imagem"} baixado(a) nas suas Fotos. Anexe no WhatsApp que vai abrir agora.` });
        }
      } catch { /* segue só texto */ }
    }

    // Abre WA ANTES do await para iOS não bloquear o window.open
    if (abrirWa) window.open(linkWa(contato.celular_e164, msg), "_blank");

    await supabase.from("send_logs").insert({
      workspace_id: perfil.workspace_id,
      contact_id: contato.id,
      template_id: templateAtual.id,
      modo,
      enviado_por: perfil.id,
      mensagem_texto: msg,
    });

    const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    setEnviados((p) => ({ ...p, [contato.id]: agora }));
    setEnviandoId(null);
  };

  const marcarAutorizado = async (contato: ContatoFila) => {
    setAutorizando((p) => [...p, contato.id]);
    await supabase.from("contacts").update({ consent: "sim" }).eq("id", contato.id);
    setFila((p) => p.filter((c) => c.id !== contato.id));
    setAutorizando((p) => p.filter((x) => x !== contato.id));
  };

  const exibirCelular = (e164: string) => mascaraCelular((e164 ?? "").replace("+55", ""));

  // --- Fila de envio em massa ---
  const iniciarFilaEnvio = () => {
    const itens = listaFiltrada
      .filter((c) => selecionados.has(c.id))
      .map((c) => ({ contato: c, status: "pendente" as StatusFila }));
    setFilaItems(itens);
    setFilaIndex(0);
    setShowConfirmMassa(false);
  };

  const abrirWaFila = () => {
    if (!filaItems || !templateAtual) return;
    const item = filaItems[filaIndex];
    const msg = personalizar(templateAtual.texto, item.contato);
    window.open(linkWa(item.contato.celular_e164, msg), "_blank");
    setFilaItems((prev) =>
      prev!.map((it, i) => i === filaIndex ? { ...it, status: "em_andamento" } : it)
    );
  };

  const proximoFila = () => {
    if (!filaItems || !templateAtual) return;
    const item = filaItems[filaIndex];
    const msg = personalizar(templateAtual.texto, item.contato);
    supabase.from("send_logs").insert({
      workspace_id: perfil.workspace_id,
      contact_id: item.contato.id,
      template_id: templateAtual.id,
      modo: "massa",
      enviado_por: perfil.id,
      mensagem_texto: msg,
    }).then(undefined, () => {});
    supabase.from("audit_logs").insert({
      workspace_id: perfil.workspace_id,
      usuario_id: perfil.id,
      acao: "envio_assistido_individual",
      entidade: "contacts",
      detalhes: JSON.stringify({ contact_id: item.contato.id, modo: "massa" }),
    }).then(undefined, () => {});
    setFilaItems((prev) =>
      prev!.map((it, i) => i === filaIndex ? { ...it, status: "enviado" } : it)
    );
    setFilaIndex((prev) => prev + 1);
  };

  const pularFila = () => {
    setFilaItems((prev) =>
      prev!.map((it, i) => i === filaIndex ? { ...it, status: "pulado" } : it)
    );
    setFilaIndex((prev) => prev + 1);
  };

  const encerrarFila = () => {
    setFilaItems(null);
    setFilaIndex(0);
    setSelecionados(new Set());
  };

  // === RENDER: FILA DE ENVIO EM MASSA ===
  if (filaItems !== null) {
    const enviadosCount = filaItems.filter((i) => i.status === "enviado").length;
    const puladosCount = filaItems.filter((i) => i.status === "pulado").length;
    const total = filaItems.length;
    const processados = enviadosCount + puladosCount;
    const concluido = filaIndex >= total;

    if (concluido) {
      return (
        <div className="space-y-4 pb-4">
          <div className="text-center py-8">
            <CheckCircle2 size={52} className="mx-auto text-ok mb-3" />
            <h2 className="text-lg font-bold text-tinta">Envio concluído!</h2>
            <p className="text-sm text-apoio mt-1">
              {enviadosCount} enviado{enviadosCount !== 1 ? "s" : ""} · {puladosCount} pulado{puladosCount !== 1 ? "s" : ""} · {total} total
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-apoio uppercase tracking-wide">Resumo</p>
            {filaItems.map((item) => (
              <div key={item.contato.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-linha bg-white">
                <span className="text-base w-6 text-center shrink-0">
                  {item.status === "enviado" ? "✅" : "⊘"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-tinta truncate">{item.contato.nome}</div>
                  <div className="text-[10px] text-apoio">{item.contato.cidade}</div>
                </div>
                <span className="text-[10px] text-apoio shrink-0">
                  {item.status === "enviado" ? "enviado" : "pulado"}
                </span>
              </div>
            ))}
          </div>
          <button onClick={encerrarFila}
            className="w-full rounded-xl py-3 text-sm font-bold text-white bg-marca">
            Voltar ao envio assistido
          </button>
        </div>
      );
    }

    const currentItem = filaItems[filaIndex];
    const currentStatus = currentItem.status;

    return (
      <div className="space-y-3 pb-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={encerrarFila}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-apoio bg-white border border-linha">
            <ArrowLeft size={15} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-tinta">Envio em massa</p>
            <p className="text-xs text-apoio">{processados} de {total} processados</p>
          </div>
        </div>

        {/* Progresso */}
        <div className="bg-fundo rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-marca rounded-full h-1.5 transition-all duration-300"
            style={{ width: `${total > 0 ? (processados / total) * 100 : 0}%` }}
          />
        </div>

        {/* Card do contato atual */}
        <div className="bg-white border-2 border-marca rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-marca uppercase tracking-widest">
              {filaIndex + 1} de {total}
            </span>
            {currentStatus === "em_andamento" && (
              <span className="text-[10px] text-alerta bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                WhatsApp aberto · aguardando envio
              </span>
            )}
          </div>
          <div>
            <div className="text-base font-bold text-tinta">{currentItem.contato.nome}</div>
            <div className="text-xs text-apoio mt-0.5">
              {exibirCelular(currentItem.contato.celular_e164)} · {currentItem.contato.bairro ? `${currentItem.contato.bairro} · ` : ""}{currentItem.contato.cidade}
            </div>
          </div>
          {templateAtual && (
            <p className="text-xs text-apoio leading-relaxed bg-fundo rounded-lg p-2.5 line-clamp-3">
              {personalizar(templateAtual.texto, currentItem.contato)}
            </p>
          )}
        </div>

        {/* Botões de ação */}
        <div className="flex gap-2">
          {currentStatus === "pendente" ? (
            <button onClick={abrirWaFila}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white bg-marca active:opacity-80">
              <Send size={15} /> Iniciar envio
            </button>
          ) : (
            <>
              <button onClick={proximoFila}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white bg-ok active:opacity-80">
                <Check size={15} /> Próximo
              </button>
              <button onClick={pularFila}
                className="flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold text-apoio border border-linha bg-white active:bg-fundo">
                <SkipForward size={15} /> Pular
              </button>
            </>
          )}
        </div>

        {/* Lista completa da fila */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-apoio uppercase tracking-wide">Fila completa</p>
          {filaItems.map((item, i) => {
            const isCurrent = i === filaIndex;
            return (
              <div key={item.contato.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-colors ${
                  isCurrent ? "border-marca bg-blue-50" : "border-linha bg-white"
                }`}>
                <span className="text-base w-5 text-center shrink-0">
                  {item.status === "enviado" ? "✅"
                    : item.status === "pulado" ? "⊘"
                    : item.status === "em_andamento" ? "📤"
                    : "⏳"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-tinta truncate">{item.contato.nome}</div>
                  <div className="text-[10px] text-apoio">{item.contato.cidade}</div>
                </div>
                {isCurrent && (
                  <span className="text-[9px] font-bold text-marca uppercase shrink-0">atual</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // === RENDER PRINCIPAL ===
  const temBarraFlutuante = alguemSelecionado && !!templateAtual && modo !== "lista";

  return (
    <div className={`space-y-3 ${temBarraFlutuante ? "pb-20" : "pb-4"}`}>
      {/* Aviso TSE/LGPD */}
      <div className="rounded-xl p-3 bg-amber-50 border border-amber-200 flex items-start gap-2">
        <AlertTriangle size={15} className="shrink-0 mt-0.5 text-alerta" />
        <p className="text-xs text-alerta leading-relaxed">
          <b>Envio assistido conforme TSE/LGPD.</b> Sem disparo em massa: uma mensagem por vez, com confirmação humana, apenas para quem autorizou.
        </p>
      </div>

      {/* Botão gerenciar templates */}
      {podeGerenciar && (
        <button onClick={onGerenciarTemplates}
          className="w-full rounded-xl py-2 text-xs font-semibold flex items-center justify-center gap-1.5 text-marca bg-white border border-linha">
          <Settings size={13} /> Gerenciar templates
        </button>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1.5">
        <button onClick={() => setModo("normal")}
          className={`flex-1 rounded-xl py-2.5 text-xs font-semibold ${modo === "normal" ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
          Mensagem
        </button>
        <button onClick={() => setModo("optin")}
          className={`flex-1 rounded-xl py-2.5 text-xs font-semibold ${modo === "optin" ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
          Opt-in
        </button>
        {podeGerenciar && (
          <button onClick={() => setModo("lista")}
            className={`flex-1 rounded-xl py-2.5 text-xs font-semibold ${modo === "lista" ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
            Lista
          </button>
        )}
      </div>

      {/* Lista de transmissão */}
      {modo === "lista" && <EnvioLista perfil={perfil} />}

      {/* Seletor de template (modo normal) */}
      {modo === "normal" && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-tinta">Template</p>
          <div className="space-y-1.5">
            {templates.filter((tpl) => tpl.tipo === "normal").map((tpl) => (
              <button key={tpl.id} onClick={() => setTemplateSel(tpl)}
                className={`w-full text-left rounded-xl p-3 border text-xs leading-relaxed ${templateSel?.id === tpl.id ? "border-marca bg-blue-50" : "border-linha bg-white"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-tinta">{tpl.nome}</span>
                  {tpl.media_url && (
                    <span className="flex items-center gap-1 text-apoio">
                      {tpl.media_type === "image"
                        ? <img src={tpl.media_url} alt="" className="w-8 h-6 rounded object-cover" />
                        : <span className="text-[10px] font-medium text-apoio">🎬 Vídeo</span>}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-apoio">{personalizar(tpl.texto, { nome: "João", bairro: "Centro", cidade: "SBO" } as ContatoFila)}</p>
              </button>
            ))}
            {templates.filter((tpl) => tpl.tipo === "normal").length === 0 && (
              <p className="text-xs text-apoio p-3 bg-white border border-linha rounded-xl">Nenhum template normal encontrado. Crie um em "Gerenciar templates".</p>
            )}
          </div>
        </div>
      )}

      {/* Template opt-in fixo */}
      {modo === "optin" && templateOptin && (
        <div className="rounded-xl p-3 bg-white border border-linha">
          <p className="text-[10px] font-semibold text-apoio uppercase tracking-wide mb-1">Template fixo (opt-in)</p>
          <p className="text-xs text-tinta leading-relaxed">{templateOptin.nome}</p>
          <p className="text-xs text-apoio mt-1">{personalizar(templateOptin.texto, { nome: "João", bairro: "Centro", cidade: "SBO" } as ContatoFila)}</p>
        </div>
      )}

      {/* Filtros e lista — ocultos na aba Lista de transmissão */}
      {modo !== "lista" && <>
        {/* Filtros cidade / bairro / tags */}
        <div className="space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button onClick={() => setFiltCidade("")}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${!filtCidade ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
              Todas
            </button>
            {cidades.map((cd) => (
              <button key={cd} onClick={() => setFiltCidade(cd === filtCidade ? "" : cd)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium inline-flex items-center gap-1 ${filtCidade === cd ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
                <Building2 size={10} /> {cd}
              </button>
            ))}
          </div>

          {filtCidade && bairrosDisp.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              <button onClick={() => setFiltBairro("")}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${!filtBairro ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
                Todos bairros
              </button>
              {bairrosDisp.map((b) => (
                <button key={b} onClick={() => setFiltBairro(b === filtBairro ? "" : b)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${filtBairro === b ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
                  {b}
                </button>
              ))}
            </div>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tg) => (
                <button key={tg.id} onClick={() => alternarTag(tg.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium inline-flex items-center gap-1 ${filtTags.includes(tg.id) ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
                  <Tag size={9} /> {tg.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-apoio">
          {carregando ? "Carregando..." : `${listaFiltrada.length} ${listaFiltrada.length === 1 ? t("contato") : t("contatos")} na fila`}
        </p>

        {/* Barra de seleção em massa */}
        {!carregando && listaFiltrada.length > 0 && (
          <div className="rounded-xl bg-white border border-linha p-3 space-y-2">
            <button onClick={selecionarTodos} className="flex items-center gap-2.5 w-full text-left">
              <span className="shrink-0">
                {todosSelecionados
                  ? <CheckSquare size={20} className="text-marca" />
                  : <Square size={20} className="text-apoio" />}
              </span>
              <span className="text-xs font-semibold text-tinta">
                {todosSelecionados
                  ? `Desmarcar todos (${listaFiltrada.length} visíveis)`
                  : `Selecionar todos (${listaFiltrada.length} visíveis)`}
              </span>
            </button>
            {alguemSelecionado && (
              <div className="flex items-center justify-between pt-1.5 border-t border-linha">
                <span className="text-xs text-apoio">
                  {numSelecionados} de {listaFiltrada.length} {numSelecionados === 1 ? t("contato") : t("contatos")} selecionado{numSelecionados !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => setSelecionados(new Set())}
                  className="text-xs text-erro font-medium flex items-center gap-1">
                  <X size={11} /> Limpar seleção
                </button>
              </div>
            )}
          </div>
        )}

        {/* Aviso sem template */}
        {!templateAtual && !carregando && (
          <div className="rounded-xl p-3 bg-white border border-linha text-xs text-apoio text-center">
            Selecione um template acima para habilitar o envio.
          </div>
        )}

        {/* Lista de contatos */}
        {listaFiltrada.map((c) => {
          const foiEnviado = c.id in enviados;
          const horaEnvio = enviados[c.id];
          const msg = templateAtual ? personalizar(templateAtual.texto, c) : "";
          const esteEnviando = enviandoId === c.id;
          const estaSelecionado = selecionados.has(c.id);

          return (
            <div
              key={c.id}
              onClick={() => { if (!foiEnviado) toggleSelecionado(c.id); }}
              className={`bg-white border rounded-xl p-4 space-y-2 transition-all ${
                foiEnviado
                  ? "opacity-60 cursor-default"
                  : estaSelecionado
                    ? "border-marca bg-blue-50/40 cursor-pointer"
                    : "border-linha cursor-pointer active:bg-fundo"
              }`}
              style={foiEnviado ? { borderColor: "#1E8E5A" } : {}}>

              <div className="flex items-start gap-2.5">
                {/* Checkbox visual */}
                {!foiEnviado && (
                  <span className="shrink-0 mt-0.5 transition-transform active:scale-90">
                    {estaSelecionado
                      ? <CheckSquare size={20} className="text-marca" />
                      : <Square size={20} className="text-apoio" />}
                  </span>
                )}

                <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-tinta">{c.nome}</div>
                    <div className="text-xs text-apoio">{exibirCelular(c.celular_e164)} · {c.bairro ? `${c.bairro} · ` : ""}{c.cidade}</div>
                  </div>
                  {foiEnviado
                    ? <span className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold bg-green-50 text-ok"><CheckCircle2 size={10} /> Enviado {horaEnvio}</span>
                    : templateAtual && (
                      <button
                        onClick={(e) => { e.stopPropagation(); enviar(c); }}
                        disabled={esteEnviando}
                        className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white bg-marca disabled:opacity-60">
                        {esteEnviando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        {esteEnviando ? "" : "Enviar"}
                      </button>
                    )}
                </div>
              </div>

              {/* Preview da mensagem */}
              {templateAtual && (
                <div className="flex gap-2 items-start">
                  {templateAtual.media_url && (
                    <div className="shrink-0 w-10 h-8 rounded-lg overflow-hidden border border-linha bg-fundo flex items-center justify-center">
                      {templateAtual.media_type === "image"
                        ? <img src={templateAtual.media_url} alt="" className="w-full h-full object-cover" />
                        : <span className="text-[9px] text-apoio">🎬</span>}
                    </div>
                  )}
                  <p className="text-xs text-apoio leading-relaxed line-clamp-2">{msg}</p>
                </div>
              )}

              {/* Aviso fallback iOS */}
              {avisoFallback?.id === c.id && (
                <div className="rounded-lg p-2 bg-amber-50 border border-amber-200 text-xs text-alerta flex items-start gap-1.5">
                  <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                  {avisoFallback.msg}
                </div>
              )}

              {/* Botão opt-in */}
              {modo === "optin" && foiEnviado && !autorizando.includes(c.id) && (
                <button
                  onClick={(e) => { e.stopPropagation(); marcarAutorizado(c); }}
                  className="w-full rounded-xl py-2 text-xs font-bold text-ok border border-green-200 bg-green-50 flex items-center justify-center gap-1.5">
                  <CheckCircle2 size={13} /> Respondeu SIM — marcar como autorizado
                </button>
              )}
              {autorizando.includes(c.id) && (
                <p className="text-xs text-ok flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Atualizando...</p>
              )}
            </div>
          );
        })}

        {!carregando && listaFiltrada.length === 0 && (
          <div className="bg-white border border-linha rounded-xl p-5 text-center">
            <MessageCircle size={24} className="mx-auto mb-2 text-apoio" />
            <p className="text-sm text-apoio">
              {modo === "normal"
                ? `Nenhum ${t("contato").toLowerCase()} com consentimento (LGPD ok) neste filtro.`
                : `Nenhum ${t("contato").toLowerCase()} com opt-in pendente neste filtro.`}
            </p>
          </div>
        )}
      </>}

      {/* Barra flutuante de envio em massa */}
      {temBarraFlutuante && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-full max-w-md px-4 pointer-events-none z-40">
          <button
            onClick={() => setShowConfirmMassa(true)}
            className="pointer-events-auto w-full flex items-center justify-center gap-2 bg-marca text-white rounded-2xl py-4 text-sm font-bold shadow-lg shadow-black/20 active:opacity-90">
            <Send size={16} />
            Enviar para {numSelecionados} {numSelecionados === 1 ? t("contato") : t("contatos")} selecionado{numSelecionados !== 1 ? "s" : ""}
          </button>
        </div>
      )}

      {/* Modal de confirmação de envio em massa */}
      {showConfirmMassa && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setShowConfirmMassa(false)}>
          <div
            className="bg-white rounded-t-2xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-texto text-sm">Confirmar envio em massa</h2>
              <button onClick={() => setShowConfirmMassa(false)}><X size={18} className="text-apoio" /></button>
            </div>
            <p className="text-sm text-tinta leading-relaxed">
              Você vai enviar a mensagem template para{" "}
              <b>{numSelecionados} {numSelecionados === 1 ? t("contato") : t("contatos")}</b>{" "}
              selecionado{numSelecionados !== 1 ? "s" : ""}.
            </p>
            <p className="text-xs text-apoio leading-relaxed">
              Os envios serão sequenciais pelo WhatsApp do seu celular. O app vai abrir a janela do WhatsApp para cada contato, um por um, e você confirma o envio em cada janela.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowConfirmMassa(false)}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-apoio border border-linha bg-white">
                Cancelar
              </button>
              <button
                onClick={iniciarFilaEnvio}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white bg-marca">
                Confirmar e iniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
