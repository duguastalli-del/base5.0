// Criptografia client-side para api_key do WhatsApp Business API.
// A chave é derivada do workspace_id via PBKDF2 — nunca é armazenada.
// Qualquer admin do mesmo workspace consegue criptografar e descriptografar.

const ITERACOES = 100_000;

async function derivarChave(workspaceId: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(workspaceId),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
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
    ["encrypt", "decrypt"]
  );
}

export async function criptografar(texto: string, workspaceId: string): Promise<string> {
  const chave = await derivarChave(workspaceId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    chave,
    new TextEncoder().encode(texto)
  );
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), 12);
  return btoa(String.fromCharCode(...combined));
}

export async function descriptografar(base64: string, workspaceId: string): Promise<string> {
  const chave = await derivarChave(workspaceId);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, chave, data);
  return new TextDecoder().decode(decrypted);
}
