const CACHE_KEY = "base50-geocache-v1";

export interface Coords { lat: number; lng: number; }

function lerCache(): Record<string, Coords | null> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function gravarCache(chave: string, val: Coords | null) {
  const cache = lerCache();
  cache[chave] = val;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage cheio — ignora
  }
}

function chave(bairro: string, cidade: string) {
  return `${(bairro ?? "").trim().toLowerCase()}|${(cidade ?? "").trim().toLowerCase()}`;
}

async function buscarNominatim(query: string): Promise<Coords | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`;
  const res = await fetch(url, {
    headers: { "User-Agent": "base50-crm/1.0 (app politico)", "Accept-Language": "pt-BR" },
  });
  const dados = await res.json();
  if ((dados ?? []).length > 0) {
    return { lat: parseFloat(dados[0].lat), lng: parseFloat(dados[0].lon) };
  }
  return null;
}

function esperar(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// Geocodifica um único par bairro+cidade, com cache.
// Respeita rate limit do Nominatim: 1 req/s — chamador é responsável pelo espaçamento.
export async function geocodificar(bairro: string, cidade: string): Promise<Coords | null> {
  const k = chave(bairro, cidade);
  const cache = lerCache();
  if (k in cache) return cache[k];

  // Tenta bairro + cidade primeiro
  let coords = await buscarNominatim(`${bairro}, ${cidade}, Brasil`);

  // Fallback: só cidade se bairro não encontrar
  if (!coords && bairro) {
    coords = await buscarNominatim(`${cidade}, Brasil`);
  }

  gravarCache(k, coords);
  return coords;
}

// Geocodifica em lote, respeitando 1 req/s entre requests não-cacheados.
export async function geocodificarLote(
  pares: Array<{ bairro: string; cidade: string }>,
  aoAtualizar?: (processados: number, total: number) => void
): Promise<Map<string, Coords | null>> {
  const resultado = new Map<string, Coords | null>();
  const cache = lerCache();
  const pendentes: Array<{ bairro: string; cidade: string }> = [];

  // Separar já cacheados
  for (const p of pares) {
    const k = chave(p.bairro, p.cidade);
    if (k in cache) {
      resultado.set(k, cache[k]);
    } else {
      pendentes.push(p);
    }
  }

  // Buscar pendentes com delay entre requests
  for (let i = 0; i < pendentes.length; i++) {
    const p = pendentes[i];
    const k = chave(p.bairro, p.cidade);
    try {
      const coords = await geocodificar(p.bairro, p.cidade);
      resultado.set(k, coords);
    } catch {
      resultado.set(k, null);
    }
    aoAtualizar?.(Object.keys(cache).length + i + 1, pares.length);
    if (i < pendentes.length - 1) await esperar(1100); // ~1 req/s
  }

  return resultado;
}

export { chave as chaveGeo };
