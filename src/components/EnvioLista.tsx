import { useEffect, useRef, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { useTerminologia } from "../contexts/TerminologiaContext";
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, Copy,
  Image, Loader2, Tag as TagIcon, Building2, X,
} from "lucide-react";

const URL_BASE = import.meta.env.VITE_SUPABASE_URL as string;
const LIMITE_IMAGEM = 5 * 1024 * 1024;
const LIMITE_VIDEO = 16 * 1024 * 1024;
const TAMANHO_LOTE = 256;

interface Contato {
  id: string;
  celular_e164: string;
  cidade: string;
  bairro: string | null;
  origem: string | null;
}

interface TagItem { id: string; nome: string; }

function chunked<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export default function EnvioLista({ perfil }: { perfil: Perfil }) {
  const { t } = useTerminologia();
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Metadados de filtro (carregados uma vez, sem filtro)
  const [cidades, setCidades] = useState<string[]>([]);
  const [origens, setOrigens] = useState<string[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);

  // Filtros
  const [filtCidade, setFiltCidade] = useState("");
  const [filtBairro, setFiltBairro] = useState("");
  const [filtTags, setFiltTags] = useState<string[]>([]);
  const [filtOrigem, setFiltOrigem] = useState("");
  const [bairrosDisp, setBairrosDisp] = useState<string[]>([]);

  // Mensagem e mídia
  const [mensagem, setMensagem] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [erroUpload, setErroUpload] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // UI
  const [tutorialAberto, setTutorialAberto] = useState(false);
  const [copiados, setCopiados] = useState<Record<string, boolean>>({});
  const [registrando, setRegistrando] = useState(false);
  const [registrado, setRegistrado] = useState(false);

  // Carrega metadados de filtro uma vez
  useEffect(() => {
    supabase.from("tags").select("id, nome")
      .then(({ data }) => setTags((data as TagItem[]) ?? []));

    supabase.from("contacts")
      .select("cidade")
      .eq("status", "ativo")
      .eq("consent", "sim")
      .then(({ data }) => {
        const unicos = [...new Set((data ?? []).map((c) => (c.cidade as string)).filter(Boolean))].sort();
        setCidades(unicos);
      });

    supabase.from("contacts")
      .select("origem")
      .eq("status", "ativo")
      .eq("consent", "sim")
      .not("origem", "is", null)
      .then(({ data }) => {
        const unicos = [...new Set((data ?? []).map((c) => (c.origem as string)).filter(Boolean))].sort();
        setOrigens(unicos);
      });
  }, []);

  // Carrega contatos conforme filtros
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
          if (ativo) { setContatos([]); setCarregando(false); }
          return;
        }
      }

      let q = supabase.from("contacts")
        .select("id, celular_e164, cidade, bairro, origem")
        .eq("status", "ativo")
        .eq("consent", "sim");

      if (filtCidade) q = q.eq("cidade", filtCidade);
      if (filtOrigem) q = q.eq("origem", filtOrigem);
      if (tagContactIds !== null) q = q.in("id", tagContactIds);

      const { data } = await q.order("nome").limit(2000);
      if (ativo) { setContatos((data as Contato[]) ?? []); setCarregando(false); }
    };
    carregar();
    return () => { ativo = false; };
  }, [filtCidade, filtOrigem, filtTags]);

  // Bairros quando cidade muda
  useEffect(() => {
    setFiltBairro("");
    if (!filtCidade) { setBairrosDisp([]); return; }
    supabase.from("contacts")
      .select("bairro")
      .eq("cidade", filtCidade)
      .eq("consent", "sim")
      .eq("status", "ativo")
      .not("bairro", "is", null)
      .then(({ data }) => {
        const unicos = [...new Set((data ?? []).map((c) => c.bairro as string).filter(Boolean))].sort();
        setBairrosDisp(unicos);
      });
  }, [filtCidade]);

  // Reset "registrado" quando filtros mudam
  useEffect(() => {
    setRegistrado(false);
  }, [filtCidade, filtBairro, filtTags, filtOrigem]);

  const contatosFiltrados = filtBairro
    ? contatos.filter((c) => c.bairro === filtBairro)
    : contatos;

  const lotes = chunked(contatosFiltrados, TAMANHO_LOTE);

  const copiar = async (texto: string, key: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiados((p) => ({ ...p, [key]: true }));
    setTimeout(() => setCopiados((p) => ({ ...p, [key]: false })), 2500);
  };

  const uploadMidia = async (file: File) => {
    setErroUpload("");
    const isImg = file.type.startsWith("image/");
    const isVid = file.type.startsWith("video/");
    if (!isImg && !isVid) return setErroUpload("Envie apenas imagem (JPG/PNG) ou vídeo (MP4).");
    if (isImg && file.size > LIMITE_IMAGEM) return setErroUpload("Imagem acima de 5 MB.");
    if (isVid && file.size > LIMITE_VIDEO) return setErroUpload("Vídeo acima de 16 MB.");
    setUploading(true);
    if (mediaUrl) {
      const oldPath = mediaUrl.split("/campaign-media/")[1];
      if (oldPath) await supabase.storage.from("campaign-media").remove([oldPath]);
    }
    const ext = (file.name.split(".").pop() ?? (isImg ? "jpg" : "mp4"));
    const path = `${perfil.workspace_id}/lista-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("campaign-media").upload(path, file);
    setUploading(false);
    if (error) return setErroUpload("Falha no upload: " + error.message);
    setMediaUrl(`${URL_BASE}/storage/v1/object/public/campaign-media/${path}`);
    setMediaType(isImg ? "image" : "video");
  };

  const removerMidia = async () => {
    if (!mediaUrl) return;
    const path = mediaUrl.split("/campaign-media/")[1];
    if (path) await supabase.storage.from("campaign-media").remove([path]);
    setMediaUrl(null); setMediaType(null);
  };

  const registrarEnvio = async () => {
    if (contatosFiltrados.length === 0 || !mensagem.trim()) return;
    setRegistrando(true);
    const loteId = crypto.randomUUID();
    const rows = contatosFiltrados.map((c) => ({
      workspace_id: perfil.workspace_id,
      contact_id: c.id,
      template_id: null,
      modo: "lista_transmissao",
      enviado_por: perfil.id,
      mensagem_texto: mensagem.trim(),
      lote_id: loteId,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      await supabase.from("send_logs").insert(rows.slice(i, i + 200));
    }
    setRegistrando(false);
    setRegistrado(true);
  };

  const alternarTag = (id: string) =>
    setFiltTags((p) => p.includes(id) ? p.filter((t) => t !== id) : [...p, id]);

  const chip = (ativo: boolean) =>
    `shrink-0 rounded-full px-3 py-1 text-xs font-medium ${ativo ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`;

  return (
    <div className="space-y-3">
      {/* Banner amarelo permanente */}
      <div className="rounded-xl p-3 bg-amber-50 border border-amber-200 flex items-start gap-2">
        <AlertTriangle size={15} className="shrink-0 mt-0.5 text-alerta" />
        <p className="text-xs text-alerta leading-relaxed">
          <b>Atenção:</b> Para receber sua mensagem em lista de transmissão, o destinatário precisa ter o seu número salvo nos contatos do celular.
        </p>
      </div>

      {/* Tutorial */}
      <div className="rounded-xl border border-linha bg-white overflow-hidden">
        <button
          onClick={() => setTutorialAberto((p) => !p)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-tinta">
          Como usar lista de transmissão?
          {tutorialAberto
            ? <ChevronUp size={14} className="text-apoio" />
            : <ChevronDown size={14} className="text-apoio" />}
        </button>
        {tutorialAberto && (
          <div className="px-4 pb-4 pt-3 space-y-2.5 border-t border-linha">
            {[
              "Filtre os contatos desejados. Apenas quem tem consentimento LGPD ('ok') aparece aqui.",
              "Escreva a mensagem abaixo. Sem variáveis {nome}/{regiao} — o WhatsApp não substitui em listas de transmissão.",
              "Opcionalmente, anexe uma imagem ou vídeo.",
              "Clique em \"Copiar telefones da lista 1\", \"lista 2\"… e cole no WhatsApp → Nova Lista de Transmissão.",
              "Clique em \"Copiar mensagem\" e cole na lista criada no WhatsApp.",
              "Após enviar pelo WhatsApp, clique em \"Registrar envio\" para guardar o histórico no sistema.",
            ].map((passo, i) => (
              <div key={i} className="flex gap-2.5 text-xs text-apoio leading-relaxed">
                <span className="shrink-0 w-5 h-5 rounded-full bg-marca text-white flex items-center justify-center font-bold text-[10px]">
                  {i + 1}
                </span>
                <span>{passo}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <button onClick={() => setFiltCidade("")} className={chip(!filtCidade)}>Todas</button>
          {cidades.map((cd) => (
            <button key={cd} onClick={() => setFiltCidade(cd === filtCidade ? "" : cd)}
              className={`${chip(filtCidade === cd)} inline-flex items-center gap-1`}>
              <Building2 size={10} /> {cd}
            </button>
          ))}
        </div>

        {filtCidade && bairrosDisp.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button onClick={() => setFiltBairro("")} className={chip(!filtBairro)}>Todos bairros</button>
            {bairrosDisp.map((b) => (
              <button key={b} onClick={() => setFiltBairro(b === filtBairro ? "" : b)} className={chip(filtBairro === b)}>
                {b}
              </button>
            ))}
          </div>
        )}

        {origens.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {origens.map((o) => (
              <button key={o} onClick={() => setFiltOrigem(filtOrigem === o ? "" : o)} className={chip(filtOrigem === o)}>
                {o}
              </button>
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tg) => (
              <button key={tg.id} onClick={() => alternarTag(tg.id)}
                className={`${chip(filtTags.includes(tg.id))} inline-flex items-center gap-1`}>
                <TagIcon size={9} /> {tg.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-apoio">
        {carregando
          ? "Carregando..."
          : `${contatosFiltrados.length} ${contatosFiltrados.length === 1 ? t('contato') : t('contatos')} com LGPD ok · ${lotes.length} lista(s) de até ${TAMANHO_LOTE}`}
      </p>

      {/* Campo mensagem */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-tinta block">Mensagem da lista</label>
        <textarea
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white min-h-[90px]"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          placeholder="Escreva aqui a mensagem. Sem {nome} ou {regiao} — listas de transmissão não suportam variáveis." />
        <p className="text-[10px] text-apoio text-right">{mensagem.length} caracteres</p>
      </div>

      {/* Mídia opcional */}
      <div>
        <label className="text-xs font-semibold text-tinta block mb-1.5">Mídia (opcional)</label>
        {mediaUrl ? (
          <div className="flex items-center gap-3">
            <div className="w-16 h-12 rounded-xl overflow-hidden border border-linha bg-fundo flex items-center justify-center">
              {mediaType === "image"
                ? <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
                : <span className="text-[10px] text-apoio text-center leading-tight">🎬<br />Vídeo</span>}
            </div>
            <button onClick={removerMidia} className="text-xs text-erro flex items-center gap-1">
              <X size={12} /> Remover
            </button>
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
        {erroUpload && (
          <p className="text-xs text-erro mt-1 flex items-center gap-1">
            <AlertTriangle size={11} /> {erroUpload}
          </p>
        )}
      </div>

      {/* Botão copiar mensagem */}
      {mensagem.trim() && (
        <button onClick={() => copiar(mensagem.trim(), "msg")}
          className="w-full rounded-xl py-2.5 text-xs font-semibold border border-linha bg-white flex items-center justify-center gap-2 text-tinta active:bg-fundo">
          {copiados["msg"] ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
          {copiados["msg"] ? "Mensagem copiada!" : "Copiar mensagem"}
        </button>
      )}

      {/* Lotes de telefones */}
      {!carregando && lotes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-tinta">
            Listas de telefones <span className="text-apoio font-normal">(máx. {TAMANHO_LOTE} por lista)</span>
          </p>
          {lotes.map((lote, idx) => {
            const key = `lote-${idx}`;
            const telefones = lote.map((c) => c.celular_e164 ?? "").filter(Boolean).join("\n");
            return (
              <div key={idx} className="bg-white border border-linha rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-tinta">
                    Lista {idx + 1}
                    <span className="text-apoio font-normal ml-1">({lote.length} {lote.length === 1 ? t('contato') : t('contatos')})</span>
                  </span>
                  <button onClick={() => copiar(telefones, key)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold bg-marca text-white active:opacity-80">
                    {copiados[key] ? <Check size={12} /> : <Copy size={12} />}
                    {copiados[key] ? "Copiado!" : "Copiar telefones"}
                  </button>
                </div>
                <p className="text-[10px] text-apoio leading-relaxed">
                  {lote.slice(0, 3).map((c) => c.celular_e164 ?? "").join(", ")}
                  {lote.length > 3 ? ` … e mais ${lote.length - 3}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Registrar envio */}
      {!carregando && contatosFiltrados.length > 0 && (
        registrado ? (
          <div className="rounded-xl p-3 bg-green-50 border border-green-200 text-xs text-ok flex items-center gap-2">
            <Check size={14} /> Envio registrado com sucesso no histórico!
          </div>
        ) : (
          <button onClick={registrarEnvio} disabled={registrando || !mensagem.trim()}
            className="w-full rounded-xl py-3 text-sm font-bold text-white bg-marca disabled:opacity-50 flex items-center justify-center gap-2">
            {registrando && <Loader2 size={14} className="animate-spin" />}
            {registrando
              ? "Registrando..."
              : `Registrar envio de ${contatosFiltrados.length} ${contatosFiltrados.length === 1 ? t('contato') : t('contatos')}`}
          </button>
        )
      )}

      {!carregando && contatosFiltrados.length === 0 && (
        <div className="bg-white border border-linha rounded-xl p-5 text-center">
          <p className="text-sm text-apoio">Nenhum {t('contato').toLowerCase()} com consentimento LGPD neste filtro.</p>
        </div>
      )}
    </div>
  );
}
