import { supabase } from "@/integrations/supabase/client";

/**
 * Crecimiento de volumen y margen de error del agente.
 *
 * Las dos RPC llevan guard por empresa en Postgres: si quien llama no pertenece a
 * la empresa, la función levanta excepción en vez de devolver vacío. Eso es lo
 * correcto —el filtro no puede vivir en la pantalla— pero significa que un error
 * acá puede ser "no tenés permiso" y no "algo se rompió", así que se devuelve
 * vacío y el mensaje queda en consola sin tumbar el panel.
 */

export type Grano = "dia" | "semana" | "mes";

export interface PuntoVolumen {
  periodo: string;
  /** Clientes que escribieron por primera vez. Esto es crecimiento. */
  nuevas: number;
  /** Conversaciones con movimiento en el período. Esto es carga, y es otra cosa. */
  activas: number;
  mensajes: number;
  nuevas_anterior: number;
  nuevas_variacion: number;
  /** null cuando el período anterior fue 0: no se puede dividir por cero. */
  nuevas_variacion_pct: number | null;
}

export interface PuntoMargenError {
  periodo: string;
  /** El cliente y el agente hablaron. Es el denominador del margen de error. */
  dialogos_con_agente: number;
  /**
   * El bot escribió y el cliente no contestó: confirmaciones de pago y avisos.
   *
   * No son conversaciones y no entran al analizador. Se muestran igual porque sin
   * ellos no se entiende por qué el margen de error se calcula sobre una parte de
   * todo lo que el agente tocó.
   */
  avisos_de_una_via: number;
  conversaciones_analizadas: number;
  cobertura_pct: number;
  sesiones_analizadas: number;
  sesiones_con_problema: number;
  /** Sobre lo analizado, no sobre todo. Va siempre junto a `cobertura_pct`. */
  margen_error_pct: number | null;
  nota_promedio: number | null;
}

async function llamar<T>(nombre: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await (supabase as any).rpc(nombre, args);
  if (error) {
    console.error(`[calidad-agente] ${nombre}:`, error.message);
    return [];
  }
  return Array.isArray(data) ? (data as T[]) : [];
}

export const volumenConversaciones = (companyId: string, grano: Grano, periodos: number) =>
  llamar<PuntoVolumen>("get_volumen_conversaciones", {
    p_company_id: companyId, p_grano: grano, p_periodos: periodos,
  });

export const margenErrorAgente = (companyId: string, grano: Grano, periodos: number) =>
  llamar<PuntoMargenError>("get_margen_error_agente", {
    p_company_id: companyId, p_grano: grano, p_periodos: periodos,
  });
