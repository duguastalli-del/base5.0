import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from "recharts";
import { supabase } from "../../lib/supabase";
import { COR_PRIMARIA, COR_SECUNDARIA } from "../../lib/cores-charts";
import { Loader2 } from "lucide-react";

interface BairroItem { bairro: string; cidade: string; total: number; }

interface Props { cidadeF: string; }

export default function TopBairros({ cidadeF }: Props) {
  const [todos, setTodos] = useState<BairroItem[]>([]);
  const [limite, setLimite] = useState<10 | 20>(10);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const buscar = async () => {
      setCarregando(true);
      let q = supabase.from("contacts").select("bairro, cidade")
        .eq("status", "ativo").not("bairro", "is", null);
      if (cidadeF) q = q.eq("cidade", cidadeF);
      const { data } = await q;
      if (cancelado) return;

      // Agrupar por bairro+cidade em memória
      const contagem: Record<string, BairroItem> = {};
      for (const row of (data ?? [])) {
        const k = `${(row.bairro ?? "")}|${(row.cidade ?? "")}`;
        if (!contagem[k]) contagem[k] = { bairro: row.bairro ?? "", cidade: row.cidade ?? "", total: 0 };
        contagem[k].total++;
      }

      const lista = Object.values(contagem).sort((a, b) => b.total - a.total);
      setTodos(lista);
      setCarregando(false);
    };

    buscar();
    return () => { cancelado = true; };
  }, [cidadeF]);

  const exibidos = todos.slice(0, limite);
  const max = Math.max(1, ...exibidos.map((b) => b.total));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload as BairroItem;
    return (
      <div className="bg-white border border-linha rounded-xl px-3 py-2 text-xs shadow-sm">
        <p className="font-semibold text-tinta">{d.bairro}</p>
        <p className="text-apoio">{d.cidade}</p>
        <p className="text-apoio">Total: <span className="font-bold text-marca">{d.total}</span></p>
      </div>
    );
  };

  if (carregando) return (
    <div className="h-48 flex items-center justify-center">
      <Loader2 size={18} className="animate-spin text-apoio" />
    </div>
  );

  if (exibidos.length === 0) return (
    <div className="h-48 flex items-center justify-center">
      <p className="text-xs text-apoio">Nenhum bairro cadastrado.</p>
    </div>
  );

  const truncar = (s: string, n = 12) => s.length > n ? s.slice(0, n - 1) + "…" : s;

  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(140, exibidos.length * 22)}>
        <BarChart data={exibidos} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 72 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EC" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#5C6B7A" }} />
          <YAxis type="category" dataKey="bairro"
            tickFormatter={(v) => truncar(v)}
            tick={{ fontSize: 9, fill: "#5C6B7A" }} width={72} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {exibidos.map((item, idx) => (
              <Cell key={idx} fill={item.total === max ? COR_PRIMARIA : COR_SECUNDARIA} fillOpacity={0.7 + 0.3 * (item.total / max)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {todos.length > 10 && (
        <div className="flex gap-2 mt-2 justify-center">
          {([10, 20] as const).map((n) => (
            <button key={n} onClick={() => setLimite(n)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${limite === n ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`}>
              Top {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
