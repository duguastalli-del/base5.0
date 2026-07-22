import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { supabase } from "../../lib/supabase";
import { COR_PRIMARIA, COR_ACENTO } from "../../lib/cores-charts";
import { Loader2 } from "lucide-react";

type Periodo = "7d" | "30d" | "90d" | "12m";

interface Ponto { label: string; novos: number; acumulado: number; }

interface Props {
  periodo: Periodo;
  cidadeF: string;
  origemF: string[];
}

function subDias(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() - n);
  return r;
}

function subMeses(d: Date, n: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() - n);
  return r;
}

function isoData(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatarEixo(label: string, periodo: Periodo): string {
  if (periodo === "12m") {
    // "2026-06" → "Jun/26"
    const [ano, mes] = label.split("-");
    const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return `${meses[parseInt(mes) - 1]}/${ano.slice(2)}`;
  }
  if (periodo === "90d") {
    // "2026-W24" → "S24"
    return label.split("-W")[1] ? `S${label.split("-W")[1]}` : label.slice(5);
  }
  // dia: "2026-06-15" → "15/06"
  const [, m, d] = label.split("-");
  return `${d}/${m}`;
}

function semanaISO(d: Date): string {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diasDia = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - diasDia);
  const anoISO = tmp.getUTCFullYear();
  const inicioAno = new Date(Date.UTC(anoISO, 0, 1));
  const semana = Math.ceil((((tmp.getTime() - inicioAno.getTime()) / 86400000) + 1) / 7);
  return `${anoISO}-W${String(semana).padStart(2, "0")}`;
}

export default function EvolucaoContatos({ periodo, cidadeF, origemF }: Props) {
  const [dados, setDados] = useState<Ponto[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    const buscar = async () => {
      setCarregando(true);
      const agora = new Date();
      let inicio: Date;

      if (periodo === "7d") inicio = subDias(agora, 7);
      else if (periodo === "30d") inicio = subDias(agora, 30);
      else if (periodo === "90d") inicio = subDias(agora, 90);
      else inicio = subMeses(agora, 12);

      // Total de contatos antes do período (para acumulado correto)
      let qBase = supabase.from("contacts").select("id", { count: "exact", head: true })
        .eq("status", "ativo")
        .lt("criado_em", inicio.toISOString());
      if (cidadeF) qBase = qBase.eq("cidade", cidadeF);
      if ((origemF ?? []).length > 0) qBase = qBase.in("origem", origemF);
      const { count: baseCount } = await qBase;

      // Contatos no período
      let q = supabase.from("contacts").select("criado_em")
        .eq("status", "ativo")
        .gte("criado_em", inicio.toISOString())
        .lte("criado_em", agora.toISOString())
        .order("criado_em", { ascending: true });
      if (cidadeF) q = q.eq("cidade", cidadeF);
      if ((origemF ?? []).length > 0) q = q.in("origem", origemF);
      const { data } = await q;

      if (cancelado) return;

      const lista = (data ?? []) as Array<{ criado_em: string }>;

      // Agregar por bucket (dia / semana / mês)
      const contagem: Record<string, number> = {};
      for (const row of lista) {
        const d = new Date(row.criado_em);
        let bucket: string;
        if (periodo === "12m") {
          bucket = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        } else if (periodo === "90d") {
          bucket = semanaISO(d);
        } else {
          bucket = isoData(d);
        }
        contagem[bucket] = (contagem[bucket] ?? 0) + 1;
      }

      // Gerar sequência de buckets para o eixo X
      const buckets: string[] = [];
      if (periodo === "7d" || periodo === "30d") {
        const dias = periodo === "7d" ? 7 : 30;
        for (let i = dias; i >= 0; i--) buckets.push(isoData(subDias(agora, i)));
      } else if (periodo === "90d") {
        const d = new Date(inicio);
        while (d <= agora) {
          const s = semanaISO(d);
          if (!buckets.includes(s)) buckets.push(s);
          d.setDate(d.getDate() + 7);
        }
      } else {
        for (let i = 11; i >= 0; i--) {
          const d = subMeses(agora, i);
          buckets.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
      }

      let acum = baseCount ?? 0;
      const pontos: Ponto[] = buckets.map((b) => {
        const novos = contagem[b] ?? 0;
        acum += novos;
        return { label: b, novos, acumulado: acum };
      });

      setDados(pontos);
      setCarregando(false);
    };

    buscar();
    return () => { cancelado = true; };
  }, [periodo, cidadeF, JSON.stringify(origemF)]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-linha rounded-xl px-3 py-2 text-xs shadow-sm">
        <p className="font-semibold text-tinta mb-1">{formatarEixo(label, periodo)}</p>
        <p className="text-apoio">Novos: <span className="font-bold text-marca">{payload[0]?.value ?? 0}</span></p>
        <p className="text-apoio">Acumulado: <span className="font-bold text-tinta">{payload[1]?.value ?? 0}</span></p>
      </div>
    );
  };

  if (carregando) return (
    <div className="h-48 flex items-center justify-center">
      <Loader2 size={18} className="animate-spin text-apoio" />
    </div>
  );

  if (dados.length === 0 || dados.every((p) => p.novos === 0)) return (
    <div className="h-48 flex items-center justify-center">
      <p className="text-xs text-apoio">Sem cadastros no período.</p>
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={dados} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EC" />
        <XAxis dataKey="label" tickFormatter={(v) => formatarEixo(v, periodo)}
          tick={{ fontSize: 10, fill: "#5C6B7A" }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: "#5C6B7A" }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Line type="monotone" dataKey="novos" name="Novos" stroke={COR_ACENTO}
          strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="acumulado" name="Acumulado" stroke={COR_PRIMARIA}
          strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
