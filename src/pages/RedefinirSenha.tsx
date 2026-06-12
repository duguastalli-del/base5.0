import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import CampoSenha from "../components/CampoSenha";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

// Página aberta pelo link "redefinir senha" enviado por e-mail.
// O supabase-js detecta o token de recuperação na URL e cria a sessão sozinho.
export default function RedefinirSenha() {
  const nav = useNavigate();
  const [pronto, setPronto] = useState<boolean | undefined>(undefined);
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setPronto(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, sessao) => {
      if (sessao) setPronto(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const salvar = async () => {
    setErro("");
    if (senha.length < 8) return setErro("A senha precisa de pelo menos 8 caracteres.");
    if (senha !== confirma) return setErro("As duas senhas não conferem.");
    setCarregando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setCarregando(false);
    if (error) return setErro("Não foi possível salvar a nova senha: " + error.message);
    setSalvo(true);
    setTimeout(() => nav("/"), 1800);
  };

  if (pronto === undefined)
    return <div className="min-h-screen flex items-center justify-center bg-fundo"><p className="text-sm text-apoio">Verificando link...</p></div>;

  if (!pronto)
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-fundo">
        <div className="bg-white border border-linha rounded-xl p-5 text-center max-w-sm">
          <AlertTriangle className="mx-auto mb-2 text-alerta" size={28} />
          <p className="text-sm font-semibold text-tinta">Link inválido ou expirado</p>
          <p className="text-xs mt-1 text-apoio">
            Volte para a tela de entrada e toque em "Esqueci minha senha" para receber um novo link.
          </p>
          <Link to="/entrar" className="inline-block mt-3 text-xs font-semibold text-marca">Ir para a tela de entrada</Link>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-fundo">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center text-white font-black text-xl bg-marca">B5</div>
          <h1 className="text-xl font-bold text-tinta">Criar nova senha</h1>
          <p className="text-xs mt-1 text-apoio">Escolha uma senha nova para a sua conta.</p>
        </div>

        <div className="bg-white border border-linha rounded-xl p-4 space-y-3">
          <CampoSenha valor={senha} aoMudar={setSenha} placeholder="Nova senha (mín. 8 caracteres)" />
          <CampoSenha valor={confirma} aoMudar={setConfirma} placeholder="Repita a nova senha" />
          {erro && <p className="text-xs flex items-center gap-1.5 font-medium text-erro"><AlertTriangle size={13} /> {erro}</p>}
          {salvo && (
            <p className="text-xs flex items-center gap-1.5 font-medium text-ok">
              <CheckCircle2 size={13} /> Senha alterada! Entrando...
            </p>
          )}
          <button onClick={salvar} disabled={carregando || salvo}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white bg-marca disabled:opacity-60">
            {carregando ? "Salvando..." : "Salvar nova senha"}
          </button>
        </div>
      </div>
    </div>
  );
}
