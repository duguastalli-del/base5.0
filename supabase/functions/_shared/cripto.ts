// Espelha src/lib/cripto.ts — usa a mesma derivação PBKDF2 + AES-GCM-256.
// Funciona em Deno (Web Crypto API disponível nativamente).

const ITERACOES = 100_000;

async function derivarChave(workspaceId: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(workspaceId),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("base50-wa-" + workspaceId),
      iterations: ITERACOES,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function descriptografar(
  base64: string,
  workspaceId: string,
): Promise<string> {
  const chave = await derivarChave(workspaceId);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    chave,
    data,
  );
  return new TextDecoder().decode(decrypted);
}
