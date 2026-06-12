import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import CampoSenha from "../components/CampoSenha";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export default function CriarCampanha() {
  const nav = useNavigate();
  const [nome, setNome] = useState("");
  const [campanha, setCampanha] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(false);

  const criar = async () => {
    setErro(""); setAviso("");
    if (!nome.trim() || !campanha.trim()) return setErro("Preencha seu nome e o nome da campanha.");
    if (senha.length < 8) return setErro("A senha precisa de pelo menos 8 caracteres.");
    setCarregando(true);
    // Caminho A do banco: metadado workspace_nome → trigger cria
    // workspace + perfil admin + templates + tags automaticamente
    const { data, error } = await supabase.auth.signUp({
      email, password: senha,
      options: { data: { nome: nome.trim(), workspace_nome: campanha.trim() } },
    });
    setCarregando(false);
    if (error) {
      if (error.code === "user_already_exists" || error.message.includes("registered"))
        return setErro('Este e-mail já tem conta. Use "Entrar" ou "Esqueci minha senha".');
      if (error.code === "weak_password")
        return setErro("Senha muito fraca — use pelo menos 8 caracteres, misturando letras e números.");
      return setErro("Falha ao criar a conta: " + error.message);
    }
    // identities vazio = e-mail já cadastrado (o Supabase não revela isso por erro)
    if (data.user && data.user.identities?.length === 0)
      return setErro('Este e-mail já tem conta. Use "Entrar" ou "Esqueci minha senha".');
    // sessão null = projeto exige confirmação de e-mail antes do primeiro login
    if (!data.session)
      return setAviso("Conta criada! Enviamos um link de confirmação para o seu e-mail — abra-o (verifique o spam) e depois entre pela tela inicial.");
    nav("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-fundo">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center text-white font-black text-xl bg-marca">B5</div>
          <h1 className="text-xl font-bold text-tinta">Criar minha campanha</h1>
          <p className="text-xs mt-1 text-apoio">Você entra como administrador, com templates e tags já prontos.</p>
        </div>

        <div className="bg-white border border-linha rounded-xl p-4 space-y-3">
          <input className="w-full rounded-xl px-3 py-3 text-sm outline-none border border-linha"
            placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input className="w-full rounded-xl px-3 py-3 text-sm outline-none border border-linha"
            placeholder="Nome da campanha / gabinete" value={campanha} onChange={(e) => setCampanha(e.target.value)} />
          <input className="w-full rounded-xl px-3 py-3 text-sm outline-none border border-linha"
            type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <CampoSenha valor={senha} aoMudar={setSenha} placeholder="Senha (mín. 8 caracteres)" />
          {erro && <p className="text-xs flex items-center gap-1.5 font-medium text-erro"><AlertTriangle size={13} /> {erro}</p>}
          {aviso && <p className="text-xs flex items-center gap-1.5 font-medium text-ok"><CheckCircle2 size={13} /> {aviso}</p>}
          <button onClick={criar} disabled={carregando}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white bg-marca disabled:opacity-60">
            {carregando ? "Criando..." : "Criar campanha"}
          </button>
        </div>

        <p className="text-xs text-center text-apoio">
          Já tem conta? <Link to="/entrar" className="font-semibold text-marca">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
