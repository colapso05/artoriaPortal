import { supabase } from "@/integrations/supabase/client";

/**
 * Contenido de la WEB PÚBLICA de la empresa (el sitio del cliente, no el portal).
 *
 * Vive en tablas propias — `site_plans` y `site_settings` — separadas de
 * `company_plans`, que es la parrilla con la que cotiza el agente. Si estuvieran
 * juntas, cualquiera que tocara la web estaría moviendo precios que el bot usa para
 * vender. Acá, en cambio, lo que se edita es solo lo que se ve publicado.
 *
 * La web lee estas tablas de forma anónima; escribir solo puede un administrador de
 * la empresa (lo impone la RLS, no esta capa).
 */

export type CategoriaWeb = "internet" | "tv" | "duo";

export const CATEGORIAS_WEB: { id: CategoriaWeb; label: string }[] = [
  { id: "internet", label: "Internet" },
  { id: "tv", label: "TV" },
  { id: "duo", label: "Internet + TV" },
];

export interface PlanWeb {
  id: string;
  company_id: string;
  categoria: CategoriaWeb;
  nombre: string;
  velocidad_mbps: number | null;
  precio_oferta: number;
  precio_normal: number | null;
  caracteristicas: string[];
  etiqueta: string | null;
  canales: number | null;
  orden: number;
  activo: boolean;
}

export type PlanWebEditable = Omit<PlanWeb, "id" | "company_id">;

export const PLAN_WEB_VACIO: PlanWebEditable = {
  categoria: "internet",
  nombre: "",
  velocidad_mbps: null,
  precio_oferta: 0,
  precio_normal: null,
  caracteristicas: [],
  etiqueta: null,
  canales: null,
  orden: 99,
  activo: true,
};

/** Claves permitidas en `site_settings` (la base rechaza cualquier otra). */
export type ClaveAjuste =
  | "link_pago"
  | "link_sucursal"
  | "whatsapp"
  | "telefono"
  | "correo"
  | "meses_oferta"
  | "sitio_url";

export interface AjustesWeb {
  link_pago: string;
  link_sucursal: string;
  whatsapp: string;
  telefono: string;
  correo: string;
  meses_oferta: string;
  /** Dirección pública del sitio, para abrirlo y para la vista previa. */
  sitio_url: string;
}

export const AJUSTES_WEB_VACIOS: AjustesWeb = {
  link_pago: "",
  link_sucursal: "",
  whatsapp: "",
  telefono: "",
  correo: "",
  meses_oferta: "6",
  sitio_url: "",
};

/*
 * Direcciones conocidas, mientras `sitio_url` no esté cargado en la base.
 *
 * Es transitorio: la clave es nueva y hasta que el backend la permita y la
 * siembre, esto evita que el panel que hoy funciona se quede sin vista previa.
 * En cuanto cada empresa tenga su `sitio_url` guardado, este mapa sobra.
 */
const SITIOS_CONOCIDOS: Record<string, string> = {
  "01f8520b-5727-4e7c-937f-180c567609d9": "https://dropptelecom.cl",
};

/** La dirección del sitio: la guardada, o la conocida mientras no haya ninguna. */
export function urlDelSitio(companyId: string, ajustes: AjustesWeb): string {
  return (ajustes.sitio_url || "").trim() || SITIOS_CONOCIDOS[companyId] || "";
}

/** Todos los planes del sitio, incluidos los desactivados (para poder reactivarlos). */
export async function listarPlanesWeb(companyId: string): Promise<PlanWeb[]> {
  const { data, error } = await (supabase as any)
    .from("site_plans")
    .select("*")
    .eq("company_id", companyId)
    .order("categoria")
    .order("orden");
  if (error) throw new Error(error.message);
  return (data ?? []) as PlanWeb[];
}

export async function guardarPlanWeb(
  companyId: string,
  plan: PlanWebEditable,
  id?: string,
): Promise<void> {
  const fila = { ...plan, company_id: companyId, updated_at: new Date().toISOString() };
  const { error } = id
    ? await (supabase as any).from("site_plans").update(fila).eq("id", id)
    : await (supabase as any).from("site_plans").insert(fila);
  if (error) throw new Error(error.message);
}

/**
 * Los planes del sitio sí se borran: son contenido de marketing, no precios que el
 * agente haya usado en una venta. Igual el panel pide confirmación, porque no hay
 * forma de deshacerlo.
 */
export async function borrarPlanWeb(id: string): Promise<void> {
  const { error } = await (supabase as any).from("site_plans").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Intercambia el orden de dos planes (subir/bajar en la lista). */
export async function intercambiarOrdenWeb(a: PlanWeb, b: PlanWeb): Promise<void> {
  const ordenA = a.orden;
  const ordenB = b.orden;
  const primero = await (supabase as any).from("site_plans").update({ orden: -1 }).eq("id", a.id);
  if (primero.error) throw new Error(primero.error.message);
  const segundo = await (supabase as any).from("site_plans").update({ orden: ordenA }).eq("id", b.id);
  if (segundo.error) throw new Error(segundo.error.message);
  const tercero = await (supabase as any).from("site_plans").update({ orden: ordenB }).eq("id", a.id);
  if (tercero.error) throw new Error(tercero.error.message);
}

export async function leerAjustesWeb(companyId: string): Promise<AjustesWeb> {
  const { data, error } = await (supabase as any)
    .from("site_settings")
    .select("key, value")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  const ajustes: AjustesWeb = { ...AJUSTES_WEB_VACIOS };
  for (const fila of (data ?? []) as { key: ClaveAjuste; value: string }[]) {
    if (fila.key in ajustes) ajustes[fila.key] = fila.value;
  }
  return ajustes;
}

/**
 * Guarda la dirección del sitio, aparte del resto de los ajustes.
 *
 * `site_settings` valida las claves permitidas en la base. `sitio_url` es nueva,
 * así que mientras el backend no la agregue, mandarla junto a las demás haría
 * fallar el guardado entero y el operador perdería también los cambios de
 * teléfono o de correo que hizo en la misma pasada. Separada, si la rechazan se
 * pierde solo esto y se puede avisar de qué se trata.
 */
export async function guardarUrlSitio(companyId: string, url: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("site_settings")
    .upsert(
      [{ company_id: companyId, key: "sitio_url", value: url.trim(), updated_at: new Date().toISOString() }],
      { onConflict: "company_id,key" },
    );
  if (error) throw new Error(error.message);
}

export async function guardarAjustesWeb(
  companyId: string,
  ajustes: Partial<Record<ClaveAjuste, string>>,
): Promise<void> {
  const filas = Object.entries(ajustes)
    .filter(([, valor]) => valor !== undefined)
    .map(([key, value]) => ({
      company_id: companyId,
      key,
      value: String(value).trim(),
      updated_at: new Date().toISOString(),
    }));
  if (filas.length === 0) return;
  const { error } = await (supabase as any)
    .from("site_settings")
    .upsert(filas, { onConflict: "company_id,key" });
  if (error) throw new Error(error.message);
}
