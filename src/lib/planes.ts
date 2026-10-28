import { supabase } from "@/integrations/supabase/client";

export type CategoriaPlan = "internet" | "tv" | "duo";

export const CATEGORIAS: { id: CategoriaPlan; label: string }[] = [
  { id: "internet", label: "Internet" },
  { id: "tv", label: "TV" },
  { id: "duo", label: "Dúo" },
];

export interface Plan {
  id: string;
  company_id: string;
  categoria: CategoriaPlan;
  nombre: string;
  velocidad_mbps: number | null;
  precio_normal: number;
  precio_oferta: number | null;
  meses_oferta: number | null;
  /** null = parrilla general. Un valor = oferta especial de esa zona. */
  zona: string | null;
  activo: boolean;
}

/** Lo que se puede editar. El resto lo pone la base. */
export type PlanEditable = Omit<Plan, "id" | "company_id">;

export const PLAN_VACIO: PlanEditable = {
  categoria: "internet",
  nombre: "",
  velocidad_mbps: null,
  precio_normal: 0,
  precio_oferta: null,
  meses_oferta: null,
  zona: null,
  activo: true,
};

/**
 * Parrilla completa de la empresa, para administrarla.
 *
 * Va contra la tabla y no contra `empresa_planes` a propósito: esa RPC es para el
 * agente —resuelve la zona y devuelve solo lo vigente— y no trae ni el `id` ni los
 * planes desactivados, que es justo lo que hace falta para editarlos. La RLS filtra
 * igual: nadie ve la parrilla de otra empresa.
 */
export async function listarPlanes(companyId: string): Promise<Plan[]> {
  const { data, error } = await (supabase as any)
    .from("company_plans")
    .select("*")
    .eq("company_id", companyId)
    .order("categoria")
    .order("precio_normal");
  if (error) throw new Error(error.message);
  return (data ?? []) as Plan[];
}

export async function guardarPlan(
  companyId: string,
  plan: PlanEditable,
  id?: string,
): Promise<void> {
  const fila = { ...plan, company_id: companyId };
  const { error } = id
    ? await (supabase as any).from("company_plans").update(fila).eq("id", id)
    : await (supabase as any).from("company_plans").insert(fila);
  if (error) throw new Error(error.message);
}

/**
 * Un plan no se borra: se desactiva.
 *
 * Las ventas guardan el precio copiado, así que borrar la fila no rompe el
 * histórico — pero sí deja sin nombre a lo que se vendió, y no hay forma de
 * deshacerlo desde la pantalla.
 */
export async function desactivarPlan(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("company_plans").update({ activo: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

export interface FilaVenta {
  dia: string;
  /** Ventas cerradas: tickets con el precio del plan congelado. */
  ventas: number;
  monto_mensual: number;
  con_oferta: number;
  /**
   * Tickets de venta sin plan definido — "no aplica", vacío, "por definir".
   * Son consultas que no cerraron. Antes se contaban como ventas e inflaban el
   * número un 38%.
   */
  consultas_sin_plan?: number;
}

/**
 * Ventas valorizadas por día.
 *
 * El monto sale de `tickets.plan_precio`, congelado en el momento del cierre. No se
 * calcula cruzando contra la parrilla actual: si mañana suben un plan, la venta de
 * ayer tiene que seguir valiendo lo que valía.
 */
export async function ventasResumen(
  companyId: string, desde: string, hasta: string,
): Promise<FilaVenta[]> {
  const { data, error } = await (supabase as any).rpc("ventas_resumen", {
    p_company_id: companyId, p_desde: desde, p_hasta: hasta,
  });
  if (error) return [];
  return (Array.isArray(data) ? data : []) as FilaVenta[];
}

export const clp = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n || 0);
