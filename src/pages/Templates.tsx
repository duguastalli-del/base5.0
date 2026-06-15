import { useEffect, useRef, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { ArrowLeft, Plus, Pencil, Trash2, Image, Loader2, AlertTriangle, X, Play } from "lucide-react";

const URL_BASE = (import.meta.env.VITE_SUPABASE_URL as string);
const LIMITE_IMAGEM = 5 * 1024 * 1024;   // 5 MB
const LIMITE_VIDEO  = 16 * 1024 * 1024;  // 16 MB

interface Template {
  id: string; nome: string; texto: string;
  tipo: "normal" | "optin";
  media_url: string | null; media_type: "image" | "video" | null;
}

const EXEMPLO = { nome: "João", regiao: "Jardim América" };
const personalizar = (corpo: string) =>
  (corpo ?? "").replace(/\{nome\}/g, EXEMPLO.nome).replace(/\{regiao\}/g, EXEMPLO.regiao);

export default function Templates({ perfil, onVoltar }: { perfil: Perfil; onVoltar: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editando, setEditando] = useState<Template | null | "novo">(null);
  const [excluindo, setExcluindo] = useState<Template | null>(null);
  const [carregando, setCarregando] = useState(true);

  const podeEditar = perfil.papel === "administrador" || perfil.papel === "coordenador";

  const carregar = async () => {
    setCarregando(true);
    const { data } = await supabase.from("message_templates").select("*").order("tipo").order("nome");
    setTemplates((data as Template[]) ?? []);
    setCarregando(false);
  };
  useEffect(() => { carregar(); }, []);

  const excluir = async (t: Template) => {
    if (t.media_url) {
      const path = t.media_url.split("/campaign-media/")[1];
      if (path) await supabase.storage.from("campaign-media").remove([path]);
    }
    await supabase.from("message_templates").delete().eq("id", t.id);
    setExcluindo(null);
    carregar();
  };

  return (
    <div className="space-y-4 pb-4">
      <button onClick={onVoltar} className="flex items-center gap-1.5 text-xs text-apoio font-medium">
        <ArrowLeft size={14} /> Voltar ao envio
      </button>

      {podeEditar && (
        <button onClick={() => setEditando("novo")}
          className="w-full rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 text-white bg-marca">
          <Plus size={16} /> Novo template
        </button>
      )}

      {carregando && <p className="text-xs text-apoio text-center py-4">Carregando...</p>}

      {templates.map((t) => (
        <div key={t.id} className="bg-white border border-linha rounded-xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-tinta">{t.nome}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${t.tipo === "normal" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-alerta"}`}>
                  {t.tipo === "normal" ? "Normal" : "Opt-in"}
                </span>
              </div>
              <p className="text-xs mt-1 text-apoio whitespace-pre-wrap">{personalizar(t.texto)}</p>
            </div>
            {podeEditar && (
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => setEditando(t)} className="text-apoio p-1"><Pencil size={14} /></button>
                <button onClick={() => setExcluindo(t)} className="text-erro p-1"><Trash2 size={14} /></button>
              </div>
            )}
          </div>
          {t.media_url && (
            <div className="rounded-xl overflow-hidden border border-linha w-24 h-16 bg-fundo flex items-center justify-center relative">
              {t.media_type === "image"
                ? <img src={t.media_url} alt="" className="w-full h-full object-cover" />
                : <div className="flex flex-col items-center gap-1 text-apoio"><Play size={18} /><span className="text-[10px]">Vídeo</span></div>}
            </div>
          )}
        </div>
      ))}

      {!carregando && templates.length === 0 && (
        <div className="bg-white border border-linha rounded-xl p-5 text-center">
          <p className="text-sm text-apoio">Nenhum template encontrado. O seed criou 3 templates — verifique se as funções SQL foram aplicadas.</p>
        </div>
      )}

      {editando !== null && (
        <ModalTemplate
          perfil={perfil}
          inicial={editando === "novo" ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar(); }}
          urlBase={URL_BASE}
        />
      )}

      {excluindo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <p className="text-sm font-semibold text-tinta">Excluir template "{excluindo.nome}"?</p>
            <p className="text-xs text-apoio">Essa ação não pode ser desfeita. Registros em send_logs mantêm o histórico.</p>
            <div className="flex gap-2">
              <button onClick={() => setExcluindo(null)} className="flex-1 rounded-xl py-2.5 text-sm font-semibold border border-linha text-apoio">Cancelar</button>
              <button onClick={() => excluir(excluindo)} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white bg-erro">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalTemplate({ perfil, inicial, onFechar, onSalvo, urlBase }:
  { perfil: Perfil; inicial: Template | null; onFechar: () => void; onSalvo: () => void; urlBase: string }) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [tipo, setTipo] = useState<"normal" | "optin">(inicial?.tipo ?? "normal");
  const [mediaUrl, setMediaUrl] = useState<string | null>(inicial?.media_url ?? null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(inicial?.media_type ?? null);
  const [uploading, setUploading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMidia = async (file: File) => {
    setErro("");
    const isImg = file.type.startsWith("image/");
    const isVid = file.type.startsWith("video/");
    if (!isImg && !isVid) return setErro("Envie apenas imagem (JPG/PNG) ou vídeo (MP4).");
    if (isImg && file.size > LIMITE_IMAGEM) return setErro("Imagem acima de 5 MB — escolha um arquivo menor.");
    if (isVid && file.size > LIMITE_VIDEO) return setErro("Vídeo acima de 16 MB — escolha um arquivo menor.");

    setUploading(true);
    // Remove mídia anterior se existir
    if (mediaUrl) {
      const oldPath = mediaUrl.split("/campaign-media/")[1];
      if (oldPath) await supabase.storage.from("campaign-media").remove([oldPath]);
    }
    const ext = file.name.split(".").pop() ?? (isImg ? "jpg" : "mp4");
    const path = `${perfil.workspace_id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("campaign-media").upload(path, file);
    setUploading(false);
    if (error) return setErro("Falha no upload: " + error.message);
    const publicUrl = `${urlBase}/storage/v1/object/public/campaign-media/${path}`;
    setMediaUrl(publicUrl);
    setMediaType(isImg ? "image" : "video");
  };

  const removerMidia = async () => {
    if (!mediaUrl) return;
    const path = mediaUrl.split("/campaign-media/")[1];
    if (path) await supabase.storage.from("campaign-media").remove([path]);
    setMediaUrl(null); setMediaType(null);
  };

  const salvar = async () => {
    setErro("");
    if (!nome.trim()) return setErro("Dê um nome ao template.");
    if (!texto.trim()) return setErro("O texto da mensagem não pode ser vazio.");
    setSalvando(true);
    const payload = { nome: nome.trim(), texto: texto.trim(), tipo, media_url: mediaUrl, media_type: mediaType };
    const { error } = inicial
      ? await supabase.from("message_templates").update(payload).eq("id", inicial.id)
      : await supabase.from("message_templates").insert({ ...payload, workspace_id: perfil.workspace_id, criado_por: perfil.id });
    setSalvando(false);
    if (error) return setErro("Falha ao salvar: " + error.message);
    onSalvo();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onFechar}>
      <div className="w-full sm:max-w-md bg-fundo rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-linha">
          <span className="text-sm font-bold text-tinta">{inicial ? "Editar template" : "Novo template"}</span>
          <button onClick={onFechar} className="text-apoio"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div>
            <label className="text-xs font-semibold mb-1 block text-tinta">Nome</label>
            <input className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
              value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Convite reunião" />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block text-tinta">Tipo</label>
            <div className="flex gap-2">
              {(["normal", "optin"] as const).map((t) => (
                <button key={t} onClick={() => setTipo(t)}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold ${tipo === t ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
                  {t === "normal" ? "Normal (autorizados)" : "Opt-in (pendentes)"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block text-tinta">Mensagem</label>
            <textarea className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white min-h-[90px]"
              value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Use {nome} e {regiao} como variáveis." />
            <p className="text-[10px] mt-1 text-apoio">Preview: {personalizar(texto || "{nome} – {regiao}")}</p>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block text-tinta">Mídia (opcional)</label>
            {mediaUrl ? (
              <div className="flex items-center gap-2">
                <div className="w-16 h-12 rounded-xl overflow-hidden border border-linha bg-fundo flex items-center justify-center">
                  {mediaType === "image"
                    ? <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
                    : <Play size={16} className="text-apoio" />}
                </div>
                <button onClick={removerMidia} className="text-xs text-erro flex items-center gap-1"><X size={12} /> Remover mídia</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full rounded-xl py-2.5 text-xs font-medium border border-dashed border-marca text-marca bg-white flex items-center justify-center gap-2 disabled:opacity-60">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
                {uploading ? "Enviando..." : "Anexar imagem (até 5 MB) ou vídeo (até 16 MB)"}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,video/mp4" className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadMidia(e.target.files[0])} />
          </div>
          {erro && <p className="text-xs flex items-center gap-1.5 font-medium text-erro"><AlertTriangle size={12} /> {erro}</p>}
        </div>
        <div className="px-4 py-3 bg-white border-t border-linha">
          <button onClick={salvar} disabled={salvando}
            className="w-full rounded-xl py-3 text-sm font-bold text-white bg-marca disabled:opacity-60 flex items-center justify-center gap-2">
            {salvando && <Loader2 size={14} className="animate-spin" />}
            {salvando ? "Salvando..." : "Salvar template"}
          </button>
        </div>
      </div>
    </div>
  );
}
