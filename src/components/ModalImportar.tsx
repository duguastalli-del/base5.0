import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase, type Perfil } from "../lib/supabase";
import { normalizarImportado, mascaraCelular } from "../lib/format";
import { Smartphone, Users, FileSpreadsheet, X, Loader2, CheckCircle2, AlertTriangle, Upload } from "lucide-react";

type Aba = "telefone" | "google" | "xlsx";

interface Importavel {
  nome: string;
  celularRaw: string;
  e164: string | null;
  cidade?: string;
  bairro?: string;
  duplicado: boolean;
  selecionado: boolean;
}

const ORIGEM: Record<Aba, string> = {
  telefone: "Importação (telefone)",
  google: "Importação (Google)",
  xlsx: "Importação (XLSX)",
};
const FONTE: Record<Aba, string> = { telefone: "telefone", google: "google", xlsx: "xlsx" };
const A_DEFINIR = "A definir";

// Flag para reabrir a aba Google após o redirect do OAuth
const FLAG_GOOGLE = "b50_import_google";

export default function ModalImportar({ perfil, cidades, onClose, onImportado }:
  { perfil: Perfil; cidades: string[]; onClose: () => void; onImportado: () => void }) {
  const [aba, setAba] = useState<Aba>("telefone");
  const [existentes, setExistentes] = useState<Set<string>>(new Set());
  const [lista, setLista] = useState<Importavel[]>([]);
  const [cidadeDestino, setCidadeDestino] = useState<string>(A_DEFINIR);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ importados: number; duplicados: number } | null>(null);
  const [erro, setErro] = useState("");

  // XLSX: linhas cruas + mapeamento de colunas
  const [xlsxLinhas, setXlsxLinhas] = useState<string[][]>([]);
  const [xlsxCabecalhos, setXlsxCabecalhos] = useState<string[]>([]);
  const [mapa, setMapa] = useState<{ nome: number; celular: number; cidade: number; bairro: number }>(
    { nome: -1, celular: -1, cidade: -1, bairro: -1 });

  // Carrega os celulares já existentes para detectar duplicados
  useEffect(() => {
    supabase.from("contacts").select("celular_e164").limit(5000).then(({ data }) => {
      setExistentes(new Set((data ?? []).map((c) => c.celular_e164 as string)));
    });
  }, []);

  // Se voltou do OAuth do Google, reabre a aba e busca os contatos
  useEffect(() => {
    if (localStorage.getItem(FLAG_GOOGLE) === "1") {
      setAba("google");
      buscarGoogle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trocarAba = (nova: Aba) => {
    setAba(nova);
    setLista([]); setResultado(null); setErro("");
    setXlsxLinhas([]); setXlsxCabecalhos([]); setMapa({ nome: -1, celular: -1, cidade: -1, bairro: -1 });
  };

  const montarLista = (brutos: { nome: string; celularRaw: string; cidade?: string; bairro?: string }[]) => {
    const itens: Importavel[] = brutos
      .filter((b) => b.nome?.trim() && b.celularRaw?.trim())
      .map((b) => {
        const e164 = normalizarImportado(b.celularRaw);
        const duplicado = e164 ? existentes.has(e164) : false;
        return {
          nome: b.nome.trim(), celularRaw: b.celularRaw, e164,
          cidade: b.cidade?.trim() || undefined, bairro: b.bairro?.trim() || undefined,
          duplicado, selecionado: !!e164 && !duplicado,
        };
      });
    setLista(itens);
  };

  // ---- 1) AGENDA DO TELEFONE (Contact Picker API) ----
  const suportaPicker = typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;
  const buscarTelefone = async () => {
    setErro(""); setResultado(null); setCarregandoLista(true);
    try {
      // @ts-expect-error API experimental sem tipos no TS padrão
      const picks = await navigator.contacts.select(["name", "tel"], { multiple: true });
      montarLista((picks ?? []).map((p: { name?: string[]; tel?: string[] }) => ({
        nome: p.name?.[0] ?? "Sem nome",
        celularRaw: p.tel?.[0] ?? "",
      })));
    } catch {
      setErro("Não foi possível ler a agenda. Tente novamente ou use outra aba.");
    }
    setCarregandoLista(false);
  };

  // ---- 2) GOOGLE CONTATOS (OAuth + People API) ----
  const conectarGoogle = async () => {
    localStorage.setItem(FLAG_GOOGLE, "1");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/contacts.readonly",
        redirectTo: window.location.origin + "/",
      },
    });
  };
  const buscarGoogle = async () => {
    setErro(""); setResultado(null); setCarregandoLista(true);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.provider_token;
    if (!token) {
      setCarregandoLista(false);
      return; // ainda não autorizou; o botão Conectar fica visível
    }
    try {
      const res = await fetch(
        "https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers&pageSize=1000&sortOrder=FIRST_NAME_ASCENDING",
        { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Falha na People API");
      const conns = (json.connections ?? []) as { names?: { displayName?: string }[]; phoneNumbers?: { value?: string }[] }[];
      montarLista(conns.map((c) => ({
        nome: c.names?.[0]?.displayName ?? "Sem nome",
        celularRaw: c.phoneNumbers?.[0]?.value ?? "",
      })));
      localStorage.removeItem(FLAG_GOOGLE);
    } catch (e) {
      setErro("Não foi possível ler os contatos do Google: " + (e as Error).message);
      localStorage.removeItem(FLAG_GOOGLE);
    }
    setCarregandoLista(false);
  };

  // ---- 3) PLANILHA (SheetJS) ----
  const lerArquivo = async (file: File) => {
    setErro(""); setResultado(null); setLista([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, raw: false });
      if (linhas.length < 2) return setErro("A planilha precisa de um cabeçalho e ao menos uma linha.");
      const cab = (linhas[0] as string[]).map((h) => String(h ?? "").trim());
      setXlsxCabecalhos(cab);
      setXlsxLinhas(linhas.slice(1) as string[][]);
      // tenta adivinhar colunas pelo nome do cabeçalho
      const acha = (alts: string[]) => cab.findIndex((h) => alts.some((a) => h.toLowerCase().includes(a)));
      setMapa({
        nome: acha(["nome", "name"]),
        celular: acha(["celular", "telefone", "phone", "whats", "fone"]),
        cidade: acha(["cidade", "city", "município", "municipio"]),
        bairro: acha(["bairro", "distrito"]),
      });
    } catch {
      setErro("Não foi possível ler o arquivo. Use .xlsx, .xls ou .csv.");
    }
  };
  const processarXlsx = () => {
    if (mapa.nome < 0 || mapa.celular < 0) return setErro("Indique pelo menos as colunas de Nome e Celular.");
    setErro("");
    montarLista(xlsxLinhas.map((l) => ({
      nome: String(l[mapa.nome] ?? ""),
      celularRaw: String(l[mapa.celular] ?? ""),
      cidade: mapa.cidade >= 0 ? String(l[mapa.cidade] ?? "") : undefined,
      bairro: mapa.bairro >= 0 ? String(l[mapa.bairro] ?? "") : undefined,
    })));
  };

  // ---- Seleção ----
  const selecionaveis = useMemo(() => lista.filter((i) => i.e164 && !i.duplicado), [lista]);
  const totalSelecionados = useMemo(() => lista.filter((i) => i.selecionado).length, [lista]);
  const todosMarcados = selecionaveis.length > 0 && selecionaveis.every((i) => i.selecionado);
  const alternarTodos = () =>
    setLista((p) => p.map((i) => (i.e164 && !i.duplicado ? { ...i, selecionado: !todosMarcados } : i)));
  const alternarUm = (idx: number) =>
    setLista((p) => p.map((i, k) => (k === idx ? { ...i, selecionado: !i.selecionado } : i)));

  // ---- Importação ----
  const importar = async () => {
    setImportando(true); setErro("");
    let ok = 0, dupInsert = 0;
    for (const it of lista) {
      if (!it.selecionado || !it.e164) continue;
      const cidade = cidadeDestino !== A_DEFINIR ? cidadeDestino : (it.cidade || A_DEFINIR);
      const { error } = await supabase.from("contacts").insert({
        workspace_id: perfil.workspace_id,
        nome: it.nome,
        celular_e164: it.e164,
        cidade,
        bairro: it.bairro || null,
        origem: ORIGEM[aba],
        consent: "pendente",
        criado_por: perfil.id,
      });
      if (!error) ok++;
      else if (error.code === "23505") dupInsert++;
    }
    const duplicados = lista.filter((i) => i.duplicado).length + dupInsert;
    // registra a importação (não-fatal: se o schema divergir, não quebra o fluxo)
    try {
      await supabase.from("imports").insert({
        workspace_id: perfil.workspace_id,
        fonte: FONTE[aba],
        qtd_importados: ok,
        qtd_duplicados: duplicados,
        executado_por: perfil.id,
      });
    } catch { /* ignora */ }
    setResultado({ importados: ok, duplicados });
    setImportando(false);
    if (ok > 0) onImportado();
  };

  const exibirCelular = (it: Importavel) =>
    it.e164 ? mascaraCelular(it.e164.replace("+55", "")) : it.celularRaw;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-fundo rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-linha">
          <span className="text-sm font-bold text-tinta">Importar contatos</span>
          <button onClick={onClose} aria-label="Fechar" className="text-apoio"><X size={18} /></button>
        </div>

        {/* Abas */}
        <div className="flex gap-1 px-3 pt-3">
          {([["telefone", "Agenda", Smartphone], ["google", "Google", Users], ["xlsx", "Planilha", FileSpreadsheet]] as const).map(
            ([id, rotulo, Ic]) => (
              <button key={id} onClick={() => trocarAba(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold ${aba === id ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
                <Ic size={14} /> {rotulo}
              </button>
            ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Conteúdo por aba (antes de listar) */}
          {lista.length === 0 && !resultado && (
            <>
              {aba === "telefone" && (
                suportaPicker ? (
                  <button onClick={buscarTelefone} disabled={carregandoLista}
                    className="w-full rounded-xl py-3.5 text-sm font-bold text-white bg-marca disabled:opacity-60 flex items-center justify-center gap-2">
                    {carregandoLista ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />}
                    Abrir agenda do telefone
                  </button>
                ) : (
                  <div className="rounded-xl p-4 bg-amber-50 border border-amber-200 text-xs leading-relaxed text-alerta flex gap-2">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <span>A importação direta da agenda no iPhone exige o app instalado pela loja. Por enquanto, exporte seus contatos para o Google e use a aba Google Contatos.</span>
                  </div>
                )
              )}

              {aba === "google" && (
                <button onClick={conectarGoogle} disabled={carregandoLista}
                  className="w-full rounded-xl py-3.5 text-sm font-bold text-white bg-marca disabled:opacity-60 flex items-center justify-center gap-2">
                  {carregandoLista ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
                  {carregandoLista ? "Buscando contatos..." : "Conectar Google"}
                </button>
              )}

              {aba === "xlsx" && (
                <div className="space-y-3">
                  <label className="w-full rounded-xl py-6 bg-white border border-dashed border-marca text-marca text-sm font-semibold flex flex-col items-center gap-1.5 cursor-pointer">
                    <Upload size={20} />
                    Escolher planilha (.xlsx, .xls, .csv)
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                      onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])} />
                  </label>

                  {xlsxCabecalhos.length > 0 && (
                    <div className="bg-white border border-linha rounded-xl p-3 space-y-3">
                      <p className="text-xs font-semibold text-tinta">Pré-visualização (5 primeiras linhas)</p>
                      <div className="overflow-x-auto">
                        <table className="text-[10px] text-apoio border-collapse">
                          <thead><tr>{xlsxCabecalhos.map((h, i) => <th key={i} className="border border-linha px-1.5 py-1 font-semibold text-tinta whitespace-nowrap">{h || `Col ${i + 1}`}</th>)}</tr></thead>
                          <tbody>
                            {xlsxLinhas.slice(0, 5).map((l, r) => (
                              <tr key={r}>{xlsxCabecalhos.map((_, c) => <td key={c} className="border border-linha px-1.5 py-1 whitespace-nowrap">{String(l[c] ?? "")}</td>)}</tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {([["nome", "Nome *"], ["celular", "Celular *"], ["cidade", "Cidade"], ["bairro", "Bairro"]] as const).map(([campo, rotulo]) => (
                          <label key={campo} className="text-xs text-apoio">
                            {rotulo}
                            <select value={mapa[campo]} onChange={(e) => setMapa({ ...mapa, [campo]: Number(e.target.value) })}
                              className="w-full mt-1 rounded-lg px-2 py-1.5 text-xs border border-linha bg-white text-tinta">
                              <option value={-1}>—</option>
                              {xlsxCabecalhos.map((h, i) => <option key={i} value={i}>{h || `Col ${i + 1}`}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                      <button onClick={processarXlsx} className="w-full rounded-xl py-2.5 text-xs font-bold text-white bg-marca">
                        Processar planilha
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {erro && <p className="text-xs flex items-center gap-1.5 font-medium text-erro"><AlertTriangle size={13} /> {erro}</p>}

          {/* Resultado final */}
          {resultado && (
            <div className="rounded-xl p-4 bg-green-50 border border-green-200 text-center">
              <CheckCircle2 className="mx-auto mb-1 text-ok" size={26} />
              <p className="text-sm font-semibold text-tinta">✓ {resultado.importados} importados, {resultado.duplicados} duplicados ignorados</p>
              <p className="text-[11px] mt-1 text-apoio">Entraram como "Opt-in pendente". Use a aba Envio (opt-in) para pedir a autorização.</p>
            </div>
          )}

          {/* Lista para seleção */}
          {lista.length > 0 && !resultado && (
            <>
              <div>
                <p className="text-xs font-semibold mb-1.5 text-tinta">Cidade de destino</p>
                <div className="flex flex-wrap gap-1.5">
                  {[A_DEFINIR, ...cidades].map((cd) => (
                    <button key={cd} onClick={() => setCidadeDestino(cd)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${cidadeDestino === cd ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
                      {cd}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={alternarTodos}
                className="w-full rounded-xl py-2.5 text-xs font-bold text-marca bg-white border border-marca">
                {todosMarcados ? "Desmarcar todos" : `Selecionar todos (${selecionaveis.length} disponíveis)`}
              </button>

              <div className="space-y-1.5">
                {lista.map((it, idx) => (
                  <label key={idx}
                    className={`flex items-center gap-2.5 rounded-xl p-2.5 bg-white border ${it.selecionado ? "border-marca" : "border-linha"} ${(!it.e164 || it.duplicado) ? "opacity-60" : "cursor-pointer"}`}>
                    <input type="checkbox" checked={it.selecionado} disabled={!it.e164 || it.duplicado}
                      onChange={() => alternarUm(idx)} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate text-tinta">{it.nome}</div>
                      <div className="text-xs text-apoio">{exibirCelular(it)}{it.cidade ? ` · ${it.cidade}` : ""}</div>
                    </div>
                    {it.duplicado && <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-alerta">Já na base</span>}
                    {!it.e164 && <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-50 text-erro">Número inválido</span>}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Rodapé com ação */}
        {lista.length > 0 && !resultado && (
          <div className="px-4 py-3 bg-white border-t border-linha">
            <button onClick={importar} disabled={totalSelecionados === 0 || importando}
              className="w-full rounded-xl py-3.5 text-sm font-bold text-white bg-marca disabled:opacity-50 flex items-center justify-center gap-2">
              {importando && <Loader2 size={16} className="animate-spin" />}
              {importando ? "Importando..." : `Importar ${totalSelecionados} contato(s)`}
            </button>
          </div>
        )}

        {resultado && (
          <div className="px-4 py-3 bg-white border-t border-linha">
            <button onClick={onClose} className="w-full rounded-xl py-3 text-sm font-bold text-white bg-marca">Concluir</button>
          </div>
        )}
      </div>
    </div>
  );
}
