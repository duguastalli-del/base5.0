import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase, type Perfil } from "../lib/supabase";
import { useTerminologia } from "../contexts/TerminologiaContext";
import { Download, FileSpreadsheet, Loader2, X } from "lucide-react";

interface ContatoExp {
  id: string;
  nome: string;
  celular_e164: string;
  cidade: string;
  bairro: string | null;
  origem: string | null;
  obs: string | null;
  consent: string;
  status: string;
  criado_em: string;
  criado_por: string | null;
}

interface TagItem { id: string; nome: string; }

const COLUNAS = [
  { key: "nome",        label: "Nome" },
  { key: "celular_e164",label: "Celular (E.164)" },
  { key: "cidade",      label: "Cidade" },
  { key: "bairro",      label: "Bairro" },
  { key: "origem",      label: "Origem" },
  { key: "obs",         label: "Observação" },
  { key: "consent",     label: "Consentimento (LGPD)" },
  { key: "status",      label: "Status" },
  { key: "criado_em",   label: "Data de cadastro" },
  { key: "criado_por",  label: "Cadastrado por" },
] as const;

type ColKey = typeof COLUNAS[number]["key"];

const CONSENT_LABEL: Record<string, string> = {
  sim: "Sim (LGPD ok)",
  pendente: "Pendente (opt-in)",
  recusou: "Recusou",
};

export default function ExportarContatos({
  perfil,
  filtrados,
  contatoTags,
  tagsDisponiveis,
  onClose,
}: {
  perfil: Perfil;
  filtrados: ContatoExp[];
  contatoTags: Record<string, string[]>;
  tagsDisponiveis: TagItem[];
  onClose: () => void;
}) {
  const { t } = useTerminologia();
  const isAdmin = perfil.papel === "administrador";
  const podeVerTodos = isAdmin || perfil.papel === "coordenador";

  const [formato, setFormato] = useState<"xlsx" | "csv">("xlsx");
  const [colunas, setColunas] = useState<Set<ColKey>>(new Set(COLUNAS.map((c) => c.key)));
  const [includeTags, setIncludeTags] = useState(true);
  const [scope, setScope] = useState<"filtrados" | "todos">("filtrados");
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState("");

  const toggleColuna = (key: ColKey) =>
    setColunas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const gerarArquivo = async () => {
    setExportando(true);
    setErro("");
    try {
      let contatos: ContatoExp[];
      let tagsMap: Record<string, string[]> = { ...contatoTags };
      const tagsNomeMap: Record<string, string> = Object.fromEntries(
        tagsDisponiveis.map((t) => [t.id, t.nome])
      );

      if (scope === "todos") {
        const { data, error } = await supabase
          .from("contacts")
          .select("id, nome, celular_e164, cidade, bairro, origem, obs, consent, status, criado_em, criado_por")
          .eq("workspace_id", perfil.workspace_id)
          .in("status", ["ativo", "arquivado"])
          .order("criado_em", { ascending: false })
          .limit(50_001);
        if (error) throw new Error(error.message);
        const lista = (data ?? []) as ContatoExp[];
        if (lista.length > 50_000) {
          setErro(`A base tem mais de 50.000 ${t('contatos').toLowerCase()}. Use os filtros na tela de ${t('contatos').toLowerCase()} antes de exportar.`);
          return;
        }
        contatos = lista;

        if (includeTags && contatos.length > 0) {
          const ids = contatos.map((c) => c.id);
          const { data: ctData } = await supabase
            .from("contact_tags").select("contact_id, tag_id").in("contact_id", ids);
          tagsMap = {};
          for (const row of (ctData ?? [])) {
            if (!tagsMap[row.contact_id]) tagsMap[row.contact_id] = [];
            tagsMap[row.contact_id].push(row.tag_id);
          }
          const tagIds = [...new Set(Object.values(tagsMap).flat())];
          if (tagIds.length > 0) {
            const { data: tagsData } = await supabase
              .from("tags").select("id, nome").in("id", tagIds);
            for (const t of (tagsData ?? [])) tagsNomeMap[t.id as string] = t.nome as string;
          }
        }
      } else {
        contatos = filtrados;
      }

      if (contatos.length === 0) {
        setErro(`Nenhum ${t('contato').toLowerCase()} para exportar.`);
        return;
      }

      // Resolve criado_por → nome do perfil
      const profileNames: Record<string, string> = {};
      if (colunas.has("criado_por")) {
        const uids = [...new Set(
          contatos.map((c) => c.criado_por).filter(Boolean) as string[]
        )];
        if (uids.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles").select("id, nome").in("id", uids);
          for (const p of (profiles ?? [])) profileNames[p.id as string] = p.nome as string;
        }
      }

      // Montar linhas
      const rows = contatos.map((c) => {
        const row: Record<string, string> = {};
        for (const col of COLUNAS) {
          if (!colunas.has(col.key)) continue;
          if (col.key === "consent") {
            row[col.label] = CONSENT_LABEL[c.consent] ?? c.consent;
          } else if (col.key === "criado_em") {
            row[col.label] = c.criado_em
              ? new Date(c.criado_em).toLocaleString("pt-BR")
              : "";
          } else if (col.key === "criado_por") {
            row[col.label] = profileNames[c.criado_por ?? ""] ?? c.criado_por ?? "";
          } else {
            row[col.label] = ((c[col.key as keyof ContatoExp] ?? "") as string);
          }
        }
        if (includeTags) {
          row["Tags"] = (tagsMap[c.id] ?? [])
            .map((tid) => tagsNomeMap[tid] ?? tid)
            .join(", ");
        }
        return row;
      });

      const data = new Date().toISOString().slice(0, 10);
      const ws = XLSX.utils.json_to_sheet(rows);

      if (formato === "xlsx") {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t('contatos'));
        XLSX.writeFile(wb, `contatos_${data}.xlsx`);
      } else {
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `contatos_${data}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }

      // Audit log (não bloqueia)
      supabase.from("audit_logs").insert({
        workspace_id: perfil.workspace_id,
        usuario_id: perfil.id,
        acao: "exportar_contatos",
        entidade: "contacts",
        detalhes: JSON.stringify({
          formato,
          total: rows.length,
          colunas: [...colunas],
          include_tags: includeTags,
          scope,
        }),
      }).then(undefined, () => {});

      onClose();
    } catch (e) {
      setErro("Erro ao exportar: " + (e as Error).message);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-marca" />
            <h2 className="font-bold text-texto text-sm">Exportar {t('contatos').toLowerCase()}</h2>
          </div>
          <button onClick={onClose}><X size={18} className="text-apoio" /></button>
        </div>

        {/* Formato */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-apoio uppercase tracking-wide">Formato</p>
          <div className="flex gap-2">
            {(["xlsx", "csv"] as const).map((f) => (
              <button key={f} onClick={() => setFormato(f)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold border transition-colors ${
                  formato === f ? "bg-marca text-white border-marca" : "bg-white text-apoio border-linha"
                }`}>
                .{f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Escopo */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-apoio uppercase tracking-wide">{t('contatos')} a exportar</p>
          <div className="flex gap-2">
            <button onClick={() => setScope("filtrados")}
              className={`flex-1 rounded-xl py-2.5 text-xs font-semibold border transition-colors ${
                scope === "filtrados" ? "bg-marca text-white border-marca" : "bg-white text-apoio border-linha"
              }`}>
              Filtro atual ({filtrados.length})
            </button>
            {podeVerTodos && (
              <button onClick={() => setScope("todos")}
                className={`flex-1 rounded-xl py-2.5 text-xs font-semibold border transition-colors ${
                  scope === "todos" ? "bg-marca text-white border-marca" : "bg-white text-apoio border-linha"
                }`}>
                Todos do workspace
              </button>
            )}
          </div>
        </div>

        {/* Colunas */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-apoio uppercase tracking-wide">Colunas</p>
          <div className="grid grid-cols-2 gap-y-2 gap-x-3">
            {COLUNAS.map((col) => (
              <label key={col.key} className="flex items-center gap-2 text-xs text-texto cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={colunas.has(col.key)}
                  onChange={() => toggleColuna(col.key)}
                  className="accent-marca rounded shrink-0"
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>

        {/* Tags toggle */}
        <label className="flex items-center justify-between bg-zinc-50 rounded-xl px-3 py-2.5 cursor-pointer">
          <span className="text-sm text-texto">Incluir coluna Tags</span>
          <input
            type="checkbox"
            checked={includeTags}
            onChange={(e) => setIncludeTags(e.target.checked)}
            className="accent-marca w-4 h-4"
          />
        </label>

        {erro && (
          <p className="text-xs text-red-600 bg-red-50 rounded-xl p-3">{erro}</p>
        )}

        <button
          onClick={gerarArquivo}
          disabled={exportando || colunas.size === 0}
          className="w-full flex items-center justify-center gap-2 bg-marca text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50">
          {exportando
            ? <><Loader2 size={16} className="animate-spin" /> Gerando arquivo…</>
            : <><Download size={16} /> Exportar {formato.toUpperCase()} ({scope === "filtrados" ? filtrados.length : "todos"})</>
          }
        </button>
      </div>
    </div>
  );
}
