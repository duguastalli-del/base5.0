import { useEffect, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import WhatsAppConfig from "./WhatsAppConfig";
import WhatsAppTemplates from "./WhatsAppTemplates";
import WhatsAppCampanhas from "./WhatsAppCampanhas";
import WhatsAppRespostas from "./WhatsAppRespostas";

type Vista = "config" | "templates" | "campanhas" | "respostas";

export default function WhatsAppHub({ perfil }: { perfil: Perfil }) {
  const isAdmin = perfil.papel === "administrador";
  const podeGerenciar = isAdmin || perfil.papel === "coordenador";

  const defaultVista: Vista = isAdmin ? "config" : "campanhas";
  const [vista, setVista] = useState<Vista>(defaultVista);
  const [apiAtiva, setApiAtiva] = useState(false);

  useEffect(() => {
    supabase
      .from("whatsapp_api_config")
      .select("ativo")
      .eq("workspace_id", perfil.workspace_id)
      .maybeSingle()
      .then(({ data }) => setApiAtiva((data as { ativo: boolean } | null)?.ativo ?? false));
  }, [perfil.workspace_id]);

  if (!podeGerenciar) return null;

  const tabs: { id: Vista; label: string; adminOnly?: boolean }[] = [
    { id: "config",     label: "Configuração", adminOnly: true },
    { id: "templates",  label: "Templates" },
    { id: "campanhas",  label: "Campanhas" },
    { id: "respostas",  label: "Respostas" },
  ];

  return (
    <div className="space-y-3 pb-4">
      {/* Sub-nav */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {tabs
          .filter((t) => !t.adminOnly || isAdmin)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setVista(t.id)}
              className={`flex-1 min-w-0 rounded-xl py-2.5 text-xs font-semibold whitespace-nowrap px-2 ${
                vista === t.id
                  ? "bg-marca text-white"
                  : "bg-white text-apoio border border-linha"
              }`}>
              {t.label}
            </button>
          ))}
      </div>

      {vista === "config" && isAdmin && (
        <WhatsAppConfig
          perfil={perfil}
          onVoltar={() => setVista("templates")}
        />
      )}

      {vista === "templates" && (
        <WhatsAppTemplates
          perfil={perfil}
          apiAtiva={apiAtiva}
        />
      )}

      {vista === "campanhas" && (
        <WhatsAppCampanhas perfil={perfil} />
      )}

      {vista === "respostas" && (
        <WhatsAppRespostas perfil={perfil} />
      )}
    </div>
  );
}
