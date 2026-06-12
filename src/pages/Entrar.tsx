import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AlertTriangle } from "lucide-react";

export default function Entrar() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const entrar = async () => {
    setErro(""); setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) return setErro("E-mail ou senha incorretos.");
    nav("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-fundo">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center text-white font-black text-xl bg-marca">B5</div>
          <h1 className="text-xl font-bold text-tinta">Base 5.0</h1>
          <p className="text-xs mt-1 text-apoio">Sua base, organizada e conforme a lei.</p>
        </div>

        <div className="bg-white border border-linha rounded-xl p-4 space-y-3">
          <input className="w-full rounded-xl px-3 py-3 text-sm outline-none border border-linha"
            type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full rounded-xl px-3 py-3 text-sm outline-none border border-linha"
            type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
          {erro && <p className="text-xs flex items-center gap-1.5 font-medium text-erro"><AlertTriangle size={13} /> {erro}</p>}
          <button onClick={entrar} disabled={carregando}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white bg-marca disabled:opacity-60">
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </div>

        <p className="text-xs text-center text-apoio">
          Primeira vez? <Link to="/criar" className="font-semibold text-marca">Criar minha campanha</Link>
        </p>
      </div>
    </div>
  );
}
