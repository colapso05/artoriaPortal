import { supabase } from "@/integrations/supabase/client";

/**
 * Consumo de los modelos de IA.
 *
 * Tres de las cuatro consultas son solo para el administrador de la plataforma, y
 * el rechazo lo hace la función en Postgres, no esta capa: si un administrador de
 * empresa las llama, la RPC levanta excepción. Esconder el costo en la pantalla no
 * alcanzaría — se vería igual en la pestaña de red del navegador.
 *
 * `get_uso_plan` es la única que puede llamar una empresa, y por eso no devuelve
 * ningún campo de dinero. El costo de los modelos es información nuestra.
 */

/**
 * Tipo de cambio para mostrar el gasto en la moneda en que se factura aca.
 *
 * Sale de `get_tipo_cambio()`, no de una constante: el dolar se mueve todos los
 * dias y una tasa clavada en el codigo envejece sin que nadie se entere.
 *
 * El respaldo existe solo para no dejar la tarjeta sin pesos si la RPC falla, y
 * cuando se usa la pantalla lo dice. Una tasa vieja mostrada como si fuera la del
 * dia es peor que no mostrar pesos.
 */
export const TASA_RESPALDO = 938;

export interface TipoCambio {
  clpPorUsd: number;
  /** Fecha del dato, no de la carga: es contra esta que se mide la antiguedad. */
  fecha: string | null;
  diasAntiguedad: number | null;
  /** De donde salio la tasa. Se muestra: una tasa sin procedencia no se audita. */
  origen: string | null;
  /** true = no se pudo leer la RPC y se esta usando `TASA_RESPALDO`. */
  esRespaldo: boolean;
}

const RESPALDO: TipoCambio = {
  clpPorUsd: TASA_RESPALDO, fecha: null, diasAntiguedad: null, origen: null, esRespaldo: true,
};

/**
 * `get_tipo_cambio(p_moneda, p_al)` — los dos parametros tienen default.
 *
 * La moneda se pasa explicita igual: el dia que se agregue otra, una llamada sin
 * argumentos empieza a devolver algo distinto sin que nadie toque esta linea.
 */
export async function tipoCambio(moneda = "USD"): Promise<TipoCambio> {
  const { data, error } = await (supabase as any).rpc("get_tipo_cambio", { p_moneda: moneda });
  if (error) {
    console.error("[consumo-ia] get_tipo_cambio:", error.message);
    return RESPALDO;
  }
  const fila = Array.isArray(data) ? data[0] : data;
  const tasa = Number(fila?.clp_por_unidad);
  if (!Number.isFinite(tasa) || tasa <= 0) return RESPALDO;

  const dias = Number(fila?.dias_de_antiguedad);
  return {
    clpPorUsd: tasa,
    fecha: typeof fila?.dia === "string" ? fila.dia : null,
    diasAntiguedad: Number.isFinite(dias) ? dias : null,
    origen: typeof fila?.origen === "string" ? fila.origen : null,
    esRespaldo: false,
  };
}

export type Granularidad = "dia" | "semana" | "mes";

/** Cada fila trae la misma `primer_dia_con_datos`; sirve para no dibujar un eje vacío. */
interface ConDatosDesde {
  primer_dia_con_datos: string | null;
}

export interface PuntoConsumo extends ConDatosDesde {
  periodo: string;
  tokens_in: number;
  tokens_out: number;
  llamadas: number;
  /**
   * El costo viene partido a propósito.
   *
   * Los nodos de n8n sin modelo fijado corren con el default, así que su costo se
   * calcula con una tarifa supuesta. Sumarlo al confirmado y marcar el total con un
   * asterisco haría que el asterisco se ignore y el número se cite como exacto.
   * Separados se nota: en Dropp este mes, el 85% del gasto es estimado.
   */
  costo_confirmado_usd: number;
  costo_estimado_usd: number;
}

export interface PuntoConsumoGlobal extends PuntoConsumo {
  company_id: string;
  company_name: string;
  proveedor: string;
  modelo: string;
  sistema: string;
}

export interface FilaModelo extends ConDatosDesde {
  proveedor: string;
  modelo: string;
  sistema: string;
  llamadas: number;
  tokens_in: number;
  tokens_out: number;
  costo_usd: number;
  /** El modelo no estaba fijado en el nodo: el costo sale de una tarifa supuesta. */
  es_estimado: boolean;
  tarifa_in_usd: number;
  tarifa_out_usd: number;
}

export interface UsoPlan {
  mensajes_ia_usados: number;
  /** Puede ser null: hoy ninguna empresa tiene tope fijado y eso no es un error. */
  tope: number | null;
  ciclo_inicio: string;
  ciclo_fin: string;
}

/**
 * Las RPC de costo levantan excepción para quien no es admin de plataforma.
 *
 * Eso es correcto y es lo que queríamos, pero significa que un error acá puede ser
 * "no tenés permiso" y no "algo se rompió". Se devuelve vacío y se deja el mensaje
 * en consola en vez de romper la pantalla.
 */
async function llamar<T>(nombre: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await (supabase as any).rpc(nombre, args);
  if (error) {
    console.error(`[consumo-ia] ${nombre}:`, error.message);
    return [];
  }
  return Array.isArray(data) ? (data as T[]) : [];
}

export const consumoIA = (companyId: string, desde: string, hasta: string, granularidad: Granularidad) =>
  llamar<PuntoConsumo>("get_consumo_ia", {
    p_company_id: companyId, p_desde: desde, p_hasta: hasta, p_granularidad: granularidad,
  });

export const consumoIAGlobal = (desde: string, hasta: string, granularidad: Granularidad) =>
  llamar<PuntoConsumoGlobal>("get_consumo_ia_global", {
    p_desde: desde, p_hasta: hasta, p_granularidad: granularidad,
  });

export const detalleModelos = (companyId: string, desde: string, hasta: string) =>
  llamar<FilaModelo>("get_detalle_modelos", {
    p_company_id: companyId, p_desde: desde, p_hasta: hasta,
  });

export interface PuntoUsoDiario {
  dia: string;
  mensajes_ia: number;
}

/**
 * El mismo conteo que `get_uso_plan.mensajes_ia_usados`, pero dia por dia.
 *
 * La RPC recibe una cantidad de dias, no un rango, y devuelve solo `dia` y
 * `mensajes_ia`: no hay `primer_dia_con_datos`. Si el registro arranco hace poco,
 * eso se nota en que la serie trae menos dias de los pedidos, y la tarjeta lo dice
 * como lo que es —donde arranca el grafico— y no como una afirmacion sobre la base.
 */
export async function usoPlanDiario(companyId: string, dias: number): Promise<PuntoUsoDiario[]> {
  const filas = await llamar<PuntoUsoDiario>("get_uso_plan_diario", {
    p_company_id: companyId, p_dias: dias,
  });
  // Por si la RPC no garantiza el orden: el grafico se lee de izquierda a derecha.
  return [...filas].sort((a, b) => String(a.dia).localeCompare(String(b.dia)));
}

export interface UsoPlanEmpresa extends UsoPlan {
  company_id: string;
  company_name: string;
}

/**
 * El uso del plan de todas las empresas de un mes, en una sola llamada.
 *
 * Reemplaza pedir empresa por empresa: con dos daba lo mismo, con veinte eran
 * veinte consultas para dibujar una columna.
 */
export const usoPlanGlobal = (mes: string) =>
  llamar<UsoPlanEmpresa>("get_uso_plan_global", { p_mes: mes });

export async function usoPlan(companyId: string, mes: string): Promise<UsoPlan | null> {
  const filas = await llamar<UsoPlan>("get_uso_plan", { p_company_id: companyId, p_mes: mes });
  return filas[0] ?? null;
}
