import { useEffect, useState, useCallback } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { Plus, Send, Eye, RefreshCw, ChevronLeft, ChevronRight, Check, AlertCircle, Loader2 } from "lucide-react";

interface Disparo {
  id: string;
  nome: string;
  status: string;
  template_id: string;
  filtros_aplicados: Record<string, unknown>;
  total_destinatarios: number;
  enviados: number;
  entregues: number | null;
  lidos: number | null;
  respondidos: number;
  opt_outs: number;
  falhas: number;
  criado_em: string;
  iniciado_em: string | null;
  finalizado_em: string | null;
}

interface Template {
  id: string;
  nome: string;
  meta_template_name: string;
  status: string;
  corpo: string;
  parametros: string[];
  idioma: string;
}

interface Tag { id: string; nome: string; }

const STATUS_BADGE: Record<string, string> = {
  rascunho: "bg-zinc-100 text-zinc-600",
  agendado:  "bg-blue-100 text-blue-700",
  enviando:  "bg-amber-100 text-amber-700",
  concluido: "bg-green-100 text-green-700",
  pausado:   "bg-orange-100 text-orange-700",
  falha:     "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", agendado: "Agendado", enviando: "Enviando…",
  concluido: "Concluído", pausado: "Pausado", falha: "Com falha",
};

const CAMPOS_PARAM = [
  { value: "primeiro_nome", label: "Primeiro nome" },
  { value: "nome",          label: "Nome completo" },
  { value: "cidade",        label: "Cidade" },
  { value: "bairro",        label: "Bairro" },
  { value: "bairro_ou_cidade", label: "Bairro ou cidade" },
];

export default function WhatsAppCampanhas({ perfil }: { perfil: Perfil }) {
  const [vista, setVista] = useState<"lista" | "wizard" | "detalhe">("lista");
  const [disparos, setDisparos] = useState<Disparo[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [cidades, setCidades] = useState<string[]>([]);
  const [origens, setOrigens] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [disparoDetalhe, setDisparoDetalhe] = useState<Disparo | null>(null);
  const [enviandoCampanha, setEnviandoCampanha] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  // ── Wizard state ────────────────────────────────────────────────────────────
  const [etapa, setEtapa] = useState(1);
  const [wzNome, setWzNome] = useState("");
  const [wzTemplateId, setWzTemplateId] = useState("");
  const [wzCidade, setWzCidade] = useState("");
  const [wzBairro, setWzBairro] = useState("");
  const [wzOrigem, setWzOrigem] = useState("");
  const [wzTagIds, setWzTagIds] = useState<string[]>([]);
  const [wzMapeamento, setWzMapeamento] = useState<string[]>([]);
  const [wzRate, setWzRate] = useState(80);
  const [wzEstimativa, setWzEstimativa] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  const templateSelecionado = templates.find((t) => t.id === wzTemplateId);
  const numParams = (templateSelecionado?.parametros ?? []).length;

  // ── Carrega dados ────────────────────────────────────────────────────────────
  const carregarDisparos = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase
      .from("whatsapp_disparos")
      .select("id, nome, status, template_id, filtros_aplicados, total_destinatarios, enviados, entregues, lidos, respondidos, opt_outs, falhas, criado_em, iniciado_em, finalizado_em")
      .eq("workspace_id", perfil.workspace_id)
      .order("criado_em", { ascending: false });
    setDisparos((data ?? []) as Disparo[]);
    setCarregando(false);
  }, [perfil.workspace_id]);

  useEffect(() => {
    carregarDisparos();

    supabase
      .from("whatsapp_templates")
      .select("id, nome, meta_template_name, status, corpo, parametros, idioma")
      .eq("workspace_id", perfil.workspace_id)
      .eq("status", "aprovado")
      .then(({ data }) => setTemplates((data ?? []) as Template[]));

    supabase
      .from("tags")
      .select("id, nome")
      .eq("workspace_id", perfil.workspace_id)
      .then(({ data }) => setTags((data ?? []) as Tag[]));

    supabase
      .from("contacts")
      .select("cidade")
      .eq("workspace_id", perfil.workspace_id)
      .eq("status", "ativo")
      .then(({ data }) => {
        const unicas = [...new Set((data ?? []).map((r) => r.cidade).filter(Boolean))].sort() as string[];
        setCidades(unicas);
      });

    supabase
      .from("contacts")
      .select("origem")
      .eq("workspace_id", perfil.workspace_id)
      .eq("status", "ativo")
      .then(({ data }) => {
        const unicas = [...new Set((data ?? []).map((r) => r.origem).filter(Boolean))].sort() as string[];
        setOrigens(unicas);
      });
  }, [perfil.workspace_id, carregarDisparos]);

  // ── Estimativa de audiência ──────────────────────────────────────────────────
  useEffect(() => {
    if (etapa !== 2) return;
    let q = supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", perfil.workspace_id)
      .eq("status", "ativo")
      .eq("consent", "sim");
    if (wzCidade) q = q.eq("cidade", wzCidade);
    if (wzBairro) q = q.ilike("bairro", `%${wzBairro}%`);
    if (wzOrigem) q = q.eq("origem", wzOrigem);

    if (wzTagIds.length > 0) {
      supabase
        .from("contact_tags")
        .select("contact_id, tag_id")
        .in("tag_id", wzTagIds)
        .then(({ data }) => {
          const contagens: Record<string, number> = {};
          for (const r of (data ?? [])) contagens[r.contact_id] = (contagens[r.contact_id] ?? 0) + 1;
          const ids = Object.entries(contagens).filter(([, n]) => n >= wzTagIds.length).map(([id]) => id);
          setWzEstimativa(ids.length);
        });
    } else {
      q.then(({ count }) => setWzEstimativa(count ?? 0));
    }
  }, [etapa, wzCidade, wzBairro, wzOrigem, wzTagIds, perfil.workspace_id]);

  // ── Inicializa mapeamento quando template muda ───────────────────────────────
  useEffect(() => {
    if (templateSelecionado) {
      setWzMapeamento(new Array(numParams).fill("primeiro_nome"));
    }
  }, [wzTemplateId, numParams, templateSelecionado]);

  // ── Enviar campanha existente ────────────────────────────────────────────────
  const enviarCampanha = async (disparoId: string) => {
    setEnviandoCampanha(disparoId);
    setErro("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-enviar-disparo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ disparo_id: disparoId }),
        }
      );
      const json = await res.json();
      if (!json.ok) setErro(json.mensagem ?? "Erro ao enviar campanha.");
      else await carregarDisparos();
    } catch {
      setErro("Erro de conexão ao enviar campanha.");
    } finally {
      setEnviandoCampanha(null);
    }
  };

  // ── Salvar disparo (wizard step 4) ───────────────────────────────────────────
  const salvarDisparo = async () => {
    if (!wzNome.trim() || !wzTemplateId) return;
    setSalvando(true);
    setErro("");
    const filtros: Record<string, unknown> = { rate_limit_por_minuto: wzRate };
    if (wzCidade) filtros.cidade = wzCidade;
    if (wzBairro) filtros.bairro = wzBairro;
    if (wzOrigem) filtros.origem = wzOrigem;
    if (wzTagIds.length > 0) filtros.tags = wzTagIds;
    if (wzMapeamento.length > 0) filtros.parametros_mapeamento = wzMapeamento;

    const { error } = await supabase.from("whatsapp_disparos").insert({
      workspace_id: perfil.workspace_id,
      template_id: wzTemplateId,
      nome: wzNome.trim(),
      status: "rascunho",
      filtros_aplicados: filtros,
    });

    if (error) { setErro("Erro ao salvar: " + error.message); setSalvando(false); return; }

    supabase.from("audit_logs").insert({
      workspace_id: perfil.workspace_id,
      usuario_id: perfil.id,
      acao: "criar_campanha_whatsapp",
      entidade: "whatsapp_disparos",
      detalhes: JSON.stringify({ nome: wzNome.trim(), template_id: wzTemplateId, filtros }),
    }).catch(() => {});
    await carregarDisparos();
    resetWizard();
    setVista("lista");
    setSalvando(false);
  };

  const resetWizard = () => {
    setEtapa(1); setWzNome(""); setWzTemplateId(""); setWzCidade(""); setWzBairro("");
    setWzOrigem(""); setWzTagIds([]); setWzMapeamento([]); setWzRate(80); setWzEstimativa(null);
  };

  // ── Render helpers ───────────────────────────────────────────────────────────
  const toggleTag = (id: string) =>
    setWzTagIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const pct = (n: number | null | undefined, total: number) =>
    total > 0 && n ? Math.round(((n ?? 0) / total) * 100) : 0;

  // ──────────────────────────────────────────────────────────────────────────────
  // VISTA: DETALHE
  // ──────────────────────────────────────────────────────────────────────────────
  if (vista === "detalhe" && disparoDetalhe) {
    const d = disparoDetalhe;
    const total = d.total_destinatarios || 1;
    const metricas = [
      { label: "Destinatários", val: d.total_destinatarios, cor: "bg-zinc-400" },
      { label: "Enviados",      val: d.enviados,             cor: "bg-blue-500" },
      { label: "Entregues",     val: d.entregues ?? 0,       cor: "bg-indigo-500" },
      { label: "Lidos",         val: d.lidos ?? 0,           cor: "bg-purple-500" },
      { label: "Respondidos",   val: d.respondidos,          cor: "bg-green-500" },
    ];
    return (
      <div className="space-y-3">
        <button onClick={() => setVista("lista")} className="flex items-center gap-1 text-sm text-marca font-semibold">
          <ChevronLeft size={16} /> Voltar
        </button>
        <div className="bg-white rounded-2xl border border-linha p-4 space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-texto">{d.nome}</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[d.status] ?? "bg-zinc-100 text-zinc-600"}`}>
              {STATUS_LABEL[d.status] ?? d.status}
            </span>
          </div>
          {d.finalizado_em && <p className="text-xs text-apoio">Concluído em {new Date(d.finalizado_em).toLocaleString("pt-BR")}</p>}
        </div>

        {/* Funil de métricas */}
        <div className="bg-white rounded-2xl border border-linha p-4 space-y-2.5">
          <p className="text-sm font-semibold text-texto">Funil de entrega</p>
          {metricas.map((m) => (
            <div key={m.label} className="space-y-0.5">
              <div className="flex justify-between text-xs text-apoio">
                <span>{m.label}</span>
                <span className="font-semibold text-texto">{(m.val ?? 0).toLocaleString("pt-BR")} <span className="text-apoio font-normal">({pct(m.val, total)}%)</span></span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div className={`h-full ${m.cor} rounded-full transition-all`} style={{ width: `${pct(m.val, total)}%` }} />
              </div>
            </div>
          ))}
          <div className="flex gap-3 pt-1 text-xs">
            <span className="text-red-600 font-semibold">✗ Falhas: {d.falhas}</span>
            <span className="text-orange-600 font-semibold">↩ Opt-outs: {d.opt_outs}</span>
          </div>
        </div>

        {["rascunho", "agendado", "pausado"].includes(d.status) && (
          <button
            onClick={() => enviarCampanha(d.id)}
            disabled={enviandoCampanha === d.id}
            className="w-full flex items-center justify-center gap-2 bg-green-600 text-white rounded-2xl py-3 font-semibold text-sm disabled:opacity-60">
            {enviandoCampanha === d.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Enviar campanha agora
          </button>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // VISTA: WIZARD
  // ──────────────────────────────────────────────────────────────────────────────
  if (vista === "wizard") {
    const podeAvancar1 = wzNome.trim().length >= 3 && wzTemplateId !== "";
    const podeAvancar2 = true;
    const podeAvancar3 = numParams === 0 || wzMapeamento.every((m) => m !== "");

    return (
      <div className="space-y-3">
        <button onClick={() => { resetWizard(); setVista("lista"); }} className="flex items-center gap-1 text-sm text-marca font-semibold">
          <ChevronLeft size={16} /> Cancelar
        </button>

        {/* Barra de progresso */}
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`flex-1 h-1.5 rounded-full ${n <= etapa ? "bg-marca" : "bg-zinc-200"}`} />
          ))}
        </div>
        <p className="text-xs text-apoio text-center">Passo {etapa} de 4</p>

        {/* ── Etapa 1: Template ─────────────────────────────────────────────── */}
        {etapa === 1 && (
          <div className="bg-white rounded-2xl border border-linha p-4 space-y-4">
            <p className="font-semibold text-texto">Nome e template</p>
            <div>
              <label className="block text-xs text-apoio mb-1">Nome da campanha</label>
              <input value={wzNome} onChange={(e) => setWzNome(e.target.value)} placeholder="Ex: Convite evento junho" className="w-full border border-linha rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-marca" />
            </div>
            <div>
              <label className="block text-xs text-apoio mb-1">Template aprovado</label>
              {templates.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3">Nenhum template aprovado. Crie e submeta um template para a Meta primeiro.</p>
              ) : (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <button key={t.id} onClick={() => setWzTemplateId(t.id)}
                      className={`w-full text-left rounded-xl border p-3 text-sm transition-colors ${wzTemplateId === t.id ? "border-marca bg-blue-50" : "border-linha"}`}>
                      <div className="font-semibold text-texto">{t.nome}</div>
                      <div className="text-xs text-apoio mt-0.5 line-clamp-2">{t.corpo ?? ""}</div>
                      {(t.parametros ?? []).length > 0 && <div className="text-xs text-marca mt-1">{t.parametros.length} parâmetro(s): {(t.parametros ?? []).map((_, i) => `{{${i + 1}}}`).join(", ")}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setEtapa(2)} disabled={!podeAvancar1} className="w-full bg-marca text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-1">
              Próximo <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── Etapa 2: Audiência ───────────────────────────────────────────── */}
        {etapa === 2 && (
          <div className="bg-white rounded-2xl border border-linha p-4 space-y-4">
            <p className="font-semibold text-texto">Audiência</p>
            <p className="text-xs text-apoio -mt-2">Filtra contatos ativos com consentimento. Deixe em branco para incluir todos.</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-apoio mb-1">Cidade</label>
                <select value={wzCidade} onChange={(e) => setWzCidade(e.target.value)} className="w-full border border-linha rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-marca">
                  <option value="">Todas</option>
                  {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-apoio mb-1">Origem</label>
                <select value={wzOrigem} onChange={(e) => setWzOrigem(e.target.value)} className="w-full border border-linha rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-marca">
                  <option value="">Todas</option>
                  {origens.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-apoio mb-1">Bairro (contém)</label>
              <input value={wzBairro} onChange={(e) => setWzBairro(e.target.value)} placeholder="Ex: Centro" className="w-full border border-linha rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-marca" />
            </div>

            {tags.length > 0 && (
              <div>
                <label className="block text-xs text-apoio mb-1.5">Tags (contatos com TODAS as tags)</label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <button key={t.id} onClick={() => toggleTag(t.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${wzTagIds.includes(t.id) ? "bg-marca text-white border-marca" : "bg-white text-apoio border-linha"}`}>
                      {t.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {wzEstimativa !== null && (
              <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-800 font-semibold text-center">
                ~{wzEstimativa.toLocaleString("pt-BR")} contatos elegíveis
              </div>
            )}

            <div>
              <label className="block text-xs text-apoio mb-1">Limite de envio por minuto</label>
              <input type="number" min={1} max={200} value={wzRate} onChange={(e) => setWzRate(Number(e.target.value) || 80)} className="w-full border border-linha rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-marca" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEtapa(1)} className="flex-1 border border-linha rounded-xl py-2.5 text-sm font-semibold text-apoio flex items-center justify-center gap-1">
                <ChevronLeft size={16} /> Voltar
              </button>
              <button onClick={() => setEtapa(numParams > 0 ? 3 : 4)} disabled={!podeAvancar2} className="flex-1 bg-marca text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-1">
                Próximo <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Etapa 3: Parâmetros (só se template tiver {{N}}) ──────────────── */}
        {etapa === 3 && numParams > 0 && (
          <div className="bg-white rounded-2xl border border-linha p-4 space-y-4">
            <p className="font-semibold text-texto">Parâmetros do template</p>
            <p className="text-xs text-apoio -mt-2">Mapeie cada <code className="bg-zinc-100 px-1 rounded">{"{{N}}"}</code> para um campo do contato.</p>
            {Array.from({ length: numParams }, (_, i) => (
              <div key={i}>
                <label className="block text-xs text-apoio mb-1">{`{{${i + 1}}}`} — {templateSelecionado?.parametros?.[i] ?? `Parâmetro ${i + 1}`}</label>
                <select value={wzMapeamento[i] ?? ""} onChange={(e) => setWzMapeamento((prev) => { const next = [...prev]; next[i] = e.target.value; return next; })}
                  className="w-full border border-linha rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-marca">
                  <option value="">Selecione…</option>
                  {CAMPOS_PARAM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={() => setEtapa(2)} className="flex-1 border border-linha rounded-xl py-2.5 text-sm font-semibold text-apoio flex items-center justify-center gap-1">
                <ChevronLeft size={16} /> Voltar
              </button>
              <button onClick={() => setEtapa(4)} disabled={!podeAvancar3} className="flex-1 bg-marca text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-1">
                Próximo <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Etapa 4: Confirmar ───────────────────────────────────────────── */}
        {etapa === 4 && (
          <div className="bg-white rounded-2xl border border-linha p-4 space-y-4">
            <p className="font-semibold text-texto">Confirmar campanha</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-apoio">Nome</span><span className="font-semibold text-texto">{wzNome}</span></div>
              <div className="flex justify-between"><span className="text-apoio">Template</span><span className="font-semibold text-texto">{templateSelecionado?.nome ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-apoio">Audiência</span><span className="font-semibold text-texto">{wzEstimativa !== null ? `~${wzEstimativa.toLocaleString("pt-BR")} contatos` : "Calculando…"}</span></div>
              {wzCidade && <div className="flex justify-between"><span className="text-apoio">Cidade</span><span className="font-semibold text-texto">{wzCidade}</span></div>}
              {wzTagIds.length > 0 && <div className="flex justify-between"><span className="text-apoio">Tags</span><span className="font-semibold text-texto">{wzTagIds.length} selecionada(s)</span></div>}
              <div className="flex justify-between"><span className="text-apoio">Velocidade</span><span className="font-semibold text-texto">{wzRate} msg/min</span></div>
            </div>
            <p className="text-xs text-apoio bg-zinc-50 rounded-xl p-3">A campanha será salva como rascunho. Você pode enviá-la a qualquer momento na lista de campanhas.</p>
            {erro && <p className="text-xs text-red-600 bg-red-50 rounded-xl p-3">{erro}</p>}
            <div className="flex gap-2">
              <button onClick={() => setEtapa(numParams > 0 ? 3 : 2)} className="flex-1 border border-linha rounded-xl py-2.5 text-sm font-semibold text-apoio flex items-center justify-center gap-1">
                <ChevronLeft size={16} /> Voltar
              </button>
              <button onClick={salvarDisparo} disabled={salvando} className="flex-1 bg-marca text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Salvar rascunho
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // VISTA: LISTA
  // ──────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-texto">Campanhas WhatsApp</p>
        <div className="flex gap-2">
          <button onClick={carregarDisparos} className="p-2 rounded-xl border border-linha bg-white text-apoio">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setVista("wizard")} className="flex items-center gap-1 bg-marca text-white rounded-xl px-3 py-2 text-xs font-semibold">
            <Plus size={14} /> Nova
          </button>
        </div>
      </div>

      {erro && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-2xl p-3 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {erro}
        </div>
      )}

      {carregando ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-marca" /></div>
      ) : disparos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-linha p-8 text-center space-y-2">
          <p className="text-sm text-apoio">Nenhuma campanha ainda.</p>
          <button onClick={() => setVista("wizard")} className="text-marca text-sm font-semibold">Criar primeira campanha →</button>
        </div>
      ) : (
        <div className="space-y-2">
          {disparos.map((d) => {
            const total = d.total_destinatarios || 0;
            const progresso = total > 0 ? Math.round((d.enviados / total) * 100) : 0;
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-linha p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-texto text-sm">{d.nome}</p>
                    <p className="text-xs text-apoio mt-0.5">{new Date(d.criado_em).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[d.status] ?? "bg-zinc-100 text-zinc-600"}`}>
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                </div>

                {total > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-apoio">
                      <span>{d.enviados.toLocaleString("pt-BR")} enviados</span>
                      <span>{total.toLocaleString("pt-BR")} total</span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progresso}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 text-xs text-apoio">
                  {d.respondidos > 0 && <span className="text-green-700">↩ {d.respondidos} resp.</span>}
                  {d.opt_outs > 0 && <span className="text-orange-600">✗ {d.opt_outs} opt-out</span>}
                  {d.falhas > 0 && <span className="text-red-600">⚠ {d.falhas} falha(s)</span>}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => { setDisparoDetalhe(d); setVista("detalhe"); }}
                    className="flex-1 flex items-center justify-center gap-1 border border-linha rounded-xl py-2 text-xs font-semibold text-apoio">
                    <Eye size={13} /> Detalhes
                  </button>
                  {["rascunho", "agendado", "pausado"].includes(d.status) && (
                    <button onClick={() => enviarCampanha(d.id)} disabled={enviandoCampanha === d.id}
                      className="flex-1 flex items-center justify-center gap-1 bg-green-600 text-white rounded-xl py-2 text-xs font-semibold disabled:opacity-60">
                      {enviandoCampanha === d.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      Enviar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
