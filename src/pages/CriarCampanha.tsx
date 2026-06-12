import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AlertTriangle } from "lucide-react";

export default function CriarCampanha() {
  const nav = useNavigate();
  const [nome, setNome] = useState("");
  const [campanha, setCampanha] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const criar = async () => {
    setErro("");
    if (!nome.trim() || !campanha.trim()) return setErro("Preencha seu nome e o nome da campanha.");
    if (senha.length < 8) return setErro("A senha precisa de pelo menos 8 caracteres.");
    setCarregando(true);
    // Caminho A do banco: metadado workspace_nome → trigger cria
    // workspace + perfil admin + templates + tags automaticamente
    const { error } = await supabase.auth.signUp({
      email, password: senha,
      options: { data: { nome: nome.trim(), workspace_nome: campanha.trim() } },
    });
    setCarregando(false);
    if (error) return setErro(error.message.includes("registered") ? "Este e-mail já tem conta." : error.message);
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
          <input className="w-full rounded-xl px-3 py-3 text-sm outline-none border border-linha"
            type="password" placeholder="Senha (mín. 8 caracteres)" value={senha} onChange={(e) => setSenha(e.target.value)} />
          {erro && <p className="text-xs flex items-center gap-1.5 font-medium text-erro"><AlertTriangle size={13} /> {erro}</p>}
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
