import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, Cell,
} from "recharts";
import { supabase } from "../../lib/supabase";
import { GRADIENTE_FUNIL } from "../../lib/cores-charts";
import { Loader2 } from "lucide-react";

interface NivelFunil {
  nivel: string;
  valor: number;
  pct: number;
}

export default function FunilCampanha() {
  const [dados, setDados] = useState<NivelFunil[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const buscar = async () => {
      setCarregando(true);

      // N1: total contatos ativos
      const { count: total } = await supabase
        .from("contacts").select("id", { count: "exact", head: true }).eq("status", "ativo");

      // N2: contatos com consent='sim'
      const { count: comConsent } = await supabase
        .from("contacts").select("id", { count: "exact", head: true })
        .eq("status", "ativo").eq("consent", "sim");

      // N3: mensagens enviadas (send_logs assistido)
      const { count: enviados } = await supabase
        .from("send_logs").select("id", { count: "exact", head: true });

      // N4-N6: somas de whatsapp_disparos (API Business)
      const { data: disparos } = await supabase
        .from("whatsapp_disparos")
        .select("enviados, entregues, lidos, respondidos");

      const somaDisparos = (disparos ?? []).reduce(
        (acc, d) => ({
          enviados: acc.enviados + (d.enviados ?? 0),
          entregues: acc.entregues + (d.entregues ?? 0),
          lidos: acc.lidos + (d.lidos ?? 0),
          respondidos: acc.respondidos + (d.respondidos ?? 0),
        }),
        { enviados: 0, entregues: 0, lidos: 0, respondidos: 0 }
      );

      const topo = total ?? 1;
      const msgTotal = (enviados ?? 0) + somaDisparos.enviados;

      const niveis: NivelFunil[] = [
        { nivel: "Total", valor: total ?? 0, pct: 100 },
        { nivel: "LGPD ok", valor: comConsent ?? 0, pct: Math.round(((comConsent ?? 0) / topo) * 100) },
        { nivel: "Msg enviada", valor: msgTotal, pct: Math.round((msgTotal / topo) * 100) },
        { nivel: "Entregue", valor: somaDisparos.entregues, pct: Math.round((somaDisparos.entregues / topo) * 100) },
        { nivel: "Lido", valor: somaDisparos.lidos, pct: Math.round((somaDisparos.lidos / topo) * 100) },
        { nivel: "Respondeu", valor: somaDisparos.respondidos, pct: Math.round((somaDisparos.respondidos / topo) * 100) },
      ];

      setDados(niveis);
      setCarregando(false);
    };

    buscar();
  }, []);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload as NivelFunil;
    return (
      <div className="bg-white border border-linha rounded-xl px-3 py-2 text-xs shadow-sm">
        <p className="font-semibold text-tinta">{d.nivel}</p>
        <p className="text-apoio">Total: <span className="font-bold text-marca">{d.valor.toLocaleString("pt-BR")}</span></p>
        <p className="text-apoio">% do topo: <span className="font-bold text-tinta">{d.pct}%</span></p>
      </div>
    );
  };

  if (carregando) return (
    <div className="h-48 flex items-center justify-center">
      <Loader2 size={18} className="animate-spin text-apoio" />
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 60 }}>
        <XAxis type="number" tick={{ fontSize: 10, fill: "#5C6B7A" }} />
        <YAxis type="category" dataKey="nivel" tick={{ fontSize: 10, fill: "#5C6B7A" }} width={60} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
          {dados.map((_, idx) => (
            <Cell key={idx} fill={GRADIENTE_FUNIL[idx] ?? GRADIENTE_FUNIL[GRADIENTE_FUNIL.length - 1]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
