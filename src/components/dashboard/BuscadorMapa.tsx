import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Search, Navigation, X, CheckCircle2, AlertCircle } from "lucide-react";

export interface ZonaBuscable {
  id: string;
  name: string;
  description: string | null;
  color: string;
  technician_name: string | null;
  polygon: number[][];
}

interface ResultadoDireccion {
  etiqueta: string;
  lat: number;
  lng: number;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * ¿El punto cae dentro de este polígono?
 *
 * Lanzamiento de rayo. Los vértices de las zonas se guardan como [latitud, longitud].
 */
function dentroDe(lat: number, lng: number, poligono: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [yi, xi] = poligono[i];
    const [yj, xj] = poligono[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/**
 * Buscador flotante del mapa de coberturas.
 *
 * Hace dos cosas, porque "guiarse" en un mapa de zonas es una de dos preguntas:
 *   · ¿dónde está la zona tal?  → se escribe el nombre y el mapa se acerca a ella.
 *   · ¿esta dirección tiene cobertura? → se escribe la calle, se pone un punto en el
 *     mapa y se dice en qué zona cae, o que no cae en ninguna.
 *
 * Las direcciones se buscan en OpenStreetMap (Nominatim) solo al pulsar Enter y no
 * mientras se escribe: el servicio es gratuito y pide no más de una consulta por
 * segundo.
 */
export default function BuscadorMapa({
  zonas, mapaRef, leafletRef, onElegirZona,
}: {
  zonas: ZonaBuscable[];
  mapaRef: React.MutableRefObject<any>;
  leafletRef: React.MutableRefObject<any>;
  onElegirZona: (id: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [direcciones, setDirecciones] = useState<ResultadoDireccion[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorDir, setErrorDir] = useState<string | null>(null);
  const [veredicto, setVeredicto] = useState<{ etiqueta: string; zona: ZonaBuscable | null } | null>(null);
  const [cursor, setCursor] = useState(0);
  const marca = useRef<any>(null);
  const caja = useRef<HTMLDivElement | null>(null);
  const pedido = useRef(0);

  const coincidencias = useMemo(() => {
    const q = sinTildes(texto);
    if (!q) return [];
    return zonas
      .filter(z => [z.name, z.description, z.technician_name].some(c => c && sinTildes(c).includes(q)))
      // Los que empiezan igual primero: escribir "zona 1" tiene que poner "Zona 1"
      // arriba de "Zona 10" y de "Sector zona 1".
      .sort((a, b) => Number(sinTildes(b.name).startsWith(q)) - Number(sinTildes(a.name).startsWith(q)))
      .slice(0, 8);
  }, [texto, zonas]);

  // Opciones navegables con el teclado: zonas, luego direcciones.
  const opciones = useMemo(() => [
    ...coincidencias.map(z => ({ tipo: "zona" as const, z })),
    ...(direcciones ?? []).map(d => ({ tipo: "dir" as const, d })),
  ], [coincidencias, direcciones]);

  useEffect(() => { setCursor(0); }, [texto, direcciones]);

  // Cerrar al hacer clic afuera.
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const quitarMarca = () => { if (marca.current) { marca.current.remove(); marca.current = null; } };
  useEffect(() => quitarMarca, []);

  const limpiar = () => {
    setTexto(""); setDirecciones(null); setErrorDir(null); setVeredicto(null); setAbierto(false);
    quitarMarca();
  };

  const elegirZona = (z: ZonaBuscable) => {
    quitarMarca();
    setVeredicto(null);
    setTexto(z.name);
    setAbierto(false);
    onElegirZona(z.id);
  };

  const elegirDireccion = (d: ResultadoDireccion) => {
    const L = leafletRef.current, mapa = mapaRef.current;
    setAbierto(false);
    setTexto(d.etiqueta.split(",").slice(0, 2).join(",").trim());
    const zona = zonas.find(z => z.polygon?.length >= 3 && dentroDe(d.lat, d.lng, z.polygon)) ?? null;
    setVeredicto({ etiqueta: d.etiqueta, zona });
    if (!L || !mapa) return;
    quitarMarca();
    marca.current = L.circleMarker([d.lat, d.lng], {
      radius: 9, color: "#ffffff", weight: 3, fillColor: zona ? "#16a34a" : "#dc2626", fillOpacity: 1,
    }).addTo(mapa);
    mapa.flyTo([d.lat, d.lng], Math.max(mapa.getZoom(), 17), { duration: 0.8 });
  };

  const buscarDireccion = async () => {
    const q = texto.trim();
    if (q.length < 3) return;
    const mio = ++pedido.current;
    setBuscando(true); setErrorDir(null); setDirecciones(null); setAbierto(true);
    try {
      const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=cl&accept-language=es&q="
        + encodeURIComponent(q);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json: any[] = await r.json();
      if (mio !== pedido.current) return;
      const lista = json
        .map(x => ({ etiqueta: String(x.display_name), lat: Number(x.lat), lng: Number(x.lon) }))
        .filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng));
      setDirecciones(lista);
    } catch (e: any) {
      if (mio !== pedido.current) return;
      // Sin red o servicio caído: se dice, no se muestra "no hay resultados".
      setErrorDir("No se pudo buscar la dirección ahora. Prueba de nuevo en unos segundos.");
    } finally {
      if (mio === pedido.current) setBuscando(false);
    }
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, Math.max(0, opciones.length - 1))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === "Escape") { setAbierto(false); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const o = opciones[cursor];
      if (o?.tipo === "zona") elegirZona(o.z);
      else if (o?.tipo === "dir") elegirDireccion(o.d);
      else buscarDireccion();
    }
  };

  const hayTexto = texto.trim().length > 0;
  const mostrarPanel = abierto && hayTexto;

  return (
    <div ref={caja} className="absolute left-3 top-3 z-[80] w-[min(340px,calc(100%-24px))] pointer-events-auto">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
        <input
          value={texto}
          onChange={e => { setTexto(e.target.value); setAbierto(true); setDirecciones(null); setErrorDir(null); setVeredicto(null); }}
          onFocus={() => setAbierto(true)}
          onKeyDown={alTeclear}
          placeholder="Buscar zona o dirección…"
          aria-label="Buscar zona o dirección en el mapa"
          className="w-full h-10 rounded-xl border border-border/40 bg-card/95 backdrop-blur shadow-lg pl-9 pr-9 text-[13px] focus:outline-none focus:border-primary/50"
        />
        {hayTexto && (
          <button onClick={limpiar} aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/60">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {mostrarPanel && (
        <div className="mt-1.5 rounded-xl border border-border/40 bg-card/95 backdrop-blur shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto">
          {coincidencias.length > 0 && (
            <div>
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Zonas</p>
              {coincidencias.map((z, i) => (
                <button key={z.id} onClick={() => elegirZona(z)} onMouseEnter={() => setCursor(i)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${cursor === i ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                  <span className="w-3 h-3 rounded-sm flex-shrink-0 border border-black/10" style={{ backgroundColor: z.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold truncate">{z.name}</span>
                    {(z.description || z.technician_name) && (
                      <span className="block text-[11px] text-muted-foreground/60 truncate">
                        {[z.description, z.technician_name && `Técnico: ${z.technician_name}`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className={coincidencias.length > 0 ? "border-t border-border/20" : ""}>
            <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Direcciones</p>
            {direcciones === null && !buscando && !errorDir && (
              <button onClick={buscarDireccion} disabled={texto.trim().length < 3}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/40 disabled:opacity-50">
                <Navigation className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-[12.5px]">
                  Buscar <strong>«{texto.trim()}»</strong> como dirección <span className="text-muted-foreground/50">(Enter)</span>
                </span>
              </button>
            )}
            {buscando && (
              <p className="px-3 py-3 text-[12px] text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando…
              </p>
            )}
            {errorDir && <p className="px-3 py-3 text-[12px] text-amber-600 dark:text-amber-400">{errorDir}</p>}
            {direcciones && direcciones.length === 0 && (
              <p className="px-3 py-3 text-[12px] text-muted-foreground">No se encontró esa dirección en Chile. Prueba con calle, número y comuna.</p>
            )}
            {direcciones?.map((d, i) => {
              const idx = coincidencias.length + i;
              return (
                <button key={`${d.lat},${d.lng}`} onClick={() => elegirDireccion(d)} onMouseEnter={() => setCursor(idx)}
                  className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ${cursor === idx ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                  <MapPin className="w-4 h-4 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
                  <span className="text-[12px] leading-snug line-clamp-2">{d.etiqueta}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* El resultado de una dirección: la respuesta a "¿tiene cobertura?". */}
      {veredicto && !mostrarPanel && (
        <div className={`mt-1.5 rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur flex items-start gap-2.5 ${
          veredicto.zona ? "border-emerald-500/40 bg-emerald-500/15" : "border-red-500/40 bg-red-500/15"}`}>
          {veredicto.zona
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold leading-tight">
              {veredicto.zona ? `Dentro de «${veredicto.zona.name}»` : "Fuera de las zonas dibujadas"}
            </p>
            <p className="text-[11px] text-muted-foreground/70 leading-snug mt-0.5 line-clamp-2">{veredicto.etiqueta}</p>
          </div>
        </div>
      )}
    </div>
  );
}
