// Offline-first: cadastros feitos sem internet entram na fila local
// (IndexedDB via Dexie) e sincronizam sozinhos quando a conexão volta.
import Dexie, { type Table } from "dexie";
import { supabase } from "./supabase";

export interface ContatoPendente {
  id?: number;
  nome: string;
  celular_e164: string;
  cidade: string;
  bairro: string | null;
  origem: string | null;
  obs: string | null;
  consent: "sim" | "pendente" | "recusou";
  tags: string[];
  criado_em: string;
}

class Base50DB extends Dexie {
  fila!: Table<ContatoPendente, number>;
  constructor() {
    super("base50");
    this.version(1).stores({ fila: "++id, celular_e164" });
  }
}

export const db = new Base50DB();

export async function pendentes(): Promise<number> {
  return db.fila.count();
}

/** Tenta enviar a fila local para o Supabase. Retorna quantos subiram. */
export async function sincronizar(criadoPor: string, workspaceId: string): Promise<number> {
  const itens = await db.fila.toArray();
  let enviados = 0;
  for (const c of itens) {
    const { error } = await supabase.from("contacts").insert({
      workspace_id: workspaceId,
      nome: c.nome,
      celular_e164: c.celular_e164,
      cidade: c.cidade,
      bairro: c.bairro,
      origem: c.origem,
      obs: c.obs,
      consent: c.consent,
      criado_por: criadoPor,
    });
    // 23505 = duplicado (mesmo celular). Tira da fila do mesmo jeito.
    if (!error || error.code === "23505") {
      await db.fila.delete(c.id!);
      enviados++;
    }
  }
  return enviados;
}
