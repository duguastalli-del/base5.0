import { useEffect, useState } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import WhatsAppConfig from "./WhatsAppConfig";
import WhatsAppTemplates from "./WhatsAppTemplates";

export default function WhatsAppHub({ perfil }: { perfil: Perfil }) {
  const isAdmin = perfil.papel === "administrador";
  const podeGerenciar = isAdmin || perfil.papel === "coordenador";

  const [vista, setVista] = useState<"config" | "templates">(
    isAdmin ? "config" : "templates"
  );
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

  return (
    <div className="space-y-3 pb-4">
      {/* Sub-nav */}
      <div className="flex gap-1.5">
        {isAdmin && (
          <button
            onClick={() => setVista("config")}
            className={`flex-1 rounded-xl py-2.5 text-xs font-semibold ${
              vista === "config"
                ? "bg-marca text-white"
                : "bg-white text-apoio border border-linha"
            }`}>
            Configuração da API
          </button>
        )}
        <button
          onClick={() => setVista("templates")}
          className={`flex-1 rounded-xl py-2.5 text-xs font-semibold ${
            vista === "templates"
              ? "bg-marca text-white"
              : "bg-white text-apoio border border-linha"
          }`}>
          Templates Oficiais
        </button>
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
    </div>
  );
}
