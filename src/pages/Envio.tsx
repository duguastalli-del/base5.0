import { useEffect, useMemo, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { linkWa, mascaraCelular } from "../lib/format";
import Templates from "./Templates";
import { AlertTriangle, Send, MessageCircle, CheckCircle2, Loader2, Building2, Tag, Settings } from "lucide-react";

interface Template {
  id: string; nome: string; corpo: string;
  tipo: "normal" | "optin";
  media_url: string | null; media_type: "image" | "video" | null;
}

interface ContatoFila {
  id: string; nome: string; celular_e164: string;
  cidade: string; bairro: string | null; consent: string;
  criado_por: string;
}

interface Tag { id: string; nome: string; }

const personalizar = (corpo: string, contato: ContatoFila) => {
  const nome = contato.nome.split(" ")[0];
  const regiao = contato.bairro || contato.cidade;
  return corpo.replace(/\{nome\}/g, nome).replace(/\{regiao\}/g, regiao);
};

export default function Envio({ perfil }: { perfil: Perfil }) {
  const [vista, setVista] = useState<"envio" | "templates">("envio");
  if (vista === "templates") return <Templates perfil={perfil} onVoltar={() => setVista("envio")} />;
  return <EnvioFila perfil={perfil} onGerenciarTemplates={() => setVista("templates")} />;
}

function EnvioFila({ perfil, onGerenciarTemplates }:
  { perfil: Perfil; onGerenciarTemplates: () => void }) {
  const podeGerenciar = perfil.papel === "administrador" || perfil.papel === "coordenador";
  const podeVerTodos = perfil.papel === "administrador" || perfil.papel === "coordenador";
  const [modo, setModo] = useState<"normal" | "optin">("normal");

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSel, setTemplateSel] = useState<Template | null>(null);
  const [templateOptin, setTemplateOptin] = useState<Template | null>(null);

  // Fila de contatos
  const [fila, setFila] = useState<ContatoFila[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Filtros
  const [tags, setTags] = useState<Tag[]>([]);
  const [filtCidade, setFiltCidade] = useState("");
  const [filtBairro, setFiltBairro] = useState("");
  const [filtTags, setFiltTags] = useState<string[]>([]);
  const [bairrosDisp, setBairrosDisp] = useState<string[]>([]);

  // Estado de envio por contato
  const [enviados, setEnviados] = useState<Record<string, string>>({}); // id → HH:MM
  const [autorizando, setAutorizando] = useState<string[]>([]);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [avisoFallback, setAvisoFallback] = useState<{ id: string; msg: string } | null>(null);

  // Carrega templates
  useEffect(() => {
    supabase.from("message_templates").select("*").then(({ data }) => {
      const ts = (data as Template[]) ?? [];
      setTemplates(ts);
      setTemplateSel(ts.find((t) => t.tipo === "normal") ?? null);
      setTemplateOptin(ts.find((t) => t.tipo === "optin") ?? null);
    });
    supabase.from("tags").select("id, nome").then(({ data }) => setTags((data as Tag[]) ?? []));
  }, []);

  // Carrega fila de contatos
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    const carregar = async () => {
      let q = supabase.from("contacts")
        .select("id, nome, celular_e164, cidade, bairro, consent, criado_por")
        .neq("status", "anonimizado")
        .neq("consent", "recusou");

      if (modo === "normal") q = q.eq("consent", "sim").eq("status", "ativo");
      else q = q.eq("consent", "pendente");

      if (!podeVerTodos) q = q.eq("criado_por", perfil.id);
      if (filtCidade) q = q.eq("cidade", filtCidade);

      const { data } = await q.order("nome").limit(300);
      if (ativo) { setFila((data as ContatoFila[]) ?? []); setCarregando(false); }
    };
    carregar();
    return () => { ativo = false; };
  }, [modo, filtCidade, podeVerTodos, perfil.id]);

  // Bairros disponíveis quando filtro de cidade muda
  useEffect(() => {
    setFiltBairro("");
    if (!filtCidade) { setBairrosDisp([]); return; }
    supabase.from("contacts").select("bairro").eq("cidade", filtCidade).not("bairro", "is", null).then(({ data }) => {
      const unicos = [...new Set((data ?? []).map((c) => c.bairro as string).filter(Boolean))].sort();
      setBairrosDisp(unicos);
    });
  }, [filtCidade]);

  const cidades = useMemo(() => [...new Set(fila.map((c) => c.cidade))].sort(), [fila]);

  const listaFiltrada = useMemo(() => {
    let l = fila;
    if (filtBairro) l = l.filter((c) => c.bairro === filtBairro);
    return l;
  }, [fila, filtBairro, filtTags]);

  const templateAtual = modo === "normal" ? templateSel : templateOptin;

  const alternarTag = (id: string) =>
    setFiltTags((p) => p.includes(id) ? p.filter((t) => t !== id) : [...p, id]);

  // Envio com suporte a mídia
  const enviar = async (contato: ContatoFila) => {
    if (!templateAtual) return;
    setEnviandoId(contato.id);
    const msg = personalizar(templateAtual.corpo, contato);
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
          // Fallback iOS: download automático + instrução
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = `campanha.${ext}`; a.click();
          URL.revokeObjectURL(url);
          setAvisoFallback({ id: contato.id, msg: `${templateAtual.media_type === "video" ? "Vídeo" : "Imagem"} baixado(a) nas suas Fotos. Anexe no WhatsApp que vai abrir agora.` });
        }
      } catch { /* não há mídia disponível, segue só com texto */ }
    }

    await supabase.from("send_logs").insert({
      workspace_id: perfil.workspace_id,
      contact_id: contato.id,
      template_id: templateAtual.id,
      modo,
      enviado_por: perfil.id,
    });

    if (abrirWa) window.open(linkWa(contato.celular_e164, msg), "_blank");

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

  const exibirCelular = (e164: string) => mascaraCelular(e164.replace("+55", ""));

  return (
    <div className="space-y-3 pb-4">
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
        {(["normal", "optin"] as const).map((m) => (
          <button key={m} onClick={() => setModo(m)}
            className={`flex-1 rounded-xl py-2.5 text-xs font-semibold ${modo === m ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
            {m === "normal" ? "Mensagem (autorizados)" : "Primeiro contato (opt-in)"}
          </button>
        ))}
      </div>

      {/* Seletor de template (só no modo normal) */}
      {modo === "normal" && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-tinta">Template</p>
          <div className="space-y-1.5">
            {templates.filter((t) => t.tipo === "normal").map((t) => (
              <button key={t.id} onClick={() => setTemplateSel(t)}
                className={`w-full text-left rounded-xl p-3 border text-xs leading-relaxed ${templateSel?.id === t.id ? "border-marca bg-blue-50" : "border-linha bg-white"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-tinta">{t.nome}</span>
                  {t.media_url && (
                    <span className="flex items-center gap-1 text-apoio">
                      {t.media_type === "image" ? <img src={t.media_url} alt="" className="w-8 h-6 rounded object-cover" /> : <span className="text-[10px] font-medium text-apoio">🎬 Vídeo</span>}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-apoio">{personalizar(t.corpo, { nome: "João", bairro: "Centro", cidade: "SBO" } as ContatoFila)}</p>
              </button>
            ))}
            {templates.filter((t) => t.tipo === "normal").length === 0 && (
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
          <p className="text-xs text-apoio mt-1">{personalizar(templateOptin.corpo, { nome: "João", bairro: "Centro", cidade: "SBO" } as ContatoFila)}</p>
        </div>
      )}

      {/* Filtros */}
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
        {carregando ? "Carregando..." : `${listaFiltrada.length} contato(s) na fila`}
      </p>

      {/* Aviso sem template */}
      {!templateAtual && !carregando && (
        <div className="rounded-xl p-3 bg-white border border-linha text-xs text-apoio text-center">
          Selecione um template acima para habilitar o envio.
        </div>
      )}

      {/* Fila */}
      {listaFiltrada.map((c) => {
        const foiEnviado = c.id in enviados;
        const horaEnvio = enviados[c.id];
        const msg = templateAtual ? personalizar(templateAtual.corpo, c) : "";
        const esteEnviando = enviandoId === c.id;

        return (
          <div key={c.id} className={`bg-white border rounded-xl p-4 space-y-2 transition-opacity ${foiEnviado ? "opacity-60" : "border-linha"}`}
            style={foiEnviado ? { borderColor: "#1E8E5A" } : {}}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-tinta">{c.nome}</div>
                <div className="text-xs text-apoio">{exibirCelular(c.celular_e164)} · {c.bairro ? `${c.bairro} · ` : ""}{c.cidade}</div>
              </div>
              {foiEnviado
                ? <span className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold bg-green-50 text-ok"><CheckCircle2 size={10} /> Enviado {horaEnvio}</span>
                : templateAtual && (
                  <button onClick={() => enviar(c)} disabled={esteEnviando}
                    className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white bg-marca disabled:opacity-60">
                    {esteEnviando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    {esteEnviando ? "" : "Enviar"}
                  </button>
                )}
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
              <button onClick={() => marcarAutorizado(c)}
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
            {modo === "normal" ? "Nenhum contato com consentimento (LGPD ok) neste filtro." : "Nenhum contato com opt-in pendente neste filtro."}
          </p>
        </div>
      )}
    </div>
  );
}
