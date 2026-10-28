import { supabase } from "@/integrations/supabase/client";
import { claveMes, ultimosMeses, type Mes } from "@/lib/meses";
import { tarifaUsd } from "@/lib/metaMensajeria";

/**
 * Plantillas enviadas mes a mes, por categoría y por nombre, con su costo.
 *
 * Sale de la vista `v_plantillas_mensajes`, que tiene una fila por cada plantilla
 * enviada. Se agrupa acá porque la función `plantillas_mensajeria` cuenta "los
 * últimos N días" y no meses calendario, que es como Meta cuenta y como se piensa
 * el gasto.
 *
 * El costo viene de dos fuentes, y la primera manda:
 *   1. REAL: las columnas `costo` y `moneda` de la vista, que salen del estado de
 *      entrega de cada mensaje (lo que Meta efectivamente cobró).
 *   2. ESTIMADO: mientras la vista no traiga esas columnas, cantidad por la tarifa
 *      oficial de Meta para Chile. Es un máximo: no sabe qué mensajes salieron
 *      dentro de la ventana de 24 h y no se cobran, ni si la tarifa cambió entre
 *      un mes y otro.
 *
 * `costoReal` le dice a la pantalla cuál de las dos está mostrando, para que lo
 * rotule: una estimación presentada como cifra real es peor que no mostrar nada.
 */

export interface PlantillaMes { nombre: string; cantidad: number; costoUsd: number; conMonto: number }
export interface CategoriaMes { categoria: string; cantidad: number; costoUsd: number; conMonto: number; plantillas: PlantillaMes[] }
export interface ResumenMes { mes: Mes; total: number; costoUsd: number; conMonto: number; categorias: CategoriaMes[] }

const POR_PAGINA = 1000;
/** Tope de páginas: protege el navegador si alguna empresa tuviera un volumen enorme. */
const MAX_PAGINAS = 30;

export type ResultadoHistorial =
  | { ok: true; meses: ResumenMes[]; truncado: boolean; costoReal: boolean }
  | { ok: false; detalle: string };

/** null = todavía no se probó. Evita reintentar una consulta que ya se sabe que falla. */
let vistaConCosto: boolean | null = null;

const faltaColumna = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || /column .* does not exist|could not find .* column/i.test(e.message ?? ""));

interface Acum { cantidad: number; costoUsd: number; conMonto: number }
const vacio = (): Acum => ({ cantidad: 0, costoUsd: 0, conMonto: 0 });

export async function historialPlantillas(companyId: string, cantidadMeses = 6): Promise<ResultadoHistorial> {
  const meses = ultimosMeses(cantidadMeses);
  // Un día de colchón: el mes más antiguo empieza en hora de Chile, no en UTC.
  const desde = new Date(`${meses[meses.length - 1].desde}T00:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - 1);

  const filas: any[] = [];
  let costoReal = vistaConCosto !== false;
  let truncado = false;

  for (let pagina = 0; ; pagina++) {
    if (pagina >= MAX_PAGINAS) { truncado = true; break; }
    const consultar = (columnas: string) =>
      (supabase as any)
        .from("v_plantillas_mensajes")
        .select(columnas)
        .eq("company_id", companyId)
        .gte("created_at", desde.toISOString())
        .order("created_at", { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);

    let r = await consultar(costoReal ? "created_at, categoria, plantilla, costo, moneda" : "created_at, categoria, plantilla");
    if (r.error && costoReal && faltaColumna(r.error)) {
      // La vista todavía no trae el costo: se sigue sin él y se recuerda.
      vistaConCosto = false; costoReal = false;
      r = await consultar("created_at, categoria, plantilla");
    }
    if (r.error) return { ok: false, detalle: r.error.message };
    if (costoReal) vistaConCosto = true;

    filas.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < POR_PAGINA) break;
  }

  // mes -> categoría -> plantilla -> acumulado
  const porMes = new Map<string, Map<string, Map<string, Acum>>>();
  meses.forEach(m => porMes.set(m.clave, new Map()));

  for (const fila of filas) {
    const mes = porMes.get(claveMes(new Date(fila.created_at)));
    if (!mes) continue; // el día de colchón, de un mes que no se muestra
    const categoria = String(fila.categoria ?? "").trim() || "sin categoría";
    const nombre = String(fila.plantilla ?? "").trim() || "(sin nombre)";
    const plantillas = mes.get(categoria) ?? new Map<string, Acum>();
    const acum = plantillas.get(nombre) ?? vacio();
    acum.cantidad += 1;

    if (costoReal) {
      const monto = Number(fila.costo);
      const moneda = String(fila.moneda ?? "USD").toUpperCase();
      // Solo se suman dólares: sumar monedas distintas daría un número sin sentido.
      if (fila.costo != null && Number.isFinite(monto) && moneda === "USD") { acum.costoUsd += monto; acum.conMonto += 1; }
    } else {
      const tarifa = tarifaUsd(categoria);
      if (tarifa != null) { acum.costoUsd += tarifa; acum.conMonto += 1; }
    }
    plantillas.set(nombre, acum);
    mes.set(categoria, plantillas);
  }

  const ordenar = <T extends { cantidad: number }>(xs: T[]) => xs.sort((a, b) => b.cantidad - a.cantidad);
  const suma = (xs: Acum[]): Acum => xs.reduce((a, x) => ({
    cantidad: a.cantidad + x.cantidad, costoUsd: a.costoUsd + x.costoUsd, conMonto: a.conMonto + x.conMonto,
  }), vacio());

  const resumen: ResumenMes[] = meses.map(mes => {
    const categorias = ordenar(
      [...(porMes.get(mes.clave) ?? new Map<string, Map<string, Acum>>()).entries()].map(([categoria, plantillas]) => {
        const lista = ordenar([...plantillas.entries()].map(([nombre, a]) => ({ nombre, ...a })));
        return { categoria, ...suma(lista), plantillas: lista };
      }),
    );
    const t = suma(categorias);
    return { mes, total: t.cantidad, costoUsd: t.costoUsd, conMonto: t.conMonto, categorias };
  });

  return { ok: true, meses: resumen, truncado, costoReal };
}
