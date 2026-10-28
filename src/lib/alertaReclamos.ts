import { supabase } from "@/integrations/supabase/client";
import { isoChile } from "@/lib/meses";

/**
 * El sistema de alertas por reclamos de la empresa.
 *
 * Cuando varios clientes reclaman seguido por lo mismo, el sistema lo trata como una
 * falla general y avisa. "Seguido" se mide con una ventana de tiempo (hoy, diez
 * minutos) y un número de reclamos que la dispara. Esto trae tres cosas para mostrar:
 *
 *   · si la alerta está activa            → `company_config.alert_active`
 *   · el contador de reclamos en la ventana → función `alerta_reclamos_estado`
 *   · cuántos clientes se avisaron hoy     → función `get_alert_system_stats`
 *
 * Y la configuración (ventana y umbral) vive en dos columnas de `company_config`:
 * `alert_ventana_min` y `alert_umbral`.
 *
 * Todo lo que todavía no exista en la base se trata como "no disponible" y NO como
 * cero: un contador en 0 le diría a la empresa que nadie está reclamando, cuando lo
 * que pasa es que el dato no llega.
 */

export interface ContadorReclamos {
  /** Reclamos seguidos que lleva la ventana ahora. */
  reclamos: number;
  /** Cuántos hacen falta para disparar la alerta. */
  umbral: number | null;
  /** Largo de la ventana, en minutos. */
  ventanaMin: number | null;
  /** Cuándo vence la ventana y el contador vuelve a cero, si nadie reclama más. */
  venceAt: string | null;
  ultimoReclamoAt: string | null;
}

export interface ConfigAlerta {
  ventanaMin: number;
  umbral: number;
}

const faltaAlgo = (e: { code?: string; message?: string; status?: number } | null) =>
  !!e && (e.code === "PGRST202" || e.code === "42703" || e.status === 404
    || /could not find|does not exist/i.test(e.message ?? ""));

const primero = (fila: any, claves: string[]) => {
  for (const c of claves) if (fila && fila[c] !== undefined && fila[c] !== null) return fila[c];
  return undefined;
};
const aNumero = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Si la alerta global de la empresa está activa ahora. null = no se pudo leer. */
export async function alertaActiva(companyId: string): Promise<boolean | null> {
  const { data, error } = await (supabase as any)
    .from("company_config").select("alert_active").eq("id", companyId).maybeSingle();
  return error || !data ? null : !!data.alert_active;
}

/**
 * El contador de reclamos. `undefined` = la función todavía no existe;
 * `null` = existe pero falló o no devolvió nada utilizable.
 */
export async function contadorReclamos(companyId: string): Promise<ContadorReclamos | null | undefined> {
  const { data, error } = await (supabase as any).rpc("alerta_reclamos_estado", { p_company_id: companyId });
  if (error) return faltaAlgo(error) ? undefined : null;
  const fila = Array.isArray(data) ? data[0] : data;
  const reclamos = aNumero(primero(fila, ["reclamos", "contador", "count", "total"]));
  if (reclamos === null) return null;
  return {
    reclamos,
    umbral: aNumero(primero(fila, ["umbral", "threshold", "limite"])),
    ventanaMin: aNumero(primero(fila, ["ventana_min", "ventana_minutos", "window_minutes", "window_min"])),
    venceAt: primero(fila, ["ventana_vence_at", "vence_at", "expires_at"]) ?? null,
    ultimoReclamoAt: primero(fila, ["ultimo_reclamo_at", "last_claim_at", "last_at"]) ?? null,
  };
}

/** Clientes avisados hoy y respuestas manuales que se evitaron. null = no disponible. */
export async function alertadosHoy(companyId: string): Promise<{ clientes: number; respuestasEvitadas: number } | null> {
  const hoy = isoChile();
  const { data, error } = await (supabase as any).rpc("get_alert_system_stats", {
    p_company_id: companyId, p_date_from: hoy, p_date_to: hoy,
  });
  if (error) return null;
  const fila = Array.isArray(data) ? data[0] : data;
  const clientes = aNumero(fila?.total_clientes_alertados);
  if (clientes === null) return null;
  return { clientes, respuestasEvitadas: aNumero(fila?.respuestas_manuales_evitadas) ?? 0 };
}

/** La ventana y el umbral configurados. `undefined` = las columnas todavía no existen. */
export async function leerConfigAlerta(companyId: string): Promise<ConfigAlerta | null | undefined> {
  const { data, error } = await (supabase as any)
    .from("company_config").select("alert_ventana_min, alert_umbral").eq("id", companyId).maybeSingle();
  if (error) return faltaAlgo(error) ? undefined : null;
  const ventanaMin = aNumero(data?.alert_ventana_min);
  const umbral = aNumero(data?.alert_umbral);
  return ventanaMin !== null && umbral !== null ? { ventanaMin, umbral } : null;
}

export const LIMITES_ALERTA = { ventanaMin: { min: 1, max: 120 }, umbral: { min: 2, max: 50 } };

/** Un texto de error si algo no vale, null si está bien. */
export function validarConfigAlerta(c: { ventanaMin: number; umbral: number }): string | null {
  const { ventanaMin: v, umbral: u } = LIMITES_ALERTA;
  if (!Number.isInteger(c.ventanaMin) || c.ventanaMin < v.min || c.ventanaMin > v.max)
    return `La ventana tiene que ser un número entero de minutos, entre ${v.min} y ${v.max}.`;
  if (!Number.isInteger(c.umbral) || c.umbral < u.min || c.umbral > u.max)
    return `Los reclamos para disparar la alerta tienen que ser un número entero, entre ${u.min} y ${u.max}.`;
  return null;
}

export async function guardarConfigAlerta(companyId: string, c: ConfigAlerta): Promise<void> {
  const invalido = validarConfigAlerta(c);
  if (invalido) throw new Error(invalido);
  // Filtrado por empresa además del id: es la misma fila, pero deja explícito de quién es.
  // Pidiendo la fila de vuelta: una política de permisos que bloquea la escritura no da
  // error, solo actualiza cero filas, y sin esta comprobación se diría "guardado" sin estarlo.
  const { data, error } = await (supabase as any)
    .from("company_config")
    .update({ alert_ventana_min: c.ventanaMin, alert_umbral: c.umbral })
    .eq("id", companyId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("No tienes permiso para cambiar esta configuración.");
}
