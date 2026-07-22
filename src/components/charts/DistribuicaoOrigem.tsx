import { useEffect, useState } from "react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
} from "recharts";
import { supabase } from "../../lib/supabase";
import { ORIGENS_CORES, ORIGENS_LABELS, PALETA } from "../../lib/cores-charts";
import { Loader2 } from "lucide-react";

interface Fatia { name: string; value: number; label: string; cor: string; }

interface Props { cidadeF: string; }

export default function DistribuicaoOrigem({ cidadeF }: Props) {
  const [dados, setDados] = useState<Fatia[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const buscar = async () => {
      setCarregando(true);
      let q = supabase.from("contacts").select("origem").eq("status", "ativo");
      if (cidadeF) q = q.eq("cidade", cidadeF);
      const { data } = await q;
      if (cancelado) return;

      const contagem: Record<string, number> = {};
      for (const row of (data ?? [])) {
        const o = (row.origem ?? "outro") as string;
        contagem[o] = (contagem[o] ?? 0) + 1;
      }

      const fatias: Fatia[] = Object.entries(contagem)
        .sort((a, b) => b[1] - a[1])
        .map(([nome, valor], idx) => ({
          name: nome,
          value: valor,
          label: ORIGENS_LABELS[nome] ?? nome,
          cor: ORIGENS_CORES[nome] ?? PALETA[idx % PALETA.length],
        }));

      setDados(fatias);
      setCarregando(false);
    };

    buscar();
    return () => { cancelado = true; };
  }, [cidadeF]);

  const total = dados.reduce((s, d) => s + d.value, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload as Fatia;
    const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
    return (
      <div className="bg-white border border-linha rounded-xl px-3 py-2 text-xs shadow-sm">
        <p className="font-semibold text-tinta">{d.label}</p>
        <p className="text-apoio">{d.value.toLocaleString("pt-BR")} contatos · {pct}%</p>
      </div>
    );
  };

  const renderLegenda = ({ payload }: any) => (
    <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
      {(payload ?? []).map((entry: any) => {
        const pct = total > 0 ? Math.round((entry.payload.value / total) * 100) : 0;
        return (
          <div key={entry.value} className="flex items-center gap-1 text-[10px] text-apoio">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
            {entry.payload.label} ({pct}%)
          </div>
        );
      })}
    </div>
  );

  if (carregando) return (
    <div className="h-48 flex items-center justify-center">
      <Loader2 size={18} className="animate-spin text-apoio" />
    </div>
  );

  if (dados.length === 0) return (
    <div className="h-48 flex items-center justify-center">
      <p className="text-xs text-apoio">Nenhum contato com origem definida.</p>
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={dados} cx="50%" cy="45%" innerRadius={50} outerRadius={80}
          dataKey="value" nameKey="label" paddingAngle={2}>
          {dados.map((d, idx) => (
            <Cell key={idx} fill={d.cor} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend content={renderLegenda} />
      </PieChart>
    </ResponsiveContainer>
  );
}
