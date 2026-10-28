/**
 * Fondo del mapa del portal — un solo lugar para los dos componentes que dibujan
 * zonas (CoverageMap y AlertZonesMap).
 *
 * Por qué OpenStreetMap: es el único de los tres proveedores que probamos que
 * dibuja las viviendas. CARTO (con el que empezamos) empezó a estampar
 * "API KEY REQUIRED" sobre cada tile —responde 200 con una imagen con marca de
 * agua encima, así que ninguna comprobación de red ni de texto lo detecta— y
 * además no dibuja edificaciones. Esri Gray Canvas tampoco: solo calles. En una
 * zona residencial eso se lee como "peladero", que fue exactamente el reclamo
 * del cliente de Optve.
 *
 * La política de uso de OSM (operations.osmfoundation.org/policies/tiles) exige
 * cosas concretas, y aquí se cumplen así:
 *
 *  - URL exacta `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, sin subdominios.
 *  - Atribución visible "© OpenStreetMap contributors" (la dibuja Leaflet en la
 *    esquina del mapa; no hay que taparla).
 *  - Referer válido: el `.htaccess` manda `strict-origin-when-cross-origin`, así
 *    que OSM recibe `https://artoria.cl/` en cada petición.
 *  - Nada de `no-cache`: Leaflet no lo manda y el navegador cachea el tile según
 *    las cabeceras que devuelve OSM (más de 7 días).
 *  - No se descargan tiles en bloque ni se precargan: solo los que el usuario ve.
 *  - La URL no queda incrustada en el bundle. Quien despliegue puede cambiar de
 *    proveedor —a uno con SLA, o a tiles servidos desde el propio VPS— definiendo
 *    `window.ARTORIA_MAP_TILES` antes de cargar el bundle, sin recompilar.
 *
 * Si algún día el volumen crece, el paso siguiente según la propia política es un
 * servicio derivado de OSM con SLA o tiles propios: basta con tocar este archivo.
 */

export interface AjustesMapa {
  /** Plantilla de URL para el tema claro. */
  claro: string;
  /** Plantilla de URL para el tema oscuro. */
  oscuro: string;
  /** Atribución que Leaflet muestra en la esquina del mapa. */
  atribucion: string;
  /** Último zoom con tiles de verdad; más arriba Leaflet escala el del límite. */
  zoomNativoMax: number;
}

const URL_OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const ATRIBUCION_OSM =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const POR_DEFECTO: AjustesMapa = {
  claro: URL_OSM,
  oscuro: URL_OSM,
  atribucion: ATRIBUCION_OSM,
  zoomNativoMax: 19,
};

declare global {
  interface Window {
    ARTORIA_MAP_TILES?: Partial<AjustesMapa>;
  }
}

const PERSONALIZADOS = typeof window !== "undefined" ? window.ARTORIA_MAP_TILES : undefined;

export const AJUSTES_MAPA: AjustesMapa = { ...POR_DEFECTO, ...PERSONALIZADOS };

export const ATRIBUCION_MAPA = AJUSTES_MAPA.atribucion;
export const ZOOM_NATIVO_MAX = AJUSTES_MAPA.zoomNativoMax;

export const tilesSegunTema = (oscuro: boolean) => (oscuro ? AJUSTES_MAPA.oscuro : AJUSTES_MAPA.claro);

/**
 * OSM no publica versión oscura, así que el modo oscuro se logra invirtiendo el
 * panel de tiles. El filtro va SOLO sobre `tilePane`: los polígonos de cobertura,
 * los marcadores y los controles viven en otros paneles y conservan su color.
 *
 * Si algún día se define un proveedor con mapa oscuro propio, la inversión se
 * apaga sola (la comparación de abajo) para no oscurecerlo dos veces.
 */
const INVERTIR_SI_EL_TEMA_ES_OSCURO = AJUSTES_MAPA.oscuro === AJUSTES_MAPA.claro;

export const FILTRO_TILES_OSCURO = "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.92)";

export function aplicarTemaAlMapa(mapa: any, oscuro: boolean) {
  const panel = mapa?.getPane?.("tilePane");
  if (!panel) return;
  panel.style.filter = oscuro && INVERTIR_SI_EL_TEMA_ES_OSCURO ? FILTRO_TILES_OSCURO : "none";
}
