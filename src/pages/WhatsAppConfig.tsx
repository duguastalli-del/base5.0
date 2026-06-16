import { useEffect, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { criptografar, descriptografar } from "../lib/cripto";
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, Copy,
  Eye, EyeOff, Loader2, Wifi, WifiOff,
} from "lucide-react";

const URL_BASE = import.meta.env.VITE_SUPABASE_URL as string;
const WEBHOOK_URL = `${URL_BASE}/functions/v1/whatsapp-webhook`;

const BSP_OPCOES = [
  {
    id: "360dialog" as const,
    label: "360dialog",
    desc: "Parceiro oficial Meta, melhor custo-benefício para o Brasil.",
    recomendado: true,
  },
  {
    id: "twilio" as const,
    label: "Twilio",
    desc: "Alta disponibilidade global, custo mais elevado.",
    recomendado: false,
  },
  {
    id: "zenvia" as const,
    label: "Zenvia",
    desc: "Opção nacional brasileira com suporte em português.",
    recomendado: false,
  },
];

interface ConfigDB {
  workspace_id: string;
  bsp: string;
  api_key_encrypted: string | null;
  phone_number_id: string | null;
  business_account_id: string | null;
  webhook_verify_token: string;
  numero_telefone: string | null;
  display_name: string | null;
  ativo: boolean;
  ultima_verificacao_em: string | null;
  status_verificacao: string | null;
}

export default function WhatsAppConfig({
  perfil,
  onVoltar,
}: {
  perfil: Perfil;
  onVoltar: () => void;
}) {
  const [carregando, setCarregando] = useState(true);

  // Campos do formulário
  const [bsp, setBsp] = useState<"360dialog" | "twilio" | "zenvia">("360dialog");
  const [apiKey, setApiKey] = useState("");
  const [mostrarKey, setMostrarKey] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [numeroTelefone, setNumeroTelefone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [ativo, setAtivo] = useState(false);

  // UI
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copiados, setCopiados] = useState<Record<string, boolean>>({});
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const carregar = async () => {
    setCarregando(true);
    const { data } = await supabase
      .from("whatsapp_api_config")
      .select("*")
      .eq("workspace_id", perfil.workspace_id)
      .maybeSingle();

    if (data) {
      const cfg = data as ConfigDB;
      setBsp((cfg.bsp as "360dialog" | "twilio" | "zenvia") ?? "360dialog");
      setPhoneNumberId(cfg.phone_number_id ?? "");
      setBusinessAccountId(cfg.business_account_id ?? "");
      setNumeroTelefone(cfg.numero_telefone ?? "");
      setDisplayName(cfg.display_name ?? "");
      setVerifyToken(cfg.webhook_verify_token ?? crypto.randomUUID());
      setAtivo(cfg.ativo ?? false);

      if (cfg.api_key_encrypted) {
        try {
          const decrypted = await descriptografar(cfg.api_key_encrypted, perfil.workspace_id);
          setApiKey(decrypted);
        } catch {
          setApiKey("");
        }
      }
    } else {
      setVerifyToken(crypto.randomUUID());
    }
    setCarregando(false);
  };

  useEffect(() => { carregar(); }, []);

  const copiar = async (texto: string, key: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiados((p) => ({ ...p, [key]: true }));
    setTimeout(() => setCopiados((p) => ({ ...p, [key]: false })), 2000);
  };

  const testarConexao = async () => {
    setTestando(true);
    setResultadoTeste(null);
    try {
      const { error } = await supabase.functions.invoke("whatsapp-testar-conexao", {
        body: { workspace_id: perfil.workspace_id },
      });
      if (error) throw error;
      setResultadoTeste({ ok: true, msg: "Conexão estabelecida com sucesso!" });
    } catch {
      setResultadoTeste({
        ok: false,
        msg: "Edge function disponível após a Entrega 3. Salve as configurações e teste novamente depois.",
      });
    }
    setTestando(false);
  };

  const salvar = async () => {
    setErro("");
    if (!(apiKey ?? "").trim()) return setErro("API Key é obrigatória.");
    if (!(phoneNumberId ?? "").trim()) return setErro("Phone Number ID é obrigatório.");
    if (!(numeroTelefone ?? "").trim()) return setErro("Número de telefone é obrigatório.");
    if (!/^\+55\d{10,11}$/.test((numeroTelefone ?? "").trim()))
      return setErro("Número inválido. Use o formato +55DDDXXXXXXXXX.");
    if ((displayName ?? "").trim().length > 25)
      return setErro("Display Name deve ter no máximo 25 caracteres.");

    setSalvando(true);

    let apiKeyEncrypted: string;
    try {
      apiKeyEncrypted = await criptografar(apiKey.trim(), perfil.workspace_id);
    } catch {
      setSalvando(false);
      return setErro("Falha ao criptografar a API Key. Tente novamente.");
    }

    const payload = {
      workspace_id: perfil.workspace_id,
      bsp,
      api_key_encrypted: apiKeyEncrypted,
      phone_number_id: phoneNumberId.trim(),
      business_account_id: (businessAccountId ?? "").trim() || null,
      webhook_verify_token: verifyToken,
      numero_telefone: numeroTelefone.trim(),
      display_name: (displayName ?? "").trim() || null,
      ativo,
      configurado_por: perfil.id,
      configurado_em: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("whatsapp_api_config")
      .upsert(payload, { onConflict: "workspace_id" });

    setSalvando(false);
    if (error) return setErro("Falha ao salvar: " + error.message);

    setSucesso("Configuração salva com sucesso!");
    setTimeout(() => setSucesso(""), 3000);
    await carregar();
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-apoio" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <button
        onClick={onVoltar}
        className="flex items-center gap-1.5 text-xs text-apoio font-medium">
        <ArrowLeft size={14} /> Voltar
      </button>

      {/* Banner de segurança */}
      <div className="rounded-xl p-3 bg-amber-50 border border-amber-200 flex items-start gap-2">
        <AlertTriangle size={15} className="shrink-0 mt-0.5 text-alerta" />
        <p className="text-xs text-alerta leading-relaxed">
          <b>Sua chave API NUNCA é compartilhada.</b> Apenas administradores deste workspace conseguem
          usá-la, e ela é criptografada antes do armazenamento.
        </p>
      </div>

      {/* BSP */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-tinta">Provedor BSP</p>
        {BSP_OPCOES.map((b) => (
          <button
            key={b.id}
            onClick={() => setBsp(b.id)}
            className={`w-full text-left rounded-xl p-3 border text-xs transition-colors ${
              bsp === b.id ? "border-marca bg-blue-50" : "border-linha bg-white"
            }`}>
            <div className="flex items-center gap-2">
              <div
                className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  bsp === b.id ? "border-marca" : "border-linha"
                }`}>
                {bsp === b.id && <div className="w-1.5 h-1.5 rounded-full bg-marca" />}
              </div>
              <span className="font-semibold text-tinta">{b.label}</span>
              {b.recomendado && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-50 text-ok">
                  Recomendado
                </span>
              )}
            </div>
            <p className="mt-1 ml-5 text-apoio">{b.desc}</p>
          </button>
        ))}
      </div>

      {/* Campos */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold mb-1 block text-tinta">API Key *</label>
          <div className="flex gap-1.5">
            <input
              type={mostrarKey ? "text" : "password"}
              className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Cole aqui a API Key do seu BSP"
            />
            <button
              onClick={() => setMostrarKey((p) => !p)}
              className="rounded-xl px-3 border border-linha bg-white text-apoio">
              {mostrarKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold mb-1 block text-tinta">Phone Number ID *</label>
          <input
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Ex: 123456789012345"
          />
        </div>

        <div>
          <label className="text-xs font-semibold mb-1 block text-tinta">
            Business Account ID (WABA ID)
          </label>
          <input
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
            value={businessAccountId}
            onChange={(e) => setBusinessAccountId(e.target.value)}
            placeholder="Ex: 987654321098765"
          />
        </div>

        <div>
          <label className="text-xs font-semibold mb-1 block text-tinta">
            Número de Telefone *
          </label>
          <input
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
            value={numeroTelefone}
            onChange={(e) => setNumeroTelefone(e.target.value)}
            placeholder="+5511999999999"
          />
          <p className="text-[10px] mt-0.5 text-apoio">Formato E.164: +55 + DDD + número</p>
        </div>

        <div>
          <label className="text-xs font-semibold mb-1 block text-tinta">Display Name</label>
          <input
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none border border-linha bg-white"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 25))}
            placeholder="Nome exibido no WhatsApp"
            maxLength={25}
          />
          <p className="text-[10px] mt-0.5 text-apoio text-right">{displayName.length}/25</p>
        </div>
      </div>

      {/* Webhook */}
      <div className="space-y-2 bg-white border border-linha rounded-xl p-3">
        <p className="text-xs font-semibold text-tinta">Webhook</p>
        <p className="text-[10px] text-apoio">
          Cole estes valores no painel do seu BSP e da Meta.
        </p>

        <div>
          <label className="text-[10px] font-medium mb-1 block text-apoio uppercase tracking-wide">
            URL do Webhook
          </label>
          <div className="flex gap-1.5">
            <input
              readOnly
              value={WEBHOOK_URL}
              className="flex-1 rounded-xl px-3 py-2 text-[11px] outline-none border border-linha bg-fundo text-apoio font-mono"
            />
            <button
              onClick={() => copiar(WEBHOOK_URL, "webhook")}
              className="rounded-xl px-3 border border-linha bg-white text-apoio">
              {copiados["webhook"] ? (
                <Check size={14} className="text-ok" />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium mb-1 block text-apoio uppercase tracking-wide">
            Verify Token
          </label>
          <div className="flex gap-1.5">
            <input
              readOnly
              value={verifyToken}
              className="flex-1 rounded-xl px-3 py-2 text-[11px] outline-none border border-linha bg-fundo text-apoio font-mono"
            />
            <button
              onClick={() => copiar(verifyToken, "token")}
              className="rounded-xl px-3 border border-linha bg-white text-apoio">
              {copiados["token"] ? (
                <Check size={14} className="text-ok" />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Testar conexão */}
      <button
        onClick={testarConexao}
        disabled={testando || !(apiKey ?? "").trim()}
        className="w-full rounded-xl py-2.5 text-xs font-semibold border border-linha bg-white flex items-center justify-center gap-2 text-tinta disabled:opacity-50 active:bg-fundo">
        {testando ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Wifi size={14} />
        )}
        {testando ? "Testando..." : "Testar conexão"}
      </button>

      {resultadoTeste && (
        <div
          className={`rounded-xl p-3 text-xs flex items-start gap-2 ${
            resultadoTeste.ok
              ? "bg-green-50 border border-green-200 text-ok"
              : "bg-red-50 border border-red-200 text-erro"
          }`}>
          {resultadoTeste.ok ? (
            <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
          ) : (
            <WifiOff size={13} className="shrink-0 mt-0.5" />
          )}
          {resultadoTeste.msg}
        </div>
      )}

      {/* Toggle ativar */}
      <div className="flex items-center justify-between rounded-xl p-3 bg-white border border-linha">
        <div>
          <p className="text-sm font-semibold text-tinta">Ativar API WhatsApp</p>
          <p className="text-xs text-apoio mt-0.5">Libera disparos em massa neste workspace</p>
        </div>
        <button
          onClick={() => setAtivo((p) => !p)}
          className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
            ativo ? "bg-marca" : "bg-linha"
          }`}>
          <div
            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              ativo ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {erro && (
        <p className="text-xs text-erro flex items-center gap-1.5 font-medium">
          <AlertTriangle size={12} /> {erro}
        </p>
      )}
      {sucesso && (
        <p className="text-xs text-ok flex items-center gap-1.5 font-medium">
          <CheckCircle2 size={12} /> {sucesso}
        </p>
      )}

      <button
        onClick={salvar}
        disabled={salvando}
        className="w-full rounded-xl py-3 text-sm font-bold text-white bg-marca disabled:opacity-60 flex items-center justify-center gap-2">
        {salvando && <Loader2 size={14} className="animate-spin" />}
        {salvando ? "Salvando..." : "Salvar configuração"}
      </button>
    </div>
  );
}
