import "leaflet/dist/leaflet.css";
import "leaflet.heat";

import L from "leaflet";
import { useEffect, useRef, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { supabase, type Perfil } from "../lib/supabase";
import { geocodificarLote, chaveGeo, type Coords } from "../lib/geocodificar";
import { useTerminologia } from "../contexts/TerminologiaContext";
import { Loader2, Layers, Tag, Filter, X, ChevronDown, ChevronUp } from "lucide-react";

// Corrige ícone padrão do Leaflet com Vite
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

// ─── Componente interno: camada de heatmap ───────────────────────────────────
interface HeatPonto { lat: number; lng: number; intensidade: number; }

function HeatmapLayer({ pontos }: { pontos: HeatPonto[] }) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (layerRef.current) map.removeLayer(layerRef.current);
    if (pontos.length === 0) return;

    const maxI = Math.max(1, ...pontos.map((p) => p.intensidade));
    const dados: [number, number, number][] = pontos.map((p) => [p.lat, p.lng, p.intensidade / maxI]);
    layerRef.current = (L as any).heatLayer(dados, {
      radius: 30, blur: 20, maxZoom: 17, minOpacity: 0.4,
      gradient: { 0.3: "#A8DFE8", 0.6: "#147B8F", 0.9: "#0E5E6F" },
    });
    layerRef.current.addTo(map);
    return () => { if (layerRef.current) map.removeLayer(layerRef.current); };
  }, [map, pontos]);

  return null;
}

// ─── Componente interno: voa para um bairro ──────────────────────────────────
function VoarPara({ coords }: { coords: Coords | null }) {
  const map = useMap();
  useEffect(() => {
    if (coords) map.flyTo([coords.lat, coords.lng], 14, { duration: 1.2 });
  }, [coords, map]);
  return null;
}

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface ContatoMapa {
  bairro: string;
  cidade: string;
  origem: string | null;
  consent: string;
}


interface GrupoLocal {
  bairro: string;
  cidade: string;
  total: number;
  coords: Coords | null;
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function MapaCalor({ perfil }: { perfil: Perfil }) {
  const { t } = useTerminologia();
  const [contatos, setContatos] = useState<ContatoMapa[]>([]);
  const [coordsMap, setCoordsMap] = useState<Map<string, Coords | null>>(new Map());
  const [geocodificando, setGeocodificando] = useState(false);
  const [geocProgress, setGeoProgress] = useState(0);
  const [geocTotal, setGeoTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);

  // Filtros
  const [modo, setModo] = useState<"calor" | "pontos">("calor");
  const [origemF, setOrigemF] = useState<string[]>([]);
  const [consentF, setConsentF] = useState<"todos" | "optin">("todos");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Stats
  const [mostrarStats, setMostrarStats] = useState(false);
  const [alvoVoo, setAlvoVoo] = useState<Coords | null>(null);

  // Carrega contatos
  useEffect(() => {
    const buscar = async () => {
      setCarregando(true);

      // Contatos (sem nested select: busco ids com tags separado se necessário)
      const { data } = await supabase.from("contacts")
        .select("bairro, cidade, origem, consent")
        .eq("status", "ativo")
        .not("cidade", "is", null);

      setContatos((data as ContatoMapa[]) ?? []);
      setCarregando(false);
    };
    buscar();
  }, []);

  // Geocodifica quando contatos carregam
  useEffect(() => {
    if (carregando || contatos.length === 0) return;

    const pares = [
      ...new Map(
        contatos
          .filter((c) => c.bairro && c.cidade)
          .map((c) => [chaveGeo(c.bairro, c.cidade), { bairro: c.bairro, cidade: c.cidade }])
      ).values(),
    ];

    // Também incluir pares só-cidade (sem bairro)
    const soCidades = [
      ...new Map(
        contatos.filter((c) => !c.bairro && c.cidade)
          .map((c) => [chaveGeo("", c.cidade), { bairro: "", cidade: c.cidade }])
      ).values(),
    ];

    const todos = [...pares, ...soCidades];
    if (todos.length === 0) return;

    setGeocodificando(true);
    setGeoTotal(todos.length);
    setGeoProgress(0);

    geocodificarLote(todos, (proc, tot) => {
      setGeoProgress(proc);
      setGeoTotal(tot);
    }).then((result) => {
      setCoordsMap(result);
      setGeocodificando(false);
    });
  }, [carregando, contatos]);

  // Audit log ao abrir
  useEffect(() => {
    supabase.from("audit_logs").insert({
      workspace_id: perfil.workspace_id,
      usuario_id: perfil.id,
      acao: "consulta_mapa_calor",
      entidade: "contacts",
      detalhes: JSON.stringify({}),
    }).then(undefined, () => {});
  }, []);

  const contatosFiltrados = useMemo(() => {
    return contatos.filter((c) => {
      if (consentF === "optin" && c.consent !== "sim") return false;
      if ((origemF ?? []).length > 0 && !origemF.includes(c.origem ?? "")) return false;
      return true;
    });
  }, [contatos, consentF, origemF]);

  // Agrupar por localidade para heatmap/markers
  const grupos: GrupoLocal[] = useMemo(() => {
    const mapa: Record<string, GrupoLocal> = {};
    for (const c of contatosFiltrados) {
      const b = c.bairro ?? "";
      const ci = c.cidade ?? "";
      const k = chaveGeo(b, ci);
      if (!mapa[k]) mapa[k] = { bairro: b, cidade: ci, total: 0, coords: coordsMap.get(k) ?? null };
      mapa[k].total++;
    }
    return Object.values(mapa).sort((a, b) => b.total - a.total);
  }, [contatosFiltrados, coordsMap]);

  const pontosCalor: HeatPonto[] = useMemo(
    () => grupos.filter((g) => g.coords).map((g) => ({ lat: g.coords!.lat, lng: g.coords!.lng, intensidade: g.total })),
    [grupos]
  );

  const semLocalizacao = grupos.filter((g) => !g.coords).reduce((s, g) => s + g.total, 0);
  const totalNoMapa = contatosFiltrados.length;
  const pctSemLocal = totalNoMapa > 0 ? Math.round((semLocalizacao / totalNoMapa) * 100) : 0;

  const topBairros = grupos.filter((g) => g.bairro && g.coords).slice(0, 5);
  const topCidades = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of contatosFiltrados) m[c.cidade] = (m[c.cidade] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [contatosFiltrados]);

  const origensDisp = useMemo(
    () => [...new Set(contatos.map((c) => c.origem).filter(Boolean) as string[])].sort(),
    [contatos]
  );

  const alternarOrigem = (o: string) =>
    setOrigemF((p) => p.includes(o) ? p.filter((x) => x !== o) : [...p, o]);

  const chipF = (ativo: boolean) =>
    `shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${ativo ? "bg-marca text-white" : "bg-white text-apoio border border-linha"}`;

  const temFiltro = (origemF ?? []).length > 0 || consentF !== "todos";

  return (
    <div className="space-y-3 pb-4">
      {/* Controles superiores */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Toggle modo */}
        <div className="flex rounded-xl overflow-hidden border border-linha bg-white">
          <button onClick={() => setModo("calor")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${modo === "calor" ? "bg-marca text-white" : "text-apoio"}`}>
            <Layers size={13} /> Calor
          </button>
          <button onClick={() => setModo("pontos")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${modo === "pontos" ? "bg-marca text-white" : "text-apoio"}`}>
            <Tag size={13} /> Pontos
          </button>
        </div>

        {/* Filtros */}
        <button onClick={() => setMostrarFiltros((p) => !p)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-colors ${mostrarFiltros || temFiltro ? "bg-marca text-white border-marca" : "bg-white text-apoio border-linha"}`}>
          <Filter size={13} /> Filtros
        </button>

        {/* Stats */}
        <button onClick={() => setMostrarStats((p) => !p)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-colors ${mostrarStats ? "bg-marca text-white border-marca" : "bg-white text-apoio border-linha"} ml-auto`}>
          {mostrarStats ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Estatísticas
        </button>
      </div>

      {/* Painel de filtros */}
      {mostrarFiltros && (
        <div className="bg-white border border-linha rounded-xl p-4 space-y-3">
          <div>
            <p className="text-[10px] font-semibold text-apoio uppercase tracking-wide mb-1.5">Consentimento</p>
            <div className="flex gap-1.5">
              <button onClick={() => setConsentF("todos")} className={chipF(consentF === "todos")}>Todos</button>
              <button onClick={() => setConsentF("optin")} className={chipF(consentF === "optin")}>Apenas opt-in</button>
            </div>
          </div>
          {origensDisp.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-apoio uppercase tracking-wide mb-1.5">Origem</p>
              <div className="flex gap-1.5 flex-wrap">
                {origensDisp.map((o) => (
                  <button key={o} onClick={() => alternarOrigem(o)} className={chipF((origemF ?? []).includes(o))}>{o}</button>
                ))}
              </div>
            </div>
          )}
          {temFiltro && (
            <button onClick={() => { setOrigemF([]); setConsentF("todos"); }}
              className="flex items-center gap-1 text-xs text-apoio">
              <X size={12} /> Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Barra de geocodificação */}
      {geocodificando && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-marca shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-marca">Geocodificando localizações…</p>
            <p className="text-[10px] text-apoio">{geocProgress} de {geocTotal} locais ({Math.round((geocProgress / Math.max(1, geocTotal)) * 100)}%)</p>
            <div className="mt-1 h-1.5 rounded-full bg-blue-100">
              <div className="h-1.5 rounded-full bg-marca transition-all" style={{ width: `${(geocProgress / Math.max(1, geocTotal)) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Mapa */}
      {carregando ? (
        <div className="h-64 flex items-center justify-center bg-white border border-linha rounded-xl">
          <Loader2 size={20} className="animate-spin text-apoio" />
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-linha" style={{ height: 380 }}>
          <MapContainer
            center={[-22.91, -47.06]}
            zoom={10}
            style={{ height: "100%", width: "100%" }}
            zoomControl={true}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {modo === "calor" && <HeatmapLayer pontos={pontosCalor} />}
            {modo === "pontos" && grupos.filter((g) => g.coords).map((g) => (
              <Marker key={`${g.bairro}|${g.cidade}`} position={[g.coords!.lat, g.coords!.lng]}>
                <Popup>
                  <div className="text-xs">
                    <p className="font-semibold">{g.bairro || g.cidade}</p>
                    {g.bairro && <p className="text-gray-500">{g.cidade}</p>}
                    <p className="mt-1 font-medium text-[#0E5E6F]">{g.total} {g.total !== 1 ? t('contatos') : t('contato')}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
            <VoarPara coords={alvoVoo} />
          </MapContainer>
        </div>
      )}

      {/* Estatísticas */}
      {mostrarStats && (
        <div className="bg-white border border-linha rounded-xl p-4 space-y-4">
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-lg font-bold text-tinta">{totalNoMapa.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-apoio">No filtro</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-marca">{pontosCalor.reduce((s, p) => s + p.intensidade, 0).toLocaleString("pt-BR")}</p>
              <p className="text-[10px] text-apoio">No mapa</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-alerta">{pctSemLocal}%</p>
              <p className="text-[10px] text-apoio">Sem local.</p>
            </div>
          </div>

          {/* Top 5 bairros clicáveis */}
          {topBairros.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-tinta mb-2">Top bairros (clique para zoom)</p>
              <div className="space-y-1.5">
                {topBairros.map((g, i) => (
                  <button key={i} onClick={() => setAlvoVoo(g.coords)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-fundo hover:bg-blue-50 transition-colors text-left">
                    <span className="text-xs text-tinta truncate">{g.bairro} · {g.cidade}</span>
                    <span className="text-xs font-semibold text-marca ml-2 shrink-0">{g.total}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Top 5 cidades */}
          {topCidades.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-tinta mb-2">Top cidades</p>
              <div className="space-y-1.5">
                {topCidades.map(([cidade, total], i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-fundo">
                    <span className="text-xs text-tinta truncate">{cidade}</span>
                    <span className="text-xs font-semibold text-marca ml-2 shrink-0">{total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {semLocalizacao > 0 && (
            <p className="text-[10px] text-apoio">
              {semLocalizacao} {semLocalizacao !== 1 ? t('contatos') : t('contato')} sem localização geocodificada ({pctSemLocal}% do filtro) — agrupados como "Sem local".
            </p>
          )}
        </div>
      )}
    </div>
  );
}
