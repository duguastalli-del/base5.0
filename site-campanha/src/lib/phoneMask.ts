// Aplica máscara de telefone BR conforme o usuário digita: (99) 99999-9999 ou (99) 9999-9999.
export function aplicarMascaraTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);

  if (digitos.length <= 2) {
    return digitos.replace(/^(\d{0,2})/, "($1");
  }

  if (digitos.length <= 6) {
    return digitos.replace(/^(\d{2})(\d{0,4})/, "($1) $2");
  }

  if (digitos.length <= 10) {
    return digitos.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  }

  return digitos.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}
