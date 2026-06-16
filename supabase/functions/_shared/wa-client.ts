// Adaptador BSP-agnóstico para a API do WhatsApp (360dialog / Meta Cloud API).

export interface WaConfig {
  bsp: string;
  phone_number_id: string | null;
  business_account_id: string | null;
  numero_telefone: string | null;
}

export function apiHeaders(bsp: string, apiKey: string): Record<string, string> {
  if (bsp === "360dialog") {
    return { "D360-API-KEY": apiKey, "Content-Type": "application/json" };
  }
  return { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

export function urlMensagens(cfg: WaConfig): string {
  return cfg.bsp === "360dialog"
    ? "https://waba.360dialog.io/v1/messages"
    : `https://graph.facebook.com/v17.0/${cfg.phone_number_id}/messages`;
}

export function urlTemplates(cfg: WaConfig): string {
  return cfg.bsp === "360dialog"
    ? "https://waba.360dialog.io/v1/configs/templates"
    : `https://graph.facebook.com/v17.0/${cfg.business_account_id}/message_templates`;
}

export function urlVerificar(cfg: WaConfig): string {
  return cfg.bsp === "360dialog"
    ? "https://waba.360dialog.io/v1/configs/webhook"
    : `https://graph.facebook.com/v17.0/${cfg.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`;
}

/** Envia uma mensagem de texto simples (usado para confirmação de opt-out). */
export async function enviarTexto(
  cfg: WaConfig,
  apiKey: string,
  para: string,
  texto: string,
): Promise<void> {
  const payload = {
    messaging_product: "whatsapp",
    to: para.replace("+", ""),
    type: "text",
    text: { body: texto },
  };
  await fetch(urlMensagens(cfg), {
    method: "POST",
    headers: apiHeaders(cfg.bsp, apiKey),
    body: JSON.stringify(payload),
  });
}

/** Resolve o valor de um parâmetro de template para um contato específico. */
export function resolverParam(
  campo: string,
  contato: { nome: string | null; cidade: string | null; bairro: string | null },
): string {
  if ((campo ?? "").startsWith("texto:")) return campo.slice(6);
  switch (campo) {
    case "nome":           return contato.nome ?? "";
    case "primeiro_nome":  return (contato.nome ?? "").split(" ")[0];
    case "cidade":         return contato.cidade ?? "";
    case "bairro":         return contato.bairro ?? "";
    case "bairro_ou_cidade": return contato.bairro ?? contato.cidade ?? "";
    default:               return "";
  }
}
