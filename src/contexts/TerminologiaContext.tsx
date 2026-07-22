import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, type Perfil } from "../lib/supabase";
import { TERMOS_PADRAO, type Vertical, type Terminologia } from "../lib/terminologia";

interface TerminologiaCtx {
  t: (chave: keyof Terminologia) => string;
  vertical: Vertical;
}

const fallback: TerminologiaCtx = {
  t: (chave) => TERMOS_PADRAO.politica[chave],
  vertical: "politica",
};

const TerminologiaContext = createContext<TerminologiaCtx>(fallback);

export function useTerminologia() {
  return useContext(TerminologiaContext);
}

// Cache em memória por workspace_id — evita re-fetch entre re-renders
const cache = new Map<string, TerminologiaCtx>();

interface WsSettings {
  vertical: Vertical;
  vocabulario: Partial<Terminologia>;
}

export function TerminologiaProvider({ perfil, children }: { perfil: Perfil | null; children: ReactNode }) {
  const [ctx, setCtx] = useState<TerminologiaCtx>(fallback);

  useEffect(() => {
    if (!perfil) return;

    const key = perfil.workspace_id;
    if (cache.has(key)) {
      setCtx(cache.get(key)!);
      return;
    }

    supabase
      .from("workspace_settings")
      .select("vertical, vocabulario")
      .eq("workspace_id", key)
      .single()
      .then(({ data }) => {
        const settings = data as WsSettings | null;
        const vertical: Vertical = settings?.vertical ?? "politica";
        const base = TERMOS_PADRAO[vertical];
        const vocab = (settings?.vocabulario ?? {}) as Partial<Terminologia>;
        const merged: Terminologia = { ...base, ...vocab };
        const novo: TerminologiaCtx = {
          t: (chave) => merged[chave] ?? base[chave],
          vertical,
        };
        cache.set(key, novo);
        setCtx(novo);
      });
  }, [perfil?.workspace_id]);

  return (
    <TerminologiaContext.Provider value={ctx}>
      {children}
    </TerminologiaContext.Provider>
  );
}
