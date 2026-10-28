import { supabase } from "@/integrations/supabase/client";

/**
 * Propiedad de una conversación ("caso tomado").
 *
 * Todo pasa por RPC a propósito. `conversations.taken_by` / `taken_at` NO se
 * escriben con UPDATE desde el cliente: dos operadores pulsando casi a la vez se
 * pisaban en silencio y los dos creían tener el caso. Las RPC resuelven la
 * carrera dentro de la base y además dejan registro en `casos_historial`.
 */

export interface CasoOk {
  ok: true;
  tomado_por?: string;
  tomado_en?: string;
  ya_era_mio?: boolean;
}

export interface CasoFallo {
  ok: false;
  /** 'ya_tomado' | 'sin_permiso' | 'destino_invalido' | 'red' */
  error: string;
  dueno_nombre?: string;
  mensaje?: string;
}

export type CasoResultado = CasoOk | CasoFallo;

/** Convierte un fallo de transporte en la misma forma que devuelven las RPC. */
const falloDeRed = (mensaje: string): CasoFallo => ({
  ok: false,
  error: "red",
  mensaje: `No se pudo contactar al servidor: ${mensaje}`,
});

async function llamar(nombre: string, params: Record<string, unknown>): Promise<CasoResultado> {
  const { data, error } = await (supabase as any).rpc(nombre, params);
  if (error) return falloDeRed(error.message);
  // La RPC siempre responde un objeto con `ok`. Si llega otra cosa es un cambio
  // de contrato y conviene que se note, no que se interprete como éxito.
  if (!data || typeof data !== "object" || !("ok" in data)) {
    return falloDeRed("respuesta inesperada del servidor");
  }
  return data as CasoResultado;
}

/**
 * Toma el caso. Con `forzar` se lo quita a quien lo tenga — el dueño anterior
 * recibe una notificación automática, así que nunca lo pierde en silencio.
 */
export const casoTomar = (conversationId: string, forzar = false) =>
  llamar("caso_tomar", { p_conversation_id: conversationId, ...(forzar ? { p_forzar: true } : {}) });

export const casoLiberar = (conversationId: string) =>
  llamar("caso_liberar", { p_conversation_id: conversationId });

export const casoTransferir = (conversationId: string, aUsuario: string, nota?: string) =>
  llamar("caso_transferir", {
    p_conversation_id: conversationId,
    p_a_usuario: aUsuario,
    ...(nota?.trim() ? { p_nota: nota.trim() } : {}),
  });

export interface CasoMio {
  conversation_id: string;
  wa_id: string;
  nombre: string | null;
  tomado_en: string;
  ultimo_mensaje: string | null;
  sin_leer: number;
  estado: string | null;
}

export async function casoMisCasos(): Promise<CasoMio[]> {
  const { data, error } = await (supabase as any).rpc("caso_mis_casos");
  if (error || !Array.isArray(data)) return [];
  return data as CasoMio[];
}

/**
 * Horas tras las cuales un caso tomado sin actividad se considera abandonado.
 * Sirve para que nadie tenga que preguntar por WhatsApp si puede agarrarlo.
 */
export const HORAS_ABANDONO = 4;

export function casoAbandonado(tomadoEn?: string | null, ultimoMensaje?: string | null): boolean {
  if (!tomadoEn) return false;
  const limite = Date.now() - HORAS_ABANDONO * 60 * 60 * 1000;
  const t = new Date(tomadoEn).getTime();
  if (isNaN(t) || t > limite) return false;
  if (!ultimoMensaje) return true;
  const m = new Date(ultimoMensaje).getTime();
  return isNaN(m) || m < limite;
}
