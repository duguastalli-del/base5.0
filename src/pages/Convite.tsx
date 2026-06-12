import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import CampoSenha from "../components/CampoSenha";
import { AlertTriangle, CheckCircle2, Mail } from "lucide-react";

interface DadosConvite { workspace_nome: string; email: string; papel: string; valido: boolean; }

export default function Convite() {
  const { token } = useParams();
  const nav = useNavigate();
  const [convite, setConvite] = useState<DadosConvite | null | undefined>(undefined);
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("ver_convite", { p_token: token });
      setConvite(data?.[0] ?? null);
    })();
  }, [token]);

  const aceitar = async () => {
    setErro(""); setAviso("");
    if (!convite) return;
    if (!nome.trim()) return setErro("Informe seu nome.");
    if (senha.length < 8) return setErro("A senha precisa de pelo menos 8 caracteres.");
    setCarregando(true);
    // Caminho B do banco: invite_token → trigger valida e cria o perfil
    const { data, error } = await supabase.auth.signUp({
      email: convite.email, password: senha,
      options: { data: { nome: nome.trim(), invite_token: token } },
    });
    setCarregando(false);
    if (error) {
      if (error.code === "user_already_exists" || error.message.includes("registered"))
        return setErro('Este e-mail já tem conta. Entre pela tela inicial com a sua senha (ou use "Esqueci minha senha").');
      if (error.code === "weak_password")
        return setErro("Senha muito fraca — use pelo menos 8 caracteres, misturando letras e números.");
      return setErro("Falha ao entrar: " + error.message);
    }
    if (data.user && data.user.identities?.length === 0)
      return setErro('Este e-mail já tem conta. Entre pela tela inicial com a sua senha (ou use "Esqueci minha senha").');
    // sessão null = projeto exige confirmação de e-mail antes do primeiro login
    if (!data.session)
      return setAviso("Conta criada! Enviamos um link de confirmação para o seu e-mail — abra-o (verifique o spam) e depois entre pela tela inicial.");
    nav("/");
  };

  if (convite === undefined)
    return <div className="min-h-screen flex items-center justify-center bg-fundo"><p className="text-sm text-apoio">Verificando convite...</p></div>;

  if (convite === null || !convite.valido)
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-fundo">
        <div className="bg-white border border-linha rounded-xl p-5 text-center max-w-sm">
          <AlertTriangle className="mx-auto mb-2 text-alerta" size={28} />
          <p className="text-sm font-semibold text-tinta">Convite inválido ou expirado</p>
          <p className="text-xs mt-1 text-apoio">Peça um novo link ao administrador da campanha.</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-fundo">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center text-white font-black text-xl bg-marca">B5</div>
          <h1 className="text-lg font-bold text-tinta">Você foi convidado!</h1>
          <p className="text-xs mt-1 text-apoio">
            <b className="text-tinta">{convite.workspace_nome}</b> · papel: <b className="text-marca">{convite.papel}</b>
          </p>
        </div>

        <div className="bg-white border border-linha rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm bg-fundo text-apoio">
            <Mail size={14} /> {convite.email}
          </div>
          <input className="w-full rounded-xl px-3 py-3 text-sm outline-none border border-linha"
            placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <CampoSenha valor={senha} aoMudar={setSenha} placeholder="Crie uma senha (mín. 8)" />
          {erro && <p className="text-xs flex items-center gap-1.5 font-medium text-erro"><AlertTriangle size={13} /> {erro}</p>}
          {aviso && <p className="text-xs flex items-center gap-1.5 font-medium text-ok"><CheckCircle2 size={13} /> {aviso}</p>}
          <button onClick={aceitar} disabled={carregando}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white bg-marca disabled:opacity-60">
            {carregando ? "Entrando..." : "Aceitar e entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
