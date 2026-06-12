export const soDigitos = (s: string) => (s || "").replace(/\D/g, "");

export const mascaraCelular = (v: string) => {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

// Regra inegociável: telefones gravados em E.164
export const paraE164 = (v: string) => `+55${soDigitos(v)}`;

export const linkWa = (e164: string, txt: string) =>
  `https://wa.me/${e164.replace("+", "")}?text=${encodeURIComponent(txt)}`;
