export function isDesktop(): boolean {
  return !window.matchMedia("(pointer: coarse)").matches && window.innerWidth >= 768;
}

export function isMobile(): boolean {
  return !isDesktop();
}

export function precisaPopupPermission(): boolean {
  return isDesktop();
}

const LIMITE_DIARIO = 80;

function chaveHoje(): string {
  return `disparo_web_dia_${new Date().toISOString().slice(0, 10)}`;
}

export function getEnviadosHoje(): number {
  return parseInt(localStorage.getItem(chaveHoje()) ?? "0", 10);
}

export function incrementarEnviadosHoje(): void {
  localStorage.setItem(chaveHoje(), String(getEnviadosHoje() + 1));
}

export function limiteAtingido(): boolean {
  return getEnviadosHoje() >= LIMITE_DIARIO;
}

export { LIMITE_DIARIO };
