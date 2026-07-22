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

/** Busca (ou cria) tags por nome no workspace e insere em contact_tags. */
export async function salvarContactTags(
  contactId: string,
  tagNames: string[],
  workspaceId: string
): Promise<void> {
  if (!(tagNames ?? []).length) return;

  const { data: existentes } = await supabase
    .from("tags")
    .select("id, nome")
    .eq("workspace_id", workspaceId);

  const mapa: Record<string, string> = {};
  for (const t of (existentes ?? [])) {
    mapa[((t.nome as string) ?? "").toLowerCase()] = t.id as string;
  }

  const tagIds: string[] = [];
  for (const nome of tagNames) {
    const key = (nome ?? "").toLowerCase();
    if (mapa[key]) {
      tagIds.push(mapa[key]);
    } else {
      const { data } = await supabase
        .from("tags")
        .insert({ workspace_id: workspaceId, nome })
        .select("id")
        .single();
      if (data?.id) {
        tagIds.push(data.id as string);
        mapa[key] = data.id as string;
      }
    }
  }

  if (!tagIds.length) return;

  await supabase.from("contact_tags").upsert(
    tagIds.map((tag_id) => ({ contact_id: contactId, tag_id })),
    { ignoreDuplicates: true }
  );
}

/** Tenta enviar a fila local para o Supabase. Retorna quantos subiram. */
export async function sincronizar(criadoPor: string, workspaceId: string): Promise<number> {
  const itens = await db.fila.toArray();
  let enviados = 0;
  for (const c of itens) {
    const { data: contactData, error } = await supabase
      .from("contacts")
      .insert({
        workspace_id: workspaceId,
        nome: c.nome,
        celular_e164: c.celular_e164,
        cidade: c.cidade,
        bairro: c.bairro,
        origem: c.origem,
        obs: c.obs,
        consent: c.consent,
        criado_por: criadoPor,
      })
      .select("id")
      .single();

    if (!error) {
      if (contactData?.id && (c.tags ?? []).length > 0) {
        await salvarContactTags(contactData.id as string, c.tags, workspaceId);
      }
      await db.fila.delete(c.id!);
      enviados++;
    } else if (error.code === "23505") {
      // Duplicado: remove da fila (contato já existe, tags ficam como estão)
      await db.fila.delete(c.id!);
      enviados++;
    }
  }
  return enviados;
}
