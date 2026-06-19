import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import {
  Users, MapPin, UserPlus, Copy, CheckCircle2,
  TrendingUp, TrendingDown, Minus, BarChart2, Download,
  X, Loader2, Filter,
} from "lucide-react";
import EvolucaoContatos from "../components/charts/EvolucaoContatos";
import FunilCampanha from "../components/charts/FunilCampanha";
import DistribuicaoOrigem from "../components/charts/DistribuicaoOrigem";
import TopBairros from "../components/charts/TopBairros";

type Periodo = "7d" | "30d" | "90d" | "12m";

interface Resumo {
  total_contatos: number;
  novos_hoje: number;
  pct_consentimento: number;
  optin_pendentes: number;
}

interface Rank { cadastrador: string; qtd: number; }

function subDias(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function subMeses(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

function periodoInicio(p: Periodo, dataInicio?: string, dataFim?: string): Date {
  if (p === "custom" as Periodo && dataInicio) return new Date(dataInicio);
  if (p === "7d") return subDias(7);
  if (p === "30d") return subDias(30);
  if (p === "90d") return subDias(90);
  return subMeses(12);
}

function periodoFim(p: Periodo, dataFim?: string): Date {
  if (p === "custom" as Periodo && dataFim) return new Date(dataFim + "T23:59:59");
  return new Date();
}

function periodoLabel(p: Periodo): string {
  if (p === "7d") return "7 dias";
  if (p === "30d") return "30 dias";
  if (p === "90d") return "90 dias";
  return "12 meses";
}

export default function Inicio({ perfil }: { perfil: Perfil }) {
  const dashRef = useRef<HTMLDivElement>(null);

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [ranking, setRanking] = useState<Rank[]>([]);
  const [cidades, setCidades] = useState<string[]>([]);
  const [origensDisp, setOrigensDisp] = useState<string[]>([]);

  // Filtros globais
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [cidadeF, setCidadeF] = useState("");
  const [origemF, setOrigemF] = useState<string[]>([]);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // KPI comparativo
  const [novosPeriodo, setNovosPeriodo] = useState<number | null>(null);
  const [novosAnteriores, setNovosAnteriores] = useState<number | null>(null);

  // Convite (admin only)
  const [convidando, setConvidando] = useState(false);
  const [emailConvite, setEmailConvite] = useState("");
  const [papelConvite, setPapelConvite] = useState("voluntario");
  const [linkConvite, setLinkConvite] = useState("");

  // PDF
  const [exportandoPdf, setExportandoPdf] = useState(false);

  const temFiltro = !!(cidadeF || (origemF ?? []).length > 0 || periodo !== "30d");

  const limparFiltros = () => {
    setCidadeF("");
    setOrigemF([]);
    setPeriodo("30d");
    setDataInicio("");
    setDataFim("");
  };

  // Carrega dados estáticos
  useEffect(() => {
    supabase.rpc("painel_resumo").then(({ data }) => setResumo(data?.[0] ?? null));

    supabase.from("v_ranking_cadastradores").select("*").limit(5)
      .then(({ data }) => setRanking((data as Rank[]) ?? []));

    supabase.from("contacts").select("cidade").eq("status", "ativo")
      .then(({ data }) => {
        const unicas = [...new Set((data ?? []).map((c: any) => c.cidade as string).filter(Boolean))].sort();
        setCidades(unicas);
      });

    supabase.from("contacts").select("origem").eq("status", "ativo").not("origem", "is", null)
      .then(({ data }) => {
        const unicas = [...new Set((data ?? []).map((c: any) => c.origem as string).filter(Boolean))].sort();
        setOrigensDisp(unicas);
      });
  }, []);

  // KPI comparativo: novos no período vs período anterior
  const carregarComparativo = useCallback(async () => {
    const fim = periodoFim(periodo, dataFim);
    const ini = periodoInicio(periodo, dataInicio, dataFim);
    const durMs = fim.getTime() - ini.getTime();
    const iniAnterior = new Date(ini.getTime() - durMs);

    let q1 = supabase.from("contacts").select("id", { count: "exact", head: true })
      .eq("status", "ativo")
      .gte("criado_em", ini.toISOString())
      .lte("criado_em", fim.toISOString());
    if (cidadeF) q1 = q1.eq("cidade", cidadeF);
    if ((origemF ?? []).length > 0) q1 = q1.in("origem", origemF);

    let q2 = supabase.from("contacts").select("id", { count: "exact", head: true })
      .eq("status", "ativo")
      .gte("criado_em", iniAnterior.toISOString())
      .lt("criado_em", ini.toISOString());
    if (cidadeF) q2 = q2.eq("cidade", cidadeF);
    if ((origemF ?? []).length > 0) q2 = q2.in("origem", origemF);

    const [{ count: c1 }, { count: c2 }] = await Promise.all([q1, q2]);
    setNovosPeriodo(c1 ?? 0);
    setNovosAnteriores(c2 ?? 0);
  }, [periodo, dataInicio, dataFim, cidadeF, JSON.stringify(origemF)]);

  useEffect(() => { carregarComparativo(); }, [carregarComparativo]);

  const convidar = async () => {
    const { data, error } = await supabase.rpc("criar_convite", { p_email: emailConvite, p_papel: papelConvite });
    if (!error && data) setLinkConvite(`${window.location.origin}/convite/${data}`);
  };

  const exportarPDF = async () => {
    if (!dashRef.current) return;
    setExportandoPdf(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(dashRef.current, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: "#F2F4F6",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const w = pdf.internal.pageSize.getWidth();
      const h = pdf.internal.pageSize.getHeight();

      // Cabeçalho
      pdf.setFontSize(14);
      pdf.setTextColor(14, 94, 111);
      pdf.text("Base 5.0 — Dashboard", 10, 12);
      pdf.setFontSize(9);
      pdf.setTextColor(92, 107, 122);
      pdf.text(`Workspace: ${perfil.workspace_id}`, 10, 18);
      pdf.text(`Período: ${periodoLabel(periodo)} · Exportado: ${new Date().toLocaleString("pt-BR")}`, 10, 23);

      const imgH = (canvas.height * (w - 20)) / canvas.width;
      pdf.addImage(imgData, "PNG", 10, 28, w - 20, Math.min(imgH, h - 30));

      const dataStr = new Date().toISOString().slice(0, 10);
      pdf.save(`dashboard-base50-${dataStr}.pdf`);

      // Audit log
      supabase.from("audit_logs").insert({
        workspace_id: perfil.workspace_id,
        usuario_id: perfil.id,
        acao: "exportar_dashboard_pdf",
        entidade: "dashboard",
        detalhes: JSON.stringify({ periodo, cidadeF, origemF }),
      }).catch(() => {});
    } catch (e) {
      console.error("Erro ao exportar PDF:", e);
      alert("Erro ao gerar PDF. Tente novamente.");
    } finally {
      setExportandoPdf(false);
    }
  };

  // Delta KPI
  const delta = novosPeriodo !== null && novosAnteriores !== null
    ? novosPeriodo - novosAnteriores : null;
  const pctDelta = (novosAnteriores !== null && novosAnteriores > 0 && delta !== null)
    ? Math.round((delta / novosAnteriores) * 100) : null;

  const IconeDelta = delta === null ? null : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const corDelta = delta === null ? "" : delta > 0 ? "text-ok" : delta < 0 ? "text-erro" : "text-apoio";

  const alternarOrigem = (o: string) =>
    setOrigemF((p) => p.includes(o) ? p.filter((x) => x !== o) : [...p, o]);

  const chipF = (ativo: boolean) =>
    `shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${ativo ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`;

  return (
    <div className="space-y-4 pb-28">
      {/* Cabeçalho com filtros e exportar */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setMostrarFiltros((p) => !p)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-colors ${mostrarFiltros || temFiltro ? "bg-marca text-white border-marca" : "bg-white text-apoio border-linha"}`}>
          <Filter size={13} /> Filtros {temFiltro && "·"}
          {temFiltro && <span className="bg-white text-marca rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">
            {[cidadeF, ...(origemF ?? []), periodo !== "30d" ? periodo : ""].filter(Boolean).length}
          </span>}
        </button>
        <button onClick={exportarPDF} disabled={exportandoPdf}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold bg-white border border-linha text-apoio disabled:opacity-50"
          title="Exportar dashboard em PDF (gráficos SVG podem não renderizar perfeitamente)">
          {exportandoPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          PDF
        </button>
      </div>

      {/* Painel de filtros */}
      {mostrarFiltros && (
        <div className="bg-white border border-linha rounded-xl p-4 space-y-3">
          {/* Período */}
          <div>
            <p className="text-[10px] font-semibold text-apoio uppercase tracking-wide mb-1.5">Período</p>
            <div className="flex gap-1.5 flex-wrap">
              {(["7d", "30d", "90d", "12m"] as Periodo[]).map((p) => (
                <button key={p} onClick={() => setPeriodo(p)} className={chipF(periodo === p)}>
                  {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : p === "90d" ? "90 dias" : "12 meses"}
                </button>
              ))}
            </div>
          </div>
          {/* Cidade */}
          {cidades.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-apoio uppercase tracking-wide mb-1.5">Cidade</p>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setCidadeF("")} className={chipF(!cidadeF)}>Todas</button>
                {cidades.map((c) => (
                  <button key={c} onClick={() => setCidadeF(cidadeF === c ? "" : c)} className={chipF(cidadeF === c)}>{c}</button>
                ))}
              </div>
            </div>
          )}
          {/* Origem */}
          {origensDisp.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-apoio uppercase tracking-wide mb-1.5">Origem (multi)</p>
              <div className="flex gap-1.5 flex-wrap">
                {origensDisp.map((o) => (
                  <button key={o} onClick={() => alternarOrigem(o)} className={chipF((origemF ?? []).includes(o))}>{o}</button>
                ))}
              </div>
            </div>
          )}
          {/* Limpar */}
          {temFiltro && (
            <button onClick={limparFiltros} className="flex items-center gap-1 text-xs text-apoio">
              <X size={12} /> Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* KPIs */}
      <div ref={dashRef}>
        <div className="grid grid-cols-2 gap-2">
          {/* Total */}
          <div className="bg-white border border-linha rounded-xl p-3">
            <div className="text-2xl font-bold text-tinta">{resumo?.total_contatos?.toLocaleString("pt-BR") ?? "–"}</div>
            <div className="text-[10px] text-apoio mt-0.5">Total de contatos</div>
          </div>
          {/* Novos no período + delta */}
          <div className="bg-white border border-linha rounded-xl p-3">
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-bold text-tinta">
                {novosPeriodo !== null ? `+${novosPeriodo}` : "–"}
              </span>
              {IconeDelta && delta !== 0 && (
                <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${corDelta}`}>
                  <IconeDelta size={11} />
                  {pctDelta !== null ? `${pctDelta > 0 ? "+" : ""}${pctDelta}%` : ""}
                </span>
              )}
            </div>
            <div className="text-[10px] text-apoio mt-0.5">Novos ({periodoLabel(periodo)})</div>
            {novosAnteriores !== null && (
              <div className="text-[9px] text-apoio/70 mt-0.5">vs {novosAnteriores} período ant.</div>
            )}
          </div>
          {/* LGPD ok */}
          <div className="bg-white border border-linha rounded-xl p-3">
            <div className="text-2xl font-bold text-tinta">{resumo ? `${resumo.pct_consentimento}%` : "–"}</div>
            <div className="text-[10px] text-apoio mt-0.5">LGPD ok</div>
          </div>
          {/* Opt-in pendentes */}
          <div className="bg-white border border-linha rounded-xl p-3">
            <div className="text-2xl font-bold text-alerta">{resumo?.optin_pendentes?.toLocaleString("pt-BR") ?? "–"}</div>
            <div className="text-[10px] text-apoio mt-0.5">Opt-in pendentes</div>
          </div>
        </div>

        {/* Evolução temporal */}
        <div className="bg-white border border-linha rounded-xl p-4 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-marca" />
            <span className="text-sm font-semibold text-tinta">Evolução de cadastros</span>
          </div>
          <EvolucaoContatos periodo={periodo} cidadeF={cidadeF} origemF={origemF} />
        </div>

        {/* Funil */}
        <div className="bg-white border border-linha rounded-xl p-4 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={15} className="text-marca" />
            <span className="text-sm font-semibold text-tinta">Funil de engajamento</span>
          </div>
          <p className="text-[10px] text-apoio mb-2">
            Níveis 3–6 refletem mensagens via WhatsApp. Podem estar zerados se Edge Functions ainda não ativas.
          </p>
          <FunilCampanha />
        </div>

        {/* Origem + Top bairros em grid */}
        <div className="grid grid-cols-1 gap-3 mt-3">
          <div className="bg-white border border-linha rounded-xl p-4">
            <span className="text-sm font-semibold text-tinta block mb-3">Distribuição por origem</span>
            <DistribuicaoOrigem cidadeF={cidadeF} />
          </div>
          <div className="bg-white border border-linha rounded-xl p-4">
            <span className="text-sm font-semibold text-tinta block mb-3">Top bairros</span>
            <TopBairros cidadeF={cidadeF} />
          </div>
        </div>

        {/* Ranking */}
        <div className="bg-white border border-linha rounded-xl p-4 mt-3">
          <div className="flex items-center gap-2 mb-3">
            <Users size={15} className="text-marca" />
            <span className="text-sm font-semibold text-tinta">Ranking de cadastradores</span>
          </div>
          {ranking.length === 0 && <p className="text-xs text-apoio">Sem cadastros ainda.</p>}
          {ranking.map((r, i) => (
            <div key={r.cadastrador} className={`flex items-center justify-between py-1.5 ${i ? "border-t border-linha" : ""}`}>
              <span className="text-sm text-tinta">{i + 1}º · {r.cadastrador}{r.cadastrador === perfil.nome ? " (você)" : ""}</span>
              <span className="rounded-full px-2 py-0.5 text-xs font-medium text-marca" style={{ background: "#E2EEF1" }}>{r.qtd}</span>
            </div>
          ))}
        </div>

        {/* Convite (admin) */}
        {perfil.papel === "administrador" && (
          <div className="bg-white border border-linha rounded-xl p-4 mt-3">
            <button onClick={() => setConvidando(!convidando)} className="flex items-center gap-2 text-sm font-semibold text-marca">
              <UserPlus size={15} /> Convidar pessoa para a equipe
            </button>
            {convidando && (
              <div className="mt-3 space-y-2">
                <input className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha"
                  type="email" placeholder="E-mail da pessoa" value={emailConvite}
                  onChange={(e) => setEmailConvite(e.target.value)} />
                <div className="flex flex-wrap gap-1.5">
                  {["coordenador", "assessor", "voluntario"].map((p) => (
                    <button key={p} onClick={() => setPapelConvite(p)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${papelConvite === p ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
                      {p}
                    </button>
                  ))}
                </div>
                <button onClick={convidar} className="w-full rounded-xl py-2.5 text-xs font-bold text-white bg-marca">
                  Gerar link de convite
                </button>
                {linkConvite && (
                  <button onClick={() => navigator.clipboard.writeText(linkConvite)}
                    className="w-full rounded-xl p-2.5 text-xs flex items-center gap-2 bg-green-50 border border-green-200 text-ok">
                    <CheckCircle2 size={13} /> Link gerado! Toque para copiar e envie por WhatsApp.
                    <Copy size={12} className="ml-auto" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audit log consulta dashboard */}
      {/* Registrado silenciosamente ao montar com filtros */}
    </div>
  );
}
