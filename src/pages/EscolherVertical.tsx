import { useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import type { Vertical } from "../lib/terminologia";
import { CheckCircle2, Loader2 } from "lucide-react";

const VERTICAIS: { id: Vertical; emoji: string; nome: string; desc: string }[] = [
  { id: "politica",    emoji: "🗳️", nome: "Política",             desc: "Campanhas eleitorais e bases de apoiadores" },
  { id: "religioso",   emoji: "⛪",  nome: "Religioso",            desc: "Igrejas, pastorais e comunidades de fé" },
  { id: "imobiliario", emoji: "🏠",  nome: "Imobiliário",          desc: "Leads, corretores e funil de vendas" },
  { id: "varejo",      emoji: "🛍️", nome: "Varejo",               desc: "Clientes, vendedores e promoções" },
  { id: "pesquisa",    emoji: "📊",  nome: "Pesquisa",             desc: "Amostras, pesquisadores e coleta de dados" },
  { id: "publicidade", emoji: "📢",  nome: "Publicidade",          desc: "Leads, ativações e agentes de campo" },
  { id: "ong",         emoji: "🤝",  nome: "ONG / Terceiro setor", desc: "Doadores, voluntários e beneficiários" },
  { id: "outro",       emoji: "📋",  nome: "Outro",                desc: "Vocabulário genérico e personalizável" },
];

const CORES = [
  { hex: "#0F4C5C", nome: "Teal" },
  { hex: "#1D6A96", nome: "Azul" },
  { hex: "#7B2D8B", nome: "Roxo" },
  { hex: "#C0392B", nome: "Vermelho" },
  { hex: "#1E8449", nome: "Verde" },
  { hex: "#D35400", nome: "Laranja" },
];

type Etapa = "escolher" | "personalizar";

export default function EscolherVertical({ perfil, onSair }: { perfil: Perfil; onSair: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>("escolher");
  const [vertical, setVertical] = useState<Vertical | null>(null);
  const [nomeExibicao, setNomeExibicao] = useState("");
  const [corPrimaria, setCorPrimaria] = useState(CORES[0].hex);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const salvarSettings = async (incluiPersonalizacao: boolean) => {
    if (!vertical) return;
    setSalvando(true);
    setErro("");

    const payload: Record<string, unknown> = {
      workspace_id: perfil.workspace_id,
      vertical,
    };
    if (incluiPersonalizacao) {
      if (nomeExibicao.trim()) payload.nome_exibicao = nomeExibicao.trim();
      payload.cor_primaria = corPrimaria;
    }

    const { error } = await supabase.from("workspace_settings").insert(payload);
    if (error) {
      setSalvando(false);
      setErro("Falha ao salvar: " + error.message);
      return;
    }
    await supabase.from("audit_logs").insert({
      workspace_id: perfil.workspace_id,
      usuario_id: perfil.id,
      acao: "configurar_vertical",
      entidade: "workspace_settings",
      detalhes: JSON.stringify({ vertical, personalizacao: incluiPersonalizacao }),
    }).then(undefined, () => {});
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen w-full flex justify-center bg-fundo">
      <div className="w-full max-w-md flex flex-col items-center px-4 py-8 gap-6">

        {/* Logo + título */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl bg-marca">B5</div>
          <h1 className="text-xl font-bold text-tinta">Bem-vindo ao Base 5.0!</h1>
          <p className="text-sm text-apoio">
            {etapa === "escolher"
              ? "Qual é o tipo da sua operação?"
              : "Personalize seu workspace (opcional)"}
          </p>
        </div>

        {etapa === "escolher" ? (
          <>
            {/* Grid de verticais */}
            <div className="grid grid-cols-2 gap-3 w-full">
              {VERTICAIS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVertical(v.id)}
                  className={`rounded-2xl p-4 text-left border transition-colors flex flex-col gap-1.5 ${
                    vertical === v.id
                      ? "bg-marca/10 border-marca"
                      : "bg-white border-linha hover:border-marca/40"
                  }`}>
                  <span className="text-2xl leading-none">{v.emoji}</span>
                  <span className={`text-sm font-bold leading-tight ${vertical === v.id ? "text-marca" : "text-tinta"}`}>{v.nome}</span>
                  <span className="text-[11px] text-apoio leading-snug">{v.desc}</span>
                  {vertical === v.id && (
                    <CheckCircle2 size={14} className="text-marca self-end" />
                  )}
                </button>
              ))}
            </div>

            {erro && <p className="text-xs text-erro text-center">{erro}</p>}

            <button
              onClick={() => vertical && setEtapa("personalizar")}
              disabled={!vertical}
              className="w-full rounded-xl py-3.5 text-sm font-bold text-white bg-marca disabled:opacity-40">
              Próximo →
            </button>
          </>
        ) : (
          <>
            {/* Resumo do vertical escolhido */}
            <div className="w-full bg-white border border-linha rounded-xl p-3 flex items-center gap-3">
              <span className="text-2xl">{VERTICAIS.find((v) => v.id === vertical)?.emoji}</span>
              <div>
                <p className="text-sm font-semibold text-tinta">{VERTICAIS.find((v) => v.id === vertical)?.nome}</p>
                <button onClick={() => setEtapa("escolher")} className="text-xs text-marca">Alterar</button>
              </div>
            </div>

            {/* Nome de exibição */}
            <div className="w-full space-y-1.5">
              <label className="text-xs font-semibold text-tinta block">Nome do workspace (opcional)</label>
              <input
                className="w-full rounded-xl px-3 py-3 text-sm outline-none bg-white border border-linha"
                placeholder="Ex: Campanha João Silva 2026"
                value={nomeExibicao}
                onChange={(e) => setNomeExibicao(e.target.value)}
              />
            </div>

            {/* Cor primária */}
            <div className="w-full space-y-2">
              <label className="text-xs font-semibold text-tinta block">Cor primária</label>
              <div className="flex gap-2">
                {CORES.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setCorPrimaria(c.hex)}
                    title={c.nome}
                    className={`w-9 h-9 rounded-full border-2 transition-transform ${corPrimaria === c.hex ? "border-tinta scale-110" : "border-transparent"}`}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
            </div>

            {erro && <p className="text-xs text-erro text-center">{erro}</p>}

            <div className="flex gap-3 w-full">
              <button
                onClick={() => salvarSettings(false)}
                disabled={salvando}
                className="flex-1 rounded-xl py-3 text-sm font-semibold border border-linha bg-white text-apoio disabled:opacity-40">
                Pular
              </button>
              <button
                onClick={() => salvarSettings(true)}
                disabled={salvando}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white bg-marca disabled:opacity-40 flex items-center justify-center gap-2">
                {salvando && <Loader2 size={14} className="animate-spin" />}
                {salvando ? "Salvando..." : "Salvar e continuar"}
              </button>
            </div>
          </>
        )}

        <button onClick={onSair} className="text-xs text-apoio underline">Sair da conta</button>
      </div>
    </div>
  );
}
