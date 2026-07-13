import { createClient } from "@supabase/supabase-js";

// Fallback só evita erro de build quando as env vars ainda não foram configuradas
// (ex.: build local sem .env.local). Em produção, configure as env vars reais na Vercel.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
