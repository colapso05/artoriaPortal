import { supabase } from "@/integrations/supabase/client";

/**
 * De los clientes que "pidieron hablar con una persona", los que tienen un ticket
 * abierto.
 *
 * La lista de derivadas sin respuesta sale del análisis de las conversaciones: dice
 * que el agente derivó y que nadie del equipo contestó después. No sabe nada de
 * tickets. Pero un cliente que nunca llegó a tener ticket no está "esperando a una
 * persona" en ningún sistema que alguien vaya a mirar: nadie lo tiene asignado, no
 * aparece en el Centro de Tickets y su espera —que puede ser de semanas— no le
 * pertenece a nadie.
 *
 * Así que acá solo cuentan los que tienen un ticket que todavía no llegó a un estado
 * de cierre. Con eso la lista coincide con lo que el equipo ve en sus tableros.
 */

export interface FilaEspera {
  conversation_id: string;
  wa_id: string | null;
  profile_name: string | null;
  derivacion_at: string;
  horas_esperando: number;
  topic: string | null;
  summary: string | null;
}

export interface FilaEsperaConTicket extends FilaEspera {
  ticket_id: string;
  /** El nombre del estado como lo escribió la empresa ("Abierto", "En proceso"…). */
  ticket_estado: string;
}

/** Un `in (...)` con demasiados ids revienta el largo de la URL. */
const POR_TANDA = 100;

export async function conTicketAbierto(
  companyId: string,
  filas: FilaEspera[],
): Promise<FilaEsperaConTicket[] | null> {
  if (filas.length === 0) return [];

  // Qué estados dan por terminado un ticket lo decide cada empresa, no el código.
  const { data: etiquetas, error: errEtiquetas } = await (supabase as any)
    .from("ticket_labels").select("key, label, is_final").eq("company_id", companyId);
  if (errEtiquetas) return null;

  const lista: { key: string; label?: string; is_final?: boolean }[] = Array.isArray(etiquetas) ? etiquetas : [];
  const marcadas = lista.filter(l => l.is_final).map(l => l.key);
  // Sin ninguna marcada como final —empresa recién configurada— se usa el par de siempre.
  const finales = new Set(marcadas.length ? marcadas : ["resuelto", "cerrado"]);
  const nombre = new Map(lista.map(l => [l.key, l.label || l.key]));

  const abiertos = new Map<string, { id: string; status: string }>();
  for (let i = 0; i < filas.length; i += POR_TANDA) {
    const ids = filas.slice(i, i + POR_TANDA).map(f => f.conversation_id);
    const { data, error } = await (supabase as any)
      .from("tickets")
      .select("id, conversation_id, status, created_at")
      .eq("company_id", companyId)
      .in("conversation_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    // Si no se pudo verificar, se dice que no se pudo: mostrar la lista sin filtrar
    // sería volver al error de contar clientes que nadie tiene asignados.
    if (error) return null;
    for (const t of data ?? []) {
      if (finales.has(t.status)) continue;
      // El primero de cada conversación es el más reciente (viene ordenado).
      if (!abiertos.has(t.conversation_id)) abiertos.set(t.conversation_id, { id: t.id, status: t.status });
    }
  }

  return filas
    .filter(f => abiertos.has(f.conversation_id))
    .map(f => {
      const t = abiertos.get(f.conversation_id)!;
      return { ...f, ticket_id: t.id, ticket_estado: nombre.get(t.status) ?? t.status };
    });
}
