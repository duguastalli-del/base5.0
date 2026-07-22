import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import {
  AlertTriangle, Image, Loader2,
  Pencil, Plus, Send, Trash2, X,
} from "lucide-react";

const URL_BASE = import.meta.env.VITE_SUPABASE_URL as string;
const LIMITE_IMAGEM = 5 * 1024 * 1024;

interface WaTemplate {
  id: string;
  workspace_id: string;
  nome: string;
  meta_template_name: string;
  categoria: "marketing" | "utility" | "authentication";
  idioma: string;
  status: string;
  corpo: string;
  parametros: string[];
  cabecalho_tipo: string | null;
  cabecalho_conteudo: string | null;
  rodape: string | null;
  botoes: Botao[];
  meta_template_id: string | null;
  motivo_rejeicao: string | null;
  criado_em: string;
}

interface Botao {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
}

const STATUS_BADGE: Record<string, string> = {
  rascunho:   "bg-fundo text-apoio border-linha",
  submetido:  "bg-amber-50 text-alerta border-amber-200",
  aprovado:   "bg-green-50 text-ok border-green-200",
  rejeitado:  "bg-red-50 text-erro border-red-200",
  pausado:    "bg-orange-50 text-orange-600 border-orange-200",
  desativado: "bg-fundo text-apoio border-linha",
};

const CATEGORIA_INFO = {
  marketing:       "Promoções, notícias e campanhas. Requer opt-in explícito.",
  utility:         "Confirmações, atualizações e alertas. Opt-in implícito.",
  authentication:  "OTPs e códigos de verificação.",
};

function detectarParams(corpo: string): number[] {
  const matches = [...(corpo ?? "").matchAll(/\{\{(\d+)\}\}/g)];
  const nums = [...new Set(matches.map((m) => parseInt(m[1])))].sort((a, b) => a - b);
  return nums;
}

export default function WhatsAppTemplates({
  perfil,
  apiAtiva,
}: {
  perfil: Perfil;
  apiAtiva: boolean;
}) {
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<WaTemplate | null | "novo">(null);
  const [confirmExcluir, setConfirmExcluir] = useState<WaTemplate | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const podeGerenciar = perfil.papel === "administrador" || perfil.papel === "coordenador";

  const carregar = async () => {
    setCarregando(true);
    const { data } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("workspace_id", perfil.workspace_id)
      .order("criado_em", { ascending: false });
    setTemplates((data as WaTemplate[]) ?? []);
    setCarregando(false);
  };

  useEffect(() => { carregar(); }, []);

  const excluir = async (t: WaTemplate) => {
    setExcluindo(true);
    if (t.cabecalho_tipo === "imagem" && t.cabecalho_conteudo) {
      const path = t.cabecalho_conteudo.split("/campaign-media/")[1];
      if (path) await supabase.storage.from("campaign-media").remove([path]);
    }
    await supabase.from("whatsapp_templates").delete().eq("id", t.id);
    setExcluindo(false);
    setConfirmExcluir(null);
    carregar();
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-apoio" />
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-6">
      {!apiAtiva && (
        <div className="rounded-xl p-3 bg-amber-50 border border-amber-200 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-alerta" />
          <p className="text-xs text-alerta leading-relaxed">
            Configure e ative a API WhatsApp para poder submeter templates à Meta.
          </p>
        </div>
      )}

      {podeGerenciar && (
        <button
          onClick={() => setEditando("novo")}
          className="w-full rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 text-white bg-marca">
          <Plus size={16} /> Novo template
        </button>
      )}

      {templates.length === 0 && (
        <div className="bg-white border border-linha rounded-xl p-5 text-center">
          <p className="text-sm text-apoio">
            Nenhum template. Clique em "+ Novo template" para criar o primeiro.
          </p>
        </div>
      )}

      {templates.map((t) => (
        <div key={t.id} className="bg-white border border-linha rounded-xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-tinta truncate">{t.nome}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                    STATUS_BADGE[t.status] ?? STATUS_BADGE.rascunho
                  }`}>
                  {t.status}
                </span>
              </div>
              <p className="text-[10px] text-apoio mt-0.5 font-mono">{t.meta_template_name}</p>
              <p className="text-[10px] text-apoio mt-0.5 capitalize">{t.categoria}</p>
            </div>
            {podeGerenciar && (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setEditando(t)}
                  className="text-apoio p-1.5 rounded-lg hover:bg-fundo">
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setConfirmExcluir(t)}
                  className="text-erro p-1.5 rounded-lg hover:bg-red-50">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-apoio leading-relaxed line-clamp-2">{t.corpo ?? ""}</p>

          {t.motivo_rejeicao && (
            <p className="text-[10px] text-erro bg-red-50 rounded-lg px-2 py-1">
              Rejeição: {t.motivo_rejeicao}
            </p>
          )}
        </div>
      ))}

      {/* Modal editar/criar */}
      {editando !== null && (
        <ModalTemplate
          perfil={perfil}
          inicial={editando === "novo" ? null : editando}
          apiAtiva={apiAtiva}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar(); }}
        />
      )}

      {/* Confirm excluir */}
      {confirmExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <p className="text-sm font-semibold text-tinta">
              Excluir template "{confirmExcluir.nome}"?
            </p>
            <p className="text-xs text-apoio">
              Essa ação não pode ser desfeita. Histórico de envios é mantido.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmExcluir(null)}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold border border-linha text-apoio">
                Cancelar
              </button>
              <button
                onClick={() => excluir(confirmExcluir)}
                disabled={excluindo}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white bg-erro disabled:opacity-60 flex items-center justify-center gap-1.5">
                {excluindo && <Loader2 size={13} className="animate-spin" />}
                {excluindo ? "..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modal de formulário ────────────────────────────────────────────────────

function ModalTemplate({
  perfil,
  inicial,
  apiAtiva,
  onFechar,
  onSalvo,
}: {
  perfil: Perfil;
  inicial: WaTemplate | null;
  apiAtiva: boolean;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [metaNome, setMetaNome] = useState(inicial?.meta_template_name ?? "");
  const [metaNomeErro, setMetaNomeErro] = useState("");
  const [categoria, setCategoria] = useState<"marketing" | "utility" | "authentication">(
    inicial?.categoria ?? "marketing"
  );
  const [idioma, setIdioma] = useState(inicial?.idioma ?? "pt_BR");
  const [corpo, setCorpo] = useState(inicial?.corpo ?? "");
  const [cabTipo, setCabTipo] = useState<"" | "texto" | "imagem">(
    (inicial?.cabecalho_tipo as "" | "texto" | "imagem") ?? ""
  );
  const [cabConteudo, setCabConteudo] = useState(inicial?.cabecalho_conteudo ?? "");
  const [rodape, setRodape] = useState(inicial?.rodape ?? "");
  const [paramNomes, setParamNomes] = useState<string[]>(inicial?.parametros ?? []);
  const [paramExemplos, setParamExemplos] = useState<string[]>(
    (inicial?.parametros ?? []).map(() => "")
  );
  const [botoes, setBotoes] = useState<Botao[]>(inicial?.botoes ?? []);

  const [uploadingCab, setUploadingCab] = useState(false);
  const [erroUpload, setErroUpload] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [submetendo, setSubmetendo] = useState(false);
  const [erro, setErro] = useState("");
  const [avisoSubmit, setAvisoSubmit] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Detecta parâmetros no corpo e expande arrays se necessário
  useEffect(() => {
    const nums = detectarParams(corpo);
    const maxIdx = nums.length > 0 ? Math.max(...nums) : 0;
    setParamNomes((p) => {
      const arr = [...p];
      while (arr.length < maxIdx) arr.push("");
      return arr.slice(0, maxIdx);
    });
    setParamExemplos((p) => {
      const arr = [...p];
      while (arr.length < maxIdx) arr.push("");
      return arr.slice(0, maxIdx);
    });
  }, [corpo]);

  // Preview com substituição de parâmetros pelos exemplos
  const preview = useMemo(() => {
    let txt = corpo ?? "";
    paramNomes.forEach((_, i) => {
      const ex = (paramExemplos[i] ?? "") || (paramNomes[i] ?? "") || `{{${i + 1}}}`;
      txt = txt.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), ex);
    });
    return txt;
  }, [corpo, paramNomes, paramExemplos]);

  const validarMetaNome = (v: string) => {
    if (!v) return setMetaNomeErro("Obrigatório.");
    if (!/^[a-z0-9_]+$/.test(v))
      return setMetaNomeErro("Apenas letras minúsculas, números e underscore.");
    setMetaNomeErro("");
  };

  const uploadCabecalho = async (file: File) => {
    setErroUpload("");
    if (!file.type.startsWith("image/")) return setErroUpload("Envie apenas imagem (JPG/PNG).");
    if (file.size > LIMITE_IMAGEM) return setErroUpload("Imagem acima de 5 MB.");
    setUploadingCab(true);
    if (cabConteudo && cabConteudo.includes("/campaign-media/")) {
      const old = cabConteudo.split("/campaign-media/")[1];
      if (old) await supabase.storage.from("campaign-media").remove([old]);
    }
    const ext = (file.name.split(".").pop() ?? "jpg");
    const path = `${perfil.workspace_id}/wt-header-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("campaign-media").upload(path, file);
    setUploadingCab(false);
    if (error) return setErroUpload("Falha no upload: " + error.message);
    setCabConteudo(`${URL_BASE}/storage/v1/object/public/campaign-media/${path}`);
  };

  const removerCabecalho = async () => {
    if (cabConteudo && cabConteudo.includes("/campaign-media/")) {
      const path = cabConteudo.split("/campaign-media/")[1];
      if (path) await supabase.storage.from("campaign-media").remove([path]);
    }
    setCabConteudo("");
  };

  const montarPayload = (status: string) => ({
    workspace_id: perfil.workspace_id,
    nome: (nome ?? "").trim(),
    meta_template_name: (metaNome ?? "").trim(),
    categoria,
    idioma,
    corpo: (corpo ?? "").trim(),
    parametros: paramNomes,
    cabecalho_tipo: cabTipo || null,
    cabecalho_conteudo: (cabConteudo ?? "").trim() || null,
    rodape: (rodape ?? "").trim() || null,
    botoes,
    status,
    criado_por: perfil.id,
  });

  const salvarRascunho = async () => {
    setErro("");
    if (!(nome ?? "").trim()) return setErro("Nome interno é obrigatório.");
    if (!(metaNome ?? "").trim() || metaNomeErro) return setErro("Nome Meta inválido.");
    if (!(corpo ?? "").trim()) return setErro("O corpo da mensagem é obrigatório.");

    setSalvando(true);
    const payload = montarPayload(inicial?.status === "aprovado" ? "aprovado" : "rascunho");

    const { error } = inicial
      ? await supabase.from("whatsapp_templates").update(payload).eq("id", inicial.id)
      : await supabase.from("whatsapp_templates").insert({ ...payload, workspace_id: perfil.workspace_id });

    setSalvando(false);
    if (error) {
      if (error.code === "23505")
        return setErro("Já existe um template com esse Nome Meta neste workspace.");
      return setErro("Falha ao salvar: " + error.message);
    }
    supabase.from("audit_logs").insert({
      workspace_id: perfil.workspace_id,
      usuario_id: perfil.id,
      acao: inicial ? "editar_template_whatsapp" : "criar_template_whatsapp",
      entidade: "whatsapp_templates",
      detalhes: JSON.stringify({ nome, meta_nome: metaNome, categoria }),
    }).then(undefined, () => {});
    onSalvo();
  };

  const submeterMeta = async () => {
    setErro("");
    setAvisoSubmit("");
    if (!(nome ?? "").trim()) return setErro("Nome interno é obrigatório.");
    if (!(metaNome ?? "").trim() || metaNomeErro) return setErro("Nome Meta inválido.");
    if (!(corpo ?? "").trim()) return setErro("O corpo da mensagem é obrigatório.");

    setSubmetendo(true);
    const payload = montarPayload("submetido");

    let templateId = inicial?.id;
    if (!inicial) {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .insert({ ...payload, workspace_id: perfil.workspace_id })
        .select("id")
        .single();
      if (error) {
        setSubmetendo(false);
        if (error.code === "23505")
          return setErro("Já existe um template com esse Nome Meta neste workspace.");
        return setErro("Falha ao salvar: " + error.message);
      }
      templateId = data.id as string;
    } else {
      const { error } = await supabase
        .from("whatsapp_templates")
        .update(payload)
        .eq("id", inicial.id);
      if (error) {
        setSubmetendo(false);
        return setErro("Falha ao salvar: " + error.message);
      }
    }

    // Chama edge function (disponível na Entrega 3)
    try {
      const { error: fnErr } = await supabase.functions.invoke(
        "whatsapp-submeter-template",
        { body: { template_id: templateId } }
      );
      if (fnErr) throw fnErr;
    } catch {
      setAvisoSubmit(
        "Template salvo com status 'submetido'. A chamada à API Meta será completada após as Edge Functions serem ativadas (Entrega 3)."
      );
    }

    supabase.from("audit_logs").insert({
      workspace_id: perfil.workspace_id,
      usuario_id: perfil.id,
      acao: "submeter_template_whatsapp",
      entidade: "whatsapp_templates",
      entidade_id: templateId,
      detalhes: JSON.stringify({ nome, meta_nome: metaNome, categoria }),
    }).then(undefined, () => {});
    setSubmetendo(false);
    onSalvo();
  };

  const adicionarBotao = () => {
    if (botoes.length >= 3) return;
    setBotoes((p) => [...p, { type: "QUICK_REPLY", text: "" }]);
  };

  const atualizarBotao = (idx: number, campo: Partial<Botao>) => {
    setBotoes((p) => p.map((b, i) => (i === idx ? { ...b, ...campo } : b)));
  };

  const removerBotao = (idx: number) => {
    setBotoes((p) => p.filter((_, i) => i !== idx));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onFechar}>
      <div
        className="w-full sm:max-w-md bg-fundo rounded-t-2xl sm:rounded-2xl max-h-[94vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-linha">
          <span className="text-sm font-bold text-tinta">
            {inicial ? "Editar template" : "Novo template"}
          </span>
          <button onClick={onFechar} className="text-apoio p-1">
            <X size={18} />
          </button>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* Nome interno */}
          <div>
            <label className="text-xs font-semibold mb-1 block text-tinta">Nome interno *</label>
            <input
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: convite_reuniao"
            />
          </div>

          {/* Nome Meta */}
          <div>
            <label className="text-xs font-semibold mb-1 block text-tinta">
              Nome Meta *
              <span className="ml-1 text-apoio font-normal">(lowercase + underscore)</span>
            </label>
            <input
              className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none border bg-white font-mono ${
                metaNomeErro ? "border-erro" : "border-linha"
              }`}
              value={metaNome}
              onChange={(e) => {
                setMetaNome(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                validarMetaNome(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
              }}
              placeholder="ex: convite_reuniao_2026"
            />
            {metaNomeErro && (
              <p className="text-[10px] mt-0.5 text-erro">{metaNomeErro}</p>
            )}
          </div>

          {/* Categoria */}
          <div>
            <label className="text-xs font-semibold mb-1.5 block text-tinta">Categoria *</label>
            <div className="space-y-1.5">
              {(["marketing", "utility", "authentication"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoria(cat)}
                  className={`w-full text-left rounded-xl p-3 border text-xs ${
                    categoria === cat ? "border-marca bg-blue-50" : "border-linha bg-white"
                  }`}>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full border-2 shrink-0 flex items-center justify-center ${
                        categoria === cat ? "border-marca" : "border-linha"
                      }`}>
                      {categoria === cat && (
                        <div className="w-1.5 h-1.5 rounded-full bg-marca" />
                      )}
                    </div>
                    <span className="font-semibold text-tinta capitalize">{cat}</span>
                  </div>
                  <p className="mt-0.5 ml-5 text-apoio">{CATEGORIA_INFO[cat]}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Idioma */}
          <div>
            <label className="text-xs font-semibold mb-1 block text-tinta">Idioma</label>
            <select
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
              value={idioma}
              onChange={(e) => setIdioma(e.target.value)}>
              <option value="pt_BR">Português (Brasil)</option>
              <option value="en_US">English (US)</option>
              <option value="es_ES">Español</option>
            </select>
          </div>

          {/* Cabeçalho */}
          <div>
            <label className="text-xs font-semibold mb-1.5 block text-tinta">
              Cabeçalho (opcional)
            </label>
            <div className="flex gap-1.5">
              {(["", "texto", "imagem"] as const).map((tipo) => (
                <button
                  key={tipo || "nenhum"}
                  onClick={() => { setCabTipo(tipo); setCabConteudo(""); }}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold ${
                    cabTipo === tipo
                      ? "bg-marca text-white"
                      : "bg-white text-apoio border border-linha"
                  }`}>
                  {tipo === "" ? "Nenhum" : tipo === "texto" ? "Texto" : "Imagem"}
                </button>
              ))}
            </div>

            {cabTipo === "texto" && (
              <input
                className="w-full mt-2 rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
                value={cabConteudo}
                onChange={(e) => setCabConteudo(e.target.value)}
                placeholder="Texto do cabeçalho"
              />
            )}

            {cabTipo === "imagem" && (
              <div className="mt-2">
                {cabConteudo ? (
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-12 rounded-xl overflow-hidden border border-linha bg-fundo">
                      <img src={cabConteudo} alt="" className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={removerCabecalho}
                      className="text-xs text-erro flex items-center gap-1">
                      <X size={12} /> Remover
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadingCab}
                    className="w-full rounded-xl py-2.5 text-xs font-medium border border-dashed border-marca text-marca bg-white flex items-center justify-center gap-2 disabled:opacity-60">
                    {uploadingCab ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Image size={14} />
                    )}
                    {uploadingCab ? "Enviando..." : "Escolher imagem (até 5 MB)"}
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadCabecalho(e.target.files[0])}
                />
                {erroUpload && (
                  <p className="text-xs text-erro mt-1">{erroUpload}</p>
                )}
              </div>
            )}
          </div>

          {/* Corpo */}
          <div>
            <label className="text-xs font-semibold mb-1 block text-tinta">Corpo *</label>
            <textarea
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white min-h-[100px]"
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              placeholder="Use {{1}}, {{2}}... para variáveis personalizadas.&#10;Ex: Olá {{1}}, você está convidado(a) para o evento em {{2}}."
            />
            <p className="text-[10px] mt-0.5 text-apoio">
              {corpo.length} caracteres · {detectarParams(corpo).length} variável(is) detectada(s)
            </p>
          </div>

          {/* Parâmetros */}
          {paramNomes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-tinta">Mapeamento de variáveis</p>
              {paramNomes.map((nm, i) => (
                <div key={i} className="bg-white border border-linha rounded-xl p-3 space-y-1.5">
                  <p className="text-[10px] font-semibold text-apoio">
                    {"{{" + (i + 1) + "}}"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-apoio mb-0.5 block">Nome do campo</label>
                      <input
                        className="w-full rounded-lg px-2 py-1.5 text-xs outline-none border border-linha bg-white"
                        value={nm}
                        onChange={(e) => {
                          const arr = [...paramNomes];
                          arr[i] = e.target.value;
                          setParamNomes(arr);
                        }}
                        placeholder="ex: nome"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-apoio mb-0.5 block">Exemplo</label>
                      <input
                        className="w-full rounded-lg px-2 py-1.5 text-xs outline-none border border-linha bg-white"
                        value={paramExemplos[i] ?? ""}
                        onChange={(e) => {
                          const arr = [...paramExemplos];
                          arr[i] = e.target.value;
                          setParamExemplos(arr);
                        }}
                        placeholder="ex: João"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          {corpo && (
            <div>
              <p className="text-xs font-semibold text-tinta mb-1.5">Preview</p>
              <div className="bg-[#ECE5DD] rounded-xl p-3">
                {cabConteudo && cabTipo === "imagem" && (
                  <img
                    src={cabConteudo}
                    alt=""
                    className="w-full rounded-lg mb-2 object-cover max-h-32"
                  />
                )}
                {cabConteudo && cabTipo === "texto" && (
                  <p className="text-xs font-bold text-tinta mb-1">{cabConteudo}</p>
                )}
                <div className="bg-white rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-tinta leading-relaxed whitespace-pre-wrap">{preview}</p>
                  {rodape && (
                    <p className="text-[10px] text-apoio mt-1">{rodape}</p>
                  )}
                </div>
                {botoes.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {botoes.map((b, i) => (
                      <div key={i} className="bg-white rounded-xl py-2 text-center">
                        <span className="text-xs font-medium text-marca">{b.text || "Botão"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rodapé */}
          <div>
            <label className="text-xs font-semibold mb-1 block text-tinta">
              Rodapé (opcional)
            </label>
            <input
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
              value={rodape}
              onChange={(e) => setRodape(e.target.value.slice(0, 60))}
              placeholder="Ex: Responda PARAR para cancelar"
              maxLength={60}
            />
            <p className="text-[10px] mt-0.5 text-apoio text-right">{(rodape ?? "").length}/60</p>
          </div>

          {/* Botões */}
          <div>
            <label className="text-xs font-semibold mb-1.5 block text-tinta">
              Botões (opcional, máx. 3)
            </label>
            {botoes.map((b, idx) => (
              <div key={idx} className="bg-white border border-linha rounded-xl p-3 mb-2 space-y-2">
                <div className="flex items-center justify-between">
                  <select
                    className="text-xs border border-linha rounded-lg px-2 py-1.5 outline-none bg-white"
                    value={b.type}
                    onChange={(e) =>
                      atualizarBotao(idx, { type: e.target.value as Botao["type"], url: "", phone_number: "" })
                    }>
                    <option value="QUICK_REPLY">Quick Reply</option>
                    <option value="URL">URL</option>
                    <option value="PHONE_NUMBER">Ligação</option>
                  </select>
                  <button onClick={() => removerBotao(idx)} className="text-erro p-1">
                    <X size={13} />
                  </button>
                </div>
                <input
                  className="w-full rounded-lg px-2 py-1.5 text-xs outline-none border border-linha bg-white"
                  value={b.text}
                  onChange={(e) => atualizarBotao(idx, { text: e.target.value })}
                  placeholder="Texto do botão"
                />
                {b.type === "URL" && (
                  <input
                    className="w-full rounded-lg px-2 py-1.5 text-xs outline-none border border-linha bg-white"
                    value={b.url ?? ""}
                    onChange={(e) => atualizarBotao(idx, { url: e.target.value })}
                    placeholder="https://..."
                  />
                )}
                {b.type === "PHONE_NUMBER" && (
                  <input
                    className="w-full rounded-lg px-2 py-1.5 text-xs outline-none border border-linha bg-white"
                    value={b.phone_number ?? ""}
                    onChange={(e) => atualizarBotao(idx, { phone_number: e.target.value })}
                    placeholder="+55DDDXXXXXXXXX"
                  />
                )}
              </div>
            ))}
            {botoes.length < 3 && (
              <button
                onClick={adicionarBotao}
                className="w-full rounded-xl py-2 text-xs font-medium border border-dashed border-linha text-apoio flex items-center justify-center gap-1.5">
                <Plus size={12} /> Adicionar botão
              </button>
            )}
          </div>

          {erro && (
            <p className="text-xs text-erro flex items-center gap-1.5 font-medium">
              <AlertTriangle size={12} /> {erro}
            </p>
          )}
          {avisoSubmit && (
            <div className="rounded-xl p-3 bg-amber-50 border border-amber-200 text-xs text-alerta leading-relaxed">
              {avisoSubmit}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="px-4 py-3 bg-white border-t border-linha space-y-2">
          <div className="flex gap-2">
            <button
              onClick={onFechar}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold border border-linha text-apoio">
              Cancelar
            </button>
            <button
              onClick={salvarRascunho}
              disabled={salvando}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold border border-marca text-marca disabled:opacity-60 flex items-center justify-center gap-1.5">
              {salvando && <Loader2 size={13} className="animate-spin" />}
              {salvando ? "..." : "Salvar rascunho"}
            </button>
          </div>

          <button
            onClick={submeterMeta}
            disabled={submetendo || !apiAtiva}
            title={!apiAtiva ? "Aguardando configuração da API" : undefined}
            className="w-full rounded-xl py-2.5 text-sm font-bold text-white bg-marca disabled:opacity-50 flex items-center justify-center gap-1.5">
            {submetendo ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            {submetendo
              ? "Submetendo..."
              : !apiAtiva
              ? "Aguardando configuração da API"
              : "Submeter para Meta"}
          </button>
        </div>
      </div>
    </div>
  );
}
