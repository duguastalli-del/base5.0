export const soDigitos = (s: string) => (s || "").replace(/\D/g, "");

export const mascaraCelular = (v: string) => {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

// Regra inegociável: telefones gravados em E.164
export const paraE164 = (v: string) => `+55${soDigitos(v)}`;

// Normaliza números bagunçados vindos de importação (agenda/Google/planilha)
// para E.164 brasileiro. Retorna null quando não há como aproveitar.
export function normalizarImportado(raw: string): string | null {
  let d = soDigitos(raw);
  if (!d) return null;
  d = d.replace(/^0+/, ""); // remove zeros/tronco à esquerda
  // já vem com código do país (55)
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const resto = d.slice(2);
    return resto.length === 10 || resto.length === 11 ? `+55${resto}` : null;
  }
  // DDD + número: 10 dígitos (fixo) ou 11 (celular)
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
}

export const linkWa = (e164: string, txt: string) =>
  `https://wa.me/${(e164 ?? "").replace("+", "")}?text=${encodeURIComponent(txt)}`;
