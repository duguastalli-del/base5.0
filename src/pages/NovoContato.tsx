import { useEffect, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { useTerminologia } from "../contexts/TerminologiaContext";
import { TAGS_POR_VERTICAL, ORIGENS_POR_VERTICAL } from "../lib/tags-por-vertical";
import { db, sincronizar, pendentes, salvarContactTags } from "../lib/db";
import { mascaraCelular, paraE164, soDigitos } from "../lib/format";
import { AlertTriangle, CheckCircle2, CloudOff, Plus } from "lucide-react";

export default function NovoContato({ perfil, cidades, aoAdicionarCidade }:
  { perfil: Perfil; cidades: string[]; aoAdicionarCidade: (n: string) => void }) {
  const { t, vertical } = useTerminologia();
  const TAGS = TAGS_POR_VERTICAL[vertical];
  const ORIGENS = ORIGENS_POR_VERTICAL[vertical];
  const vazio = { nome: "", celular: "", cidade: "", bairro: "", tags: [] as string[], origem: "", obs: "", consentimento: false };
  const [f, setF] = useState(vazio);
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState<"" | "online" | "offline">("");
  const [qtdPendentes, setQtdPendentes] = useState(0);
  const [novaCidade, setNovaCidade] = useState("");
  const [mostrarNovaCidade, setMostrarNovaCidade] = useState(false);
  const [sugestoes, setSugestoes] = useState<string[]>([]);

  useEffect(() => { pendentes().then(setQtdPendentes); }, [salvo]);

  // Autocomplete de bairro: aprende com a própria base do workspace
  useEffect(() => {
    if (!f.cidade) { setSugestoes([]); return; }
    supabase.from("contacts").select("bairro").eq("cidade", f.cidade).not("bairro", "is", null)
      .then(({ data }) => {
        const unicos = [...new Set((data ?? []).map((d) => d.bairro as string).filter(Boolean))];
        setSugestoes(unicos.sort());
      });
  }, [f.cidade]);

  const alternarTag = (t: string) =>
    setF((p) => ({ ...p, tags: p.tags.includes(t) ? p.tags.filter((x) => x !== t) : [...p.tags, t] }));

  const salvar = async () => {
    setErro("");
    if (!f.nome.trim()) return setErro("Informe o nome.");
    if (soDigitos(f.celular).length !== 11) return setErro("Celular incompleto (DDD + 9 dígitos).");
    if (!f.cidade) return setErro("Selecione a cidade.");
    if (!f.consentimento) return setErro("O consentimento LGPD é obrigatório para salvar.");

    const registro = {
      nome: f.nome.trim(),
      celular_e164: paraE164(f.celular),
      cidade: f.cidade,
      bairro: f.bairro.trim() || null,
      origem: f.origem || null,
      obs: f.obs.trim() || null,
      consent: "sim" as const,
    };

    if (navigator.onLine) {
      const { data: contactData, error } = await supabase.from("contacts").insert({
        ...registro, workspace_id: perfil.workspace_id, criado_por: perfil.id,
      }).select("id").single();
      if (error) {
        if (error.code === "23505") return setErro("Este número já está cadastrado na base.");
        return setErro("Falha ao salvar: " + error.message);
      }
      if (contactData?.id && f.tags.length > 0) {
        await salvarContactTags(contactData.id as string, f.tags, perfil.workspace_id);
      }
      setSalvo("online");
    } else {
      await db.fila.add({ ...registro, tags: f.tags, criado_em: new Date().toISOString() });
      setSalvo("offline");
    }
    setF(vazio);
    setTimeout(() => setSalvo(""), 2500);
  };

  const sincronizarAgora = async () => {
    const n = await sincronizar(perfil.id, perfil.workspace_id);
    setQtdPendentes(await pendentes());
    if (n > 0) setSalvo("online");
  };

  const chip = (ativo: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium ${ativo ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`;

  return (
    <div className="space-y-4 pb-4">
      <p className="text-xs text-apoio">Modo rua · funciona até sem internet (sincroniza sozinho depois).</p>

      {qtdPendentes > 0 && (
        <button onClick={sincronizarAgora}
          className="w-full rounded-xl p-3 flex items-center justify-between bg-amber-50 border border-amber-200">
          <span className="text-xs font-medium flex items-center gap-2 text-alerta">
            <CloudOff size={14} /> {qtdPendentes} registro(s) aguardando sincronizar
          </span>
          <span className="text-xs font-bold text-marca">Sincronizar agora</span>
        </button>
      )}

      {salvo && (
        <div className="rounded-xl p-3 bg-green-50 border border-green-200 flex items-center gap-2 text-sm font-medium text-ok">
          <CheckCircle2 size={16} />
          {salvo === "online" ? `${t('contato')} salvo na base!` : "Salvo no aparelho — sincroniza quando a internet voltar."}
        </div>
      )}

      <div>
        <label className="text-xs font-semibold mb-1.5 block text-tinta">Nome *</label>
        <input className="w-full rounded-xl px-3 py-3 text-sm outline-none bg-white border border-linha"
          value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Nome completo" />
      </div>

      <div>
        <label className="text-xs font-semibold mb-1.5 block text-tinta">Celular / WhatsApp *</label>
        <input className="w-full rounded-xl px-3 py-3 text-sm outline-none bg-white border border-linha"
          inputMode="numeric" value={f.celular}
          onChange={(e) => setF({ ...f, celular: mascaraCelular(e.target.value) })} placeholder="(19) 9XXXX-XXXX" />
      </div>

      <div>
        <label className="text-xs font-semibold mb-1.5 block text-tinta">Cidade *</label>
        <div className="flex flex-wrap gap-1.5">
          {cidades.map((cd) => (
            <button key={cd} onClick={() => setF({ ...f, cidade: cd, bairro: "" })} className={chip(f.cidade === cd)}>{cd}</button>
          ))}
          <button onClick={() => setMostrarNovaCidade(!mostrarNovaCidade)}
            className="rounded-full px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1 text-marca border border-dashed border-marca bg-white">
            <Plus size={11} /> Cidade
          </button>
        </div>
        {mostrarNovaCidade && (
          <div className="flex gap-2 mt-2">
            <input className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none bg-white border border-linha"
              value={novaCidade} placeholder="Nome da cidade" onChange={(e) => setNovaCidade(e.target.value)} />
            <button onClick={() => { if (novaCidade.trim()) { aoAdicionarCidade(novaCidade.trim()); setF({ ...f, cidade: novaCidade.trim() }); setNovaCidade(""); setMostrarNovaCidade(false); } }}
              className="rounded-xl px-4 text-xs font-bold text-white bg-marca">Adicionar</button>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold mb-1.5 block text-tinta">Bairro (opcional)</label>
        <input className="w-full rounded-xl px-3 py-3 text-sm outline-none bg-white border border-linha disabled:bg-gray-100"
          list="sugestoes-bairro" disabled={!f.cidade} value={f.bairro}
          onChange={(e) => setF({ ...f, bairro: e.target.value })}
          placeholder={f.cidade ? "Digite ou escolha" : "Escolha a cidade primeiro"} />
        <datalist id="sugestoes-bairro">
          {sugestoes.map((b) => <option key={b} value={b} />)}
        </datalist>
      </div>

      <div>
        <label className="text-xs font-semibold mb-1.5 block text-tinta">Tags</label>
        <div className="flex flex-wrap gap-1.5">
          {TAGS.map((t) => (
            <button key={t} onClick={() => alternarTag(t)} className={chip(f.tags.includes(t))}>{t}</button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold mb-1.5 block text-tinta">Origem do contato</label>
        <div className="flex flex-wrap gap-1.5">
          {ORIGENS.map((o) => (
            <button key={o} onClick={() => setF({ ...f, origem: o })} className={chip(f.origem === o)}>{o}</button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold mb-1.5 block text-tinta">Observações</label>
        <textarea className="w-full rounded-xl px-3 py-3 text-sm outline-none bg-white border border-linha min-h-[70px]"
          value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} placeholder="Demanda, contexto, indicação..." />
      </div>

      <label className={`flex items-start gap-2.5 rounded-xl p-3 cursor-pointer border ${f.consentimento ? "bg-green-50 border-green-200" : "bg-white border-linha"}`}>
        <input type="checkbox" checked={f.consentimento}
          onChange={(e) => setF({ ...f, consentimento: e.target.checked })} className="mt-0.5" />
        <span className="text-xs leading-relaxed text-apoio">
          <b className="text-tinta">Consentimento LGPD *</b> — A pessoa autorizou o recebimento de comunicações. Registrado com data, hora e responsável (trilha automática no banco).
        </span>
      </label>

      {erro && <p className="text-xs flex items-center gap-1.5 font-medium text-erro"><AlertTriangle size={13} /> {erro}</p>}

      <button onClick={salvar} className="w-full rounded-xl py-3.5 text-sm font-bold text-white bg-marca">
        Salvar {t('contato')}
      </button>
    </div>
  );
}
