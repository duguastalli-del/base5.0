import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  console.warn("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.local");
}

export const supabase = createClient(url ?? "", anon ?? "");

export type Papel = "administrador" | "coordenador" | "assessor" | "voluntario";

export interface Perfil {
  id: string;
  workspace_id: string;
  nome: string;
  papel: Papel;
}

export async function meuPerfil(): Promise<Perfil | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Perfil) ?? null;
}
