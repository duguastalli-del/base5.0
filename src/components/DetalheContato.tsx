import { useState, useEffect } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { linkWa, mascaraCelular } from "../lib/format";
import {
  X, Pencil, Archive, ArchiveRestore, Trash2, UserX,
  CheckCircle2, AlertTriangle, Loader2, Tag, MessageCircle,
} from "lucide-react";

interface Contato {
  id: string; nome: string; celular_e164: string; cidade: string;
  bairro: string | null; origem: string | null; obs: string | null;
  consent: "sim" | "pendente" | "recusou"; status: string;
}

interface TagItem { id: string; nome: string; }

const ORIGENS = ["Porta a porta", "Evento", "Indicação", "Redes sociais"];

export default function DetalheContato({
  perfil, contato, cidades, onFechar, onAlterado,
}: {
  perfil: Perfil;
  contato: Contato;
  cidades: string[];
  onFechar: () => void;
  onAlterado: () => void;
}) {
  const [modo, setModo] = useState<"ver" | "editar">("ver");
  const [confirmacao, setConfirmacao] = useState<"excluir" | "anonimizar" | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  // Campos editáveis
  const [nome, setNome] = useState(contato.nome ?? "");
  const [cidade, setCidade] = useState(contato.cidade ?? "");
  const [bairro, setBairro] = useState(contato.bairro ?? "");
  const [origem, setOrigem] = useState(contato.origem ?? "");
  const [obs, setObs] = useState(contato.obs ?? "");

  // Tags
  const [tagsDisp, setTagsDisp] = useState<TagItem[]>([]);
  const [tagsSel, setTagsSel] = useState<string[]>([]);
  const [sugestoesBairro, setSugestoesBairro] = useState<string[]>([]);

  const isAdmin = perfil.papel === "administrador";
  const arquivado = contato.status === "arquivado";

  useEffect(() => {
    supabase.from("tags").select("id, nome").then(({ data }) =>
      setTagsDisp((data as TagItem[]) ?? [])
    );
    supabase.from("contact_tags").select("tag_id").eq("contact_id", contato.id).then(({ data }) =>
      setTagsSel((data ?? []).map((r) => r.tag_id as string))
    );
  }, [contato.id]);

  useEffect(() => {
    if (!cidade) { setSugestoesBairro([]); return; }
    supabase.from("contacts").select("bairro").eq("cidade", cidade).not("bairro", "is", null).then(({ data }) => {
      const unicos = [...new Set((data ?? []).map((d) => d.bairro as string).filter(Boolean))].sort();
      setSugestoesBairro(unicos);
    });
  }, [cidade]);

  const gravarAudit = async (acao: string) => {
    try {
      await supabase.from("audit_logs").insert({
        workspace_id: perfil.workspace_id,
        usuario_id: perfil.id,
        acao,
        entidade: "contacts",
        entidade_id: contato.id,
      });
    } catch { /* audit não bloqueia a ação */ }
  };

  const salvar = async () => {
    setErro("");
    if (!(nome ?? "").trim()) return setErro("Nome é obrigatório.");
    if (!cidade) return setErro("Cidade é obrigatória.");
    setCarregando(true);
    const { error } = await supabase.from("contacts").update({
      nome: nome.trim(),
      cidade,
      bairro: bairro.trim() || null,
      origem: origem || null,
      obs: obs.trim() || null,
    }).eq("id", contato.id);
    if (error) { setCarregando(false); return setErro("Falha ao salvar: " + error.message); }

    // Atualiza tags: remove todas e re-insere as selecionadas
    await supabase.from("contact_tags").delete().eq("contact_id", contato.id);
    if (tagsSel.length > 0) {
      await supabase.from("contact_tags").insert(
        tagsSel.map((tag_id) => ({ contact_id: contato.id, tag_id }))
      );
    }
    await gravarAudit("editar_contato");
    setCarregando(false);
    setSucesso("Contato atualizado!");
    setTimeout(() => { setSucesso(""); setModo("ver"); onAlterado(); }, 1200);
  };

  const alternarStatus = async () => {
    setCarregando(true);
    const novoStatus = arquivado ? "ativo" : "arquivado";
    const { error } = await supabase.from("contacts").update({ status: novoStatus }).eq("id", contato.id);
    setCarregando(false);
    if (error) return setErro("Falha: " + error.message);
    await gravarAudit(arquivado ? "reativar_contato" : "arquivar_contato");
    onAlterado(); onFechar();
  };

  const excluir = async () => {
    setCarregando(true);
    const { error } = await supabase.from("contacts").delete().eq("id", contato.id);
    setCarregando(false);
    if (error) return setErro("Falha ao excluir: " + error.message);
    await gravarAudit("excluir_contato");
    onAlterado(); onFechar();
  };

  const anonimizar = async () => {
    setCarregando(true);
    const { error } = await supabase.rpc("anonimizar_contato", { p_contact_id: contato.id });
    setCarregando(false);
    if (error) return setErro("Falha ao anonimizar: " + error.message);
    await gravarAudit("anonimizar_contato");
    onAlterado(); onFechar();
  };

  const chip = (ativo: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium ${ativo ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`;

  const alternarTag = (id: string) =>
    setTagsSel((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onFechar}>
      <div className="w-full sm:max-w-md bg-fundo rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-linha">
          <span className="text-sm font-bold text-tinta">
            {modo === "editar" ? "Editar contato" : "Detalhes do contato"}
          </span>
          <button onClick={onFechar} className="text-apoio p-1"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {modo === "ver" ? (
            <div className="space-y-3">
              <div>
                <p className="text-base font-bold text-tinta">{contato.nome}</p>
                <p className="text-sm text-apoio">{mascaraCelular((contato.celular_e164 ?? "").replace("+55", ""))}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Cidade", val: contato.cidade },
                  { label: "Bairro", val: contato.bairro },
                  { label: "Origem", val: contato.origem },
                  { label: "Status", val: arquivado ? "Arquivado" : "Ativo", cor: arquivado ? "text-alerta" : "text-ok" },
                ].map(({ label, val, cor }) => (
                  <div key={label} className="bg-white rounded-xl p-3 border border-linha text-xs">
                    <p className="text-apoio mb-0.5">{label}</p>
                    <p className={`font-semibold ${cor ?? "text-tinta"}`}>{val || "—"}</p>
                  </div>
                ))}
              </div>

              {contato.obs && (
                <div className="bg-white rounded-xl p-3 border border-linha text-xs">
                  <span className="text-apoio">Obs: </span>
                  <span className="text-tinta">{contato.obs}</span>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {contato.consent === "sim" && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-50 text-ok">
                    <CheckCircle2 size={10} /> LGPD ok
                  </span>
                )}
                {contato.consent === "pendente" && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-alerta">
                    <AlertTriangle size={10} /> Opt-in pendente
                  </span>
                )}
                {contato.consent === "recusou" && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-erro">
                    <X size={10} /> Recusou
                  </span>
                )}
                {tagsSel.map((tid) => {
                  const tg = tagsDisp.find((t) => t.id === tid);
                  return tg ? (
                    <span key={tid} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-50 text-marca">
                      <Tag size={10} /> {tg.nome}
                    </span>
                  ) : null;
                })}
              </div>

              <a href={linkWa(contato.celular_e164, `Olá ${(contato.nome ?? "").split(" ")[0]}, tudo bem?`)}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                style={{ background: "#1FAF5E" }}>
                <MessageCircle size={13} /> Abrir WhatsApp
              </a>
            </div>
          ) : (
            // MODO EDITAR
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold mb-1 block text-tinta">Nome *</label>
                <input className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
                  value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block text-tinta">Celular (não editável)</label>
                <p className="text-sm text-apoio px-3 py-2.5 bg-fundo rounded-xl border border-linha">
                  {mascaraCelular((contato.celular_e164 ?? "").replace("+55", ""))}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block text-tinta">Cidade *</label>
                <div className="flex flex-wrap gap-1.5">
                  {cidades.map((cd) => (
                    <button key={cd} onClick={() => { setCidade(cd); setBairro(""); }} className={chip(cidade === cd)}>{cd}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block text-tinta">Bairro</label>
                <input className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
                  list="bairros-det-edit" value={bairro}
                  onChange={(e) => setBairro(e.target.value)} placeholder="Bairro (opcional)" />
                <datalist id="bairros-det-edit">
                  {sugestoesBairro.map((b) => <option key={b} value={b} />)}
                </datalist>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block text-tinta">Origem</label>
                <div className="flex flex-wrap gap-1.5">
                  {ORIGENS.map((o) => (
                    <button key={o} onClick={() => setOrigem(origem === o ? "" : o)} className={chip(origem === o)}>{o}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block text-tinta">Observações</label>
                <textarea className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white min-h-[70px]"
                  value={obs} onChange={(e) => setObs(e.target.value)} />
              </div>

              {tagsDisp.length > 0 && (
                <div>
                  <label className="text-xs font-semibold mb-1 block text-tinta">Tags</label>
                  <div className="flex flex-wrap gap-1.5">
                    {tagsDisp.map((t) => (
                      <button key={t.id} onClick={() => alternarTag(t.id)} className={chip(tagsSel.includes(t.id))}>{t.nome}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {erro && <p className="text-xs flex items-center gap-1.5 font-medium text-erro"><AlertTriangle size={12} /> {erro}</p>}
          {sucesso && <p className="text-xs flex items-center gap-1.5 font-medium text-ok"><CheckCircle2 size={12} /> {sucesso}</p>}

          {confirmacao === "excluir" && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-erro">Excluir permanentemente?</p>
              <p className="text-xs text-apoio">Não pode ser desfeita. Para LGPD com rastreabilidade, prefira anonimizar.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmacao(null)}
                  className="flex-1 rounded-xl py-2 text-xs font-semibold border border-linha text-apoio bg-white">
                  Cancelar
                </button>
                <button onClick={excluir} disabled={carregando}
                  className="flex-1 rounded-xl py-2 text-xs font-bold text-white bg-erro disabled:opacity-60 flex items-center justify-center gap-1">
                  {carregando ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  {carregando ? "..." : "Excluir"}
                </button>
              </div>
            </div>
          )}

          {confirmacao === "anonimizar" && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-alerta">Anonimizar (LGPD art. 18)?</p>
              <p className="text-xs text-apoio">Dados pessoais apagados, histórico de envios mantido. Não pode ser desfeita.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmacao(null)}
                  className="flex-1 rounded-xl py-2 text-xs font-semibold border border-linha text-apoio bg-white">
                  Cancelar
                </button>
                <button onClick={anonimizar} disabled={carregando}
                  className="flex-1 rounded-xl py-2 text-xs font-bold text-white bg-alerta disabled:opacity-60 flex items-center justify-center gap-1">
                  {carregando ? <Loader2 size={12} className="animate-spin" /> : <UserX size={12} />}
                  {carregando ? "..." : "Anonimizar"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {confirmacao === null && (
          <div className="px-4 py-3 bg-white border-t border-linha space-y-2">
            {modo === "editar" ? (
              <div className="flex gap-2">
                <button onClick={() => { setModo("ver"); setErro(""); }}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold border border-linha text-apoio">
                  Cancelar
                </button>
                <button onClick={salvar} disabled={carregando}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white bg-marca disabled:opacity-60 flex items-center justify-center gap-1.5">
                  {carregando ? <Loader2 size={14} className="animate-spin" /> : null}
                  {carregando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <button onClick={() => setModo("editar")}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 border border-linha bg-white text-tinta">
                    <Pencil size={14} /> Editar
                  </button>
                  <button onClick={alternarStatus} disabled={carregando}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 border border-linha bg-white text-tinta disabled:opacity-60">
                    {arquivado
                      ? <><ArchiveRestore size={14} /> Reativar</>
                      : <><Archive size={14} /> Arquivar</>}
                  </button>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmacao("anonimizar")}
                      className="flex-1 rounded-xl py-2 text-xs font-semibold flex items-center justify-center gap-1 border border-amber-200 bg-amber-50 text-alerta">
                      <UserX size={12} /> Anonimizar (LGPD)
                    </button>
                    <button onClick={() => setConfirmacao("excluir")}
                      className="flex-1 rounded-xl py-2 text-xs font-semibold flex items-center justify-center gap-1 border border-red-200 bg-red-50 text-erro">
                      <Trash2 size={12} /> Excluir
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
