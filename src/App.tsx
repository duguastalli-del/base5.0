import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase, meuPerfil, type Perfil } from "./lib/supabase";
import { sincronizar, pendentes } from "./lib/db";
import Entrar from "./pages/Entrar";
import CriarCampanha from "./pages/CriarCampanha";
import Convite from "./pages/Convite";
import RedefinirSenha from "./pages/RedefinirSenha";
import Inicio from "./pages/Inicio";
import Contatos from "./pages/Contatos";
import NovoContato from "./pages/NovoContato";
import Envio from "./pages/Envio";
import Agenda from "./pages/Agenda";
import WhatsAppHub from "./pages/WhatsAppHub";

import { LayoutDashboard, Users, UserPlus, Send, CalendarDays, LogOut, MessageCircle } from "lucide-react";

const CIDADES_PADRAO = ["Santa Bárbara d'Oeste", "Americana", "Nova Odessa", "Sumaré"];

function Shell({ perfil, sair }: { perfil: Perfil; sair: () => void }) {
  const [aba, setAba] = useState("inicio");
  const [cidades, setCidades] = useState<string[]>(() => {
    const salvas = localStorage.getItem("base50-cidades");
    return salvas ? JSON.parse(salvas) : CIDADES_PADRAO;
  });

  const adicionarCidade = (n: string) => {
    setCidades((p) => {
      const novas = p.includes(n) ? p : [...p, n];
      localStorage.setItem("base50-cidades", JSON.stringify(novas));
      return novas;
    });
  };

  // Sincronização automática quando a internet volta
  useEffect(() => {
    const aoVoltar = async () => {
      if (await pendentes() > 0) await sincronizar(perfil.id, perfil.workspace_id);
    };
    window.addEventListener("online", aoVoltar);
    aoVoltar();
    return () => window.removeEventListener("online", aoVoltar);
  }, [perfil]);

  const abas = [
    { id: "inicio", rotulo: "Início", icone: LayoutDashboard, titulo: "Visão geral" },
    { id: "contatos", rotulo: "Contatos", icone: Users, titulo: "Base de contatos" },
    { id: "novo", rotulo: "Novo", icone: UserPlus, titulo: "Novo contato" },
    { id: "envio", rotulo: "Envio", icone: Send, titulo: "Envio assistido" },
    { id: "agenda", rotulo: "Agenda", icone: CalendarDays, titulo: "Agenda da equipe" },
  ];
  const atual = abas.find((a) => a.id === aba) ?? { titulo: "WhatsApp API" };

  return (
    <div className="min-h-screen w-full flex justify-center bg-fundo">
      <div className="w-full max-w-md flex flex-col min-h-screen">
        <header className="px-4 pt-5 pb-3 sticky top-0 z-10 bg-fundo">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm bg-marca">B5</div>
              <div>
                <div className="text-sm font-bold leading-tight text-tinta">Base 5.0</div>
                <div className="text-xs text-apoio">{perfil.nome} · {perfil.papel}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(perfil.papel === "administrador" || perfil.papel === "coordenador") && (
                <button
                  onClick={() => setAba(aba === "whatsapp" ? "inicio" : "whatsapp")}
                  title="WhatsApp API"
                  className={`rounded-xl px-2 py-1.5 text-xs font-semibold flex items-center gap-1 ${
                    aba === "whatsapp" ? "text-marca bg-blue-50" : "text-apoio"
                  }`}>
                  <MessageCircle size={14} /> WA API
                </button>
              )}
              <button onClick={sair} className="flex items-center gap-1 text-xs text-apoio">
                <LogOut size={13} /> Sair
              </button>
            </div>
          </div>
          <h1 className="text-lg font-bold mt-4 text-tinta">{atual.titulo}</h1>
        </header>

        <main className="flex-1 px-4 pb-28 pt-1">
          {aba === "inicio" && <Inicio perfil={perfil} />}
          {aba === "contatos" && <Contatos perfil={perfil} />}
          {aba === "novo" && <NovoContato perfil={perfil} cidades={cidades} aoAdicionarCidade={adicionarCidade} />}
          {aba === "envio" && <Envio perfil={perfil} />}
          {aba === "agenda" && <Agenda perfil={perfil} />}
          {aba === "whatsapp" && <WhatsAppHub perfil={perfil} />}
        </main>

        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-2 pb-3 pt-2 bg-white border-t border-linha">
          <div className="flex justify-around">
            {abas.map((a) => {
              const Ic = a.icone;
              const ativo = aba === a.id;
              const destaque = a.id === "novo";
              return (
                <button key={a.id} onClick={() => setAba(a.id)}
                  className="flex flex-col items-center gap-1 px-2 py-1 rounded-xl"
                  style={destaque ? { background: "#0E5E6F", color: "#fff", padding: "8px 14px", marginTop: -14, boxShadow: "0 4px 12px rgba(14,94,111,.35)" } : {}}>
                  <Ic size={19} color={destaque ? "#fff" : ativo ? "#0E5E6F" : "#5C6B7A"} />
                  <span className="text-[10px] font-semibold" style={{ color: destaque ? "#fff" : ativo ? "#0E5E6F" : "#5C6B7A" }}>{a.rotulo}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

export default function App() {
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined);

  const carregarPerfil = () => meuPerfil().then(setPerfil);

  useEffect(() => {
    carregarPerfil();
    const { data: sub } = supabase.auth.onAuthStateChange(() => carregarPerfil());
    return () => sub.subscription.unsubscribe();
  }, []);

  const sair = async () => { await supabase.auth.signOut(); setPerfil(null); };

  if (perfil === undefined)
    return <div className="min-h-screen flex items-center justify-center bg-fundo"><p className="text-sm text-apoio">Carregando...</p></div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/entrar" element={perfil ? <Navigate to="/" /> : <Entrar />} />
        <Route path="/criar" element={perfil ? <Navigate to="/" /> : <CriarCampanha />} />
        <Route path="/convite/:token" element={<Convite />} />
        <Route path="/redefinir" element={<RedefinirSenha />} />
        <Route path="/" element={perfil ? <Shell perfil={perfil} sair={sair} /> : <Navigate to="/entrar" />} />
      </Routes>
    </BrowserRouter>
  );
}
