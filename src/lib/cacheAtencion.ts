import type { FilaAtencion } from "@/components/dashboard/GraficoAtencion";

/**
 * Última lectura de `get_atencion_ia_diaria`, guardada en el navegador.
 *
 * Es la consulta más lenta del inicio (2,3-2,5 s medidos contra Dropp, siempre, incluso
 * devolviendo cero filas) y de ella dependen dos tarjetas: "Conversaciones" y "Resueltas
 * sin operador". Mientras llega, el panel tiene dos opciones: dejar las dos tarjetas en
 * esqueleto —lo que hacía que el inicio entero pareciera a medias— o repetir el último
 * número conocido y decir que se está actualizando. La segunda.
 *
 * Lo guardado es el resultado ya normalizado (`FilaAtencion[]`), no la respuesta cruda:
 * así el formato de la RPC puede cambiar sin que la caché vieja rompa la pantalla.
 *
 * Todo va envuelto en try/catch a propósito: `localStorage` puede lanzar por cuota llena o
 * por estar bloqueado en modo privado, y una caché que no se puede escribir no puede
 * tumbar el panel.
 */
const VERSION = 1;
const PREFIJO = "artoria:atencion-ia";

export interface CacheAtencion {
  filas: FilaAtencion[];
  /** Del período anterior, para el "vs. período anterior" de las dos tarjetas. */
  prev: { totalAt: number | null; contAt: number | null } | null;
  /** epoch ms de cuándo se guardó. */
  ts: number;
}

const clave = (companyId: string, rango: string) => `${PREFIJO}:${VERSION}:${companyId}:${rango}`;

export function leerAtencionCache(companyId: string, rango: string): CacheAtencion | null {
  try {
    const crudo = localStorage.getItem(clave(companyId, rango));
    if (!crudo) return null;
    const dato = JSON.parse(crudo);
    if (dato?.v !== VERSION || !Array.isArray(dato?.filas)) return null;
    return {
      filas: dato.filas as FilaAtencion[],
      prev: dato.prev ?? null,
      ts: Number(dato.ts) || 0,
    };
  } catch {
    return null;
  }
}

export function guardarAtencionCache(
  companyId: string,
  rango: string,
  filas: FilaAtencion[],
  prev: { totalAt: number | null; contAt: number | null } | null,
): void {
  try {
    localStorage.setItem(clave(companyId, rango), JSON.stringify({
      v: VERSION, filas, prev: prev ?? null, ts: Date.now(),
    }));
  } catch {
    /* sin caché se sigue igual: sólo se pierde el arranque instantáneo */
  }
}
