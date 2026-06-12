import { useEffect, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { Users, MapPin, UserPlus, Copy, CheckCircle2 } from "lucide-react";

interface Resumo { total_contatos: number; novos_hoje: number; pct_consentimento: number; optin_pendentes: number; }
interface PorCidade { cidade: string; qtd: number; }
interface Rank { cadastrador: string; qtd: number; }

export default function Inicio({ perfil }: { perfil: Perfil }) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [porCidade, setPorCidade] = useState<PorCidade[]>([]);
  const [ranking, setRanking] = useState<Rank[]>([]);
  const [convidando, setConvidando] = useState(false);
  const [emailConvite, setEmailConvite] = useState("");
  const [papelConvite, setPapelConvite] = useState("voluntario");
  const [linkConvite, setLinkConvite] = useState("");

  useEffect(() => {
    supabase.rpc("painel_resumo").then(({ data }) => setResumo(data?.[0] ?? null));
    supabase.from("v_contatos_por_cidade").select("*").then(({ data }) => setPorCidade((data as PorCidade[]) ?? []));
    supabase.from("v_ranking_cadastradores").select("*").limit(5).then(({ data }) => setRanking((data as Rank[]) ?? []));
  }, []);

  const convidar = async () => {
    const { data, error } = await supabase.rpc("criar_convite", { p_email: emailConvite, p_papel: papelConvite });
    if (!error && data) setLinkConvite(`${window.location.origin}/convite/${data}`);
  };

  const max = Math.max(1, ...porCidade.map((c) => c.qtd));

  return (
    <div className="space-y-4 pb-4">
      <div className="grid grid-cols-4 gap-2">
        {[
          { rotulo: "Contatos", valor: resumo?.total_contatos ?? "–" },
          { rotulo: "Hoje", valor: resumo ? `+${resumo.novos_hoje}` : "–" },
          { rotulo: "LGPD ok", valor: resumo ? `${resumo.pct_consentimento}%` : "–" },
          { rotulo: "Opt-in pend.", valor: resumo?.optin_pendentes ?? "–" },
        ].map((k) => (
          <div key={k.rotulo} className="bg-white border border-linha rounded-xl p-2.5">
            <div className="text-xl font-bold text-tinta">{k.valor}</div>
            <div className="text-[10px] mt-0.5 text-apoio">{k.rotulo}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-linha rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={15} className="text-marca" />
          <span className="text-sm font-semibold text-tinta">Contatos por cidade</span>
        </div>
        {porCidade.length === 0 && <p className="text-xs text-apoio">Cadastre os primeiros contatos para ver o gráfico.</p>}
        <div className="space-y-2">
          {porCidade.map((c) => (
            <div key={c.cidade} className="flex items-center gap-2">
              <span className="text-xs w-28 truncate text-apoio">{c.cidade}</span>
              <div className="flex-1 rounded-full h-2 bg-fundo">
                <div className="h-2 rounded-full bg-marca" style={{ width: `${(c.qtd / max) * 100}%` }} />
              </div>
              <span className="text-xs font-semibold w-5 text-right text-tinta">{c.qtd}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-linha rounded-xl p-4">
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

      {perfil.papel === "administrador" && (
        <div className="bg-white border border-linha rounded-xl p-4">
          <button onClick={() => setConvidando(!convidando)} className="flex items-center gap-2 text-sm font-semibold text-marca">
            <UserPlus size={15} /> Convidar pessoa para a equipe
          </button>
          {convidando && (
            <div className="mt-3 space-y-2">
              <input className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha"
                type="email" placeholder="E-mail da pessoa" value={emailConvite} onChange={(e) => setEmailConvite(e.target.value)} />
              <div className="flex flex-wrap gap-1.5">
                {["coordenador", "assessor", "voluntario"].map((p) => (
                  <button key={p} onClick={() => setPapelConvite(p)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${papelConvite === p ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
                    {p}
                  </button>
                ))}
              </div>
              <button onClick={convidar} className="w-full rounded-xl py-2.5 text-xs font-bold text-white bg-marca">Gerar link de convite</button>
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
  );
}
