import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { useTerminologia } from "../contexts/TerminologiaContext";
import { linkWa, mascaraCelular } from "../lib/format";
import {
  isDesktop, getEnviadosHoje, incrementarEnviadosHoje,
  limiteAtingido, LIMITE_DIARIO,
} from "../lib/plataforma-web";
import Templates from "./Templates";
import EnvioLista from "../components/EnvioLista";
import {
  AlertTriangle, ArrowLeft, Building2, Check, CheckCircle2,
  CheckSquare, Globe, Loader2, MessageCircle, Monitor, Pause,
  Play, Send, Settings, SkipForward, Square, Tag, X,
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

  // Detecção de plataforma (avaliada no render, safe em PWA sem SSR)
  const desktop = isDesktop();

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
  const [modoEnvioSelecionado, setModoEnvioSelecionado] = useState<"manual" | "web">("manual");

  // Fila manual
  const [filaItems, setFilaItems] = useState<ItemFila[] | null>(null);
  const [filaIndex, setFilaIndex] = useState(0);

  // Fila web automatizada
  const [filaWebItems, setFilaWebItems] = useState<ItemFila[] | null>(null);
  const [filaWebIndex, setFilaWebIndex] = useState(0);
  const [filaWebPausada, setFilaWebPausada] = useState(false);
  const [tempoRestante, setTempoRestante] = useState(-1); // -1 = sem countdown
  const [alertaRemovidosCnt, setAlertaRemovidosCnt] = useState(0);
  const [filaWebLimite, setFilaWebLimite] = useState(false);
  const [enviadosHojeCnt, setEnviadosHojeCnt] = useState(0);

  // Ref para evitar dupla abertura no useEffect de auto-open
  const autoOpenRef = useRef(false);

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

  // Countdown timer para fila web (decrementa 1s)
  useEffect(() => {
    if (filaWebItems === null || filaWebPausada || tempoRestante <= 0) return;
    const id = window.setTimeout(() => setTempoRestante((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
  }, [filaWebItems, filaWebPausada, tempoRestante]);

  // Auto-abre WhatsApp Web quando countdown chega a 0
  useEffect(() => {
    if (tempoRestante !== 0 || filaWebItems === null || filaWebPausada || autoOpenRef.current) return;
    const item = filaWebItems[filaWebIndex];
    if (!item || item.status !== "pendente" || !templateAtual) return;
    autoOpenRef.current = true;
    const msg = personalizar(templateAtual.texto, item.contato);
    const phone = item.contato.celular_e164.replace(/\D/g, "");
    window.open(
      `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`,
      "_blank"
    );
    setFilaWebItems((prev) =>
      prev ? prev.map((it, i) => i === filaWebIndex ? { ...it, status: "em_andamento" } : it) : prev
    );
    setTempoRestante(-1);
    autoOpenRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempoRestante]);

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

  // --- Fila manual ---
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

  // --- Fila web automatizada ---
  const iniciarFilaWeb = () => {
    if (!templateAtual) return;
    const selecionadosArray = listaFiltrada.filter((c) => selecionados.has(c.id));
    const comLgpd = selecionadosArray.filter((c) => c.consent === "sim");
    const removidos = selecionadosArray.length - comLgpd.length;
    setAlertaRemovidosCnt(removidos);

    if (comLgpd.length === 0) return;

    if (limiteAtingido()) {
      setFilaWebLimite(true);
      const hoje = getEnviadosHoje();
      setEnviadosHojeCnt(hoje);
      setFilaWebItems([]);
      setShowConfirmMassa(false);
      return;
    }

    const itens = comLgpd.map((c) => ({ contato: c, status: "pendente" as StatusFila }));
    setFilaWebItems(itens);
    setFilaWebIndex(0);
    setFilaWebPausada(false);
    setTempoRestante(-1);
    setFilaWebLimite(false);
    setEnviadosHojeCnt(getEnviadosHoje());
    setShowConfirmMassa(false);
  };

  const abrirWaWeb = (index?: number) => {
    if (!filaWebItems || !templateAtual) return;
    const idx = index ?? filaWebIndex;
    const item = filaWebItems[idx];
    if (!item) return;
    const msg = personalizar(templateAtual.texto, item.contato);
    const phone = item.contato.celular_e164.replace(/\D/g, "");
    window.open(
      `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`,
      "_blank"
    );
    setFilaWebItems((prev) =>
      prev ? prev.map((it, i) => i === idx ? { ...it, status: "em_andamento" } : it) : prev
    );
    setTempoRestante(-1);
  };

  const proximoWeb = () => {
    if (!filaWebItems || !templateAtual) return;
    const item = filaWebItems[filaWebIndex];
    const msg = personalizar(templateAtual.texto, item.contato);

    // Registra send_log + audit_log (fire-and-forget)
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
      detalhes: JSON.stringify({
        contact_id: item.contato.id,
        modo: "web_automatizado",
        template_id: templateAtual.id,
        plataforma: "desktop",
        user_agent: navigator.userAgent,
      }),
    }).then(undefined, () => {});

    // Incrementa contador diário
    incrementarEnviadosHoje();
    const hoje = getEnviadosHoje();
    setEnviadosHojeCnt(hoje);

    // Marca como enviado e avança
    setFilaWebItems((prev) =>
      prev ? prev.map((it, i) => i === filaWebIndex ? { ...it, status: "enviado" } : it) : prev
    );
    const nextIndex = filaWebIndex + 1;
    setFilaWebIndex(nextIndex);

    // Se limite atingido ou fila concluída, não inicia countdown
    if (hoje >= LIMITE_DIARIO || nextIndex >= filaWebItems.length) {
      if (hoje >= LIMITE_DIARIO) setFilaWebLimite(true);
      setTempoRestante(-1);
      return;
    }

    // Inicia countdown aleatório 30-90 segundos para o próximo
    const intervalo = Math.floor(Math.random() * 61) + 30;
    setTempoRestante(intervalo);
  };

  const pularWeb = () => {
    setFilaWebItems((prev) =>
      prev ? prev.map((it, i) => i === filaWebIndex ? { ...it, status: "pulado" } : it) : prev
    );
    setFilaWebIndex((prev) => prev + 1);
    setTempoRestante(-1);
  };

  const encerrarFilaWeb = () => {
    setFilaWebItems(null);
    setFilaWebIndex(0);
    setFilaWebPausada(false);
    setTempoRestante(-1);
    setFilaWebLimite(false);
    setSelecionados(new Set());
  };

  // === RENDER: FILA WEB AUTOMATIZADA ===
  if (filaWebItems !== null) {
    const enviadosCount = filaWebItems.filter((i) => i.status === "enviado").length;
    const puladosCount = filaWebItems.filter((i) => i.status === "pulado").length;
    const total = filaWebItems.length;
    const processados = enviadosCount + puladosCount;
    const concluido = filaWebIndex >= total;

    if (concluido || (filaWebLimite && filaWebIndex >= total)) {
      return (
        <div className="space-y-4 pb-4">
          <div className="text-center py-6">
            {filaWebLimite
              ? <AlertTriangle size={48} className="mx-auto text-alerta mb-3" />
              : <CheckCircle2 size={48} className="mx-auto text-ok mb-3" />}
            <h2 className="text-lg font-bold text-tinta">
              {filaWebLimite ? "Limite diário atingido" : "Envio concluído!"}
            </h2>
            <p className="text-sm text-apoio mt-1">
              {enviadosCount} enviado{enviadosCount !== 1 ? "s" : ""} · {puladosCount} pulado{puladosCount !== 1 ? "s" : ""} · {total} total
            </p>
            {filaWebLimite && (
              <p className="text-xs text-alerta mt-2 bg-amber-50 rounded-xl p-3">
                Você atingiu {LIMITE_DIARIO} envios hoje ({enviadosHojeCnt}/{LIMITE_DIARIO}). Continue amanhã.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-apoio uppercase tracking-wide">Resumo</p>
            {filaWebItems.map((item) => (
              <div key={item.contato.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-linha bg-white">
                <span className="text-base w-6 text-center shrink-0">
                  {item.status === "enviado" ? "✅" : item.status === "pulado" ? "⊘" : "⏳"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-tinta truncate">{item.contato.nome}</div>
                  <div className="text-[10px] text-apoio">{item.contato.cidade}</div>
                </div>
                <span className="text-[10px] text-apoio shrink-0">{item.status}</span>
              </div>
            ))}
          </div>
          <button onClick={encerrarFilaWeb}
            className="w-full rounded-xl py-3 text-sm font-bold text-white bg-marca">
            Voltar ao envio assistido
          </button>
        </div>
      );
    }

    const currentItem = filaWebItems[filaWebIndex];
    const currentStatus = currentItem.status;
    const restantes = total - processados - 1; // excluding current

    return (
      <div className="space-y-3 pb-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={encerrarFilaWeb}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-apoio bg-white border border-linha">
            <ArrowLeft size={15} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Globe size={13} className="text-marca" />
              <p className="text-sm font-bold text-tinta">Envio Web — Automático</p>
              <span className="text-[9px] font-bold text-white bg-marca rounded-full px-1.5 py-0.5">BETA</span>
            </div>
            <p className="text-xs text-apoio">{processados} de {total} processados</p>
          </div>
          {/* Limite diário */}
          <div className={`shrink-0 text-right ${enviadosHojeCnt >= LIMITE_DIARIO * 0.8 ? "text-alerta" : "text-apoio"}`}>
            <p className="text-[10px] font-bold">{enviadosHojeCnt}/{LIMITE_DIARIO}</p>
            <p className="text-[9px]">hoje</p>
          </div>
        </div>

        {/* Alerta de removidos por LGPD */}
        {alertaRemovidosCnt > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5 text-alerta" />
            <p className="text-xs text-alerta">
              {alertaRemovidosCnt} {alertaRemovidosCnt === 1 ? t("contato") : t("contatos")} sem LGPD ok {alertaRemovidosCnt === 1 ? "foi removido" : "foram removidos"} da fila.
            </p>
          </div>
        )}

        {/* Limite atingido banner */}
        {filaWebLimite && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-erro font-semibold text-center">
            Limite de {LIMITE_DIARIO} envios/dia atingido. Continue amanhã.
          </div>
        )}

        {/* Progresso */}
        <div className="bg-fundo rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-marca rounded-full h-1.5 transition-all duration-300"
            style={{ width: `${total > 0 ? (processados / total) * 100 : 0}%` }}
          />
        </div>

        {/* Card contato atual */}
        <div className="bg-white border-2 border-marca rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-marca uppercase tracking-widest">
              {filaWebIndex + 1} de {total}
            </span>
            <span className="text-[10px] bg-green-50 text-ok border border-green-200 rounded-full px-2 py-0.5 font-medium">
              LGPD ok
            </span>
          </div>
          <div>
            <div className="text-base font-bold text-tinta">{currentItem.contato.nome}</div>
            <div className="text-xs text-apoio mt-0.5">
              {exibirCelular(currentItem.contato.celular_e164)} · {currentItem.contato.cidade}
            </div>
          </div>
          {templateAtual && (
            <p className="text-xs text-apoio leading-relaxed bg-fundo rounded-lg p-2.5 line-clamp-3">
              {personalizar(templateAtual.texto, currentItem.contato)}
            </p>
          )}
          {restantes > 0 && (
            <p className="text-[10px] text-apoio">{restantes} {restantes === 1 ? t("contato") : t("contatos")} restante{restantes !== 1 ? "s" : ""} na fila</p>
          )}
        </div>

        {/* Instrução + Botões de ação */}
        {!filaWebLimite && (
          <div className="space-y-2">
            {currentStatus === "pendente" && tempoRestante > 0 && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-center space-y-2">
                <p className="text-xs text-marca font-semibold">
                  Aguardando {tempoRestante}s para abrir o próximo contato
                </p>
                <div className="bg-blue-200 rounded-full h-1 overflow-hidden">
                  <div className="bg-marca h-1 rounded-full transition-all duration-1000"
                    style={{ width: `${(1 - tempoRestante / 90) * 100}%` }} />
                </div>
                <button onClick={() => { setTempoRestante(0); }}
                  className="text-xs text-marca underline">
                  Abrir agora
                </button>
              </div>
            )}

            {currentStatus === "pendente" && tempoRestante <= 0 && (
              <button onClick={() => abrirWaWeb()}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white bg-marca active:opacity-80">
                <Globe size={15} /> Abrir no WhatsApp Web
              </button>
            )}

            {currentStatus === "em_andamento" && (
              <>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-alerta text-center">
                  WhatsApp Web aberto — envie a mensagem e volte aqui
                </div>
                <div className="flex gap-2">
                  <button onClick={proximoWeb}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white bg-ok active:opacity-80">
                    <Check size={15} /> Próximo
                  </button>
                  <button onClick={pularWeb}
                    className="flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold text-apoio border border-linha bg-white active:bg-fundo">
                    <SkipForward size={15} /> Pular
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Pausar / Retomar + Cancelar */}
        <div className="flex gap-2">
          <button
            onClick={() => { setFilaWebPausada((p) => !p); }}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-apoio border border-linha bg-white">
            {filaWebPausada ? <Play size={13} /> : <Pause size={13} />}
            {filaWebPausada ? "Retomar" : "Pausar"}
          </button>
          <button onClick={encerrarFilaWeb}
            className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold text-erro border border-red-200 bg-white">
            <X size={13} /> Cancelar fila
          </button>
        </div>

        {/* Lista completa da fila */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-apoio uppercase tracking-wide">Fila completa</p>
          {filaWebItems.map((item, i) => {
            const isCurrent = i === filaWebIndex;
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

  // === RENDER: FILA MANUAL ===
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

            {/* Seleção de modo — só no desktop */}
            {desktop && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-apoio uppercase tracking-wide">Escolha o modo de envio</p>

                {/* Modo Manual */}
                <button
                  onClick={() => setModoEnvioSelecionado("manual")}
                  className={`w-full text-left rounded-xl p-3 border transition-colors ${
                    modoEnvioSelecionado === "manual" ? "border-marca bg-blue-50" : "border-linha bg-white"
                  }`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      modoEnvioSelecionado === "manual" ? "border-marca" : "border-apoio"
                    }`}>
                      {modoEnvioSelecionado === "manual" && <div className="w-2 h-2 rounded-full bg-marca" />}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-tinta">Modo Manual (Fila)</p>
                      <p className="text-[10px] text-apoio">Você abre cada WhatsApp e envia manualmente</p>
                    </div>
                  </div>
                </button>

                {/* Modo Web */}
                <button
                  onClick={() => setModoEnvioSelecionado("web")}
                  className={`w-full text-left rounded-xl p-3 border transition-colors ${
                    modoEnvioSelecionado === "web" ? "border-marca bg-blue-50" : "border-linha bg-white"
                  }`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      modoEnvioSelecionado === "web" ? "border-marca" : "border-apoio"
                    }`}>
                      {modoEnvioSelecionado === "web" && <div className="w-2 h-2 rounded-full bg-marca" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-tinta">Modo Automático Web</p>
                        <span className="text-[9px] font-bold text-white bg-marca rounded-full px-1.5 py-0.5">BETA</span>
                      </div>
                      <p className="text-[10px] text-apoio">App abre WhatsApp Web na conversa certa — você só clica Enviar</p>
                      <p className="text-[10px] text-apoio">Limite: {LIMITE_DIARIO} mensagens/dia · já usados hoje: {getEnviadosHoje()}</p>
                      {!limiteAtingido() && (
                        <p className="text-[10px] text-ok">Somente {t("contatos").toLowerCase()} com LGPD ok são enviados</p>
                      )}
                      {limiteAtingido() && (
                        <p className="text-[10px] text-erro font-semibold">Limite diário atingido. Tente amanhã.</p>
                      )}
                    </div>
                    <Monitor size={16} className="text-marca shrink-0" />
                  </div>
                </button>
              </div>
            )}

            {/* Explicação (mobile só vê esta) */}
            {!desktop && (
              <p className="text-xs text-apoio leading-relaxed">
                Os envios serão sequenciais pelo WhatsApp do seu celular. O app vai abrir a janela do WhatsApp para cada contato, um por um, e você confirma o envio em cada janela.
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowConfirmMassa(false)}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-apoio border border-linha bg-white">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (desktop && modoEnvioSelecionado === "web") {
                    iniciarFilaWeb();
                  } else {
                    iniciarFilaEnvio();
                  }
                }}
                disabled={desktop && modoEnvioSelecionado === "web" && limiteAtingido()}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white bg-marca disabled:opacity-50">
                Confirmar e iniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
