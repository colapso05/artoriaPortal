import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OnuSignal {
  signal_status: string | null;
  signal_1310: number | null;
  signal_1490: number | null;
  /** Estado del equipo: 'Online' | 'Offline' | 'Power fail' | 'LOS'. Null = SmartOLT ya no lo devuelve. */
  onu_status: string | null;
  /** Desde cuándo el equipo está en ese estado. */
  last_status_change: string | null;
  /**
   * Cuándo se sincronizó el ESTADO. Va aparte de `updated_at`, que es el de la
   * señal: se actualizan a ritmos distintos (estado cada 6 min, señal cada 30),
   * así que mostrar la marca equivocada haría parecer viejo un dato fresco.
   */
  status_updated_at: string | null;
  /** Datos crudos de SmartOLT: número de serie, ubicación en la OLT, zona. */
  raw: Record<string, unknown> | null;
  updated_at: string;
}

const COLUMNAS =
  "signal_status, signal_1310, signal_1490, onu_status, last_status_change, status_updated_at, raw, updated_at";

const POLL_MS = 5 * 60 * 1000; // respaldo: re-consulta cada 5 min por si se pierde algún evento de Realtime

/**
 * Lee la señal cacheada de una ONU (SmartOLT) y se suscribe a Realtime para mantenerse
 * actualizada. Además re-consulta cada 5 min como red de seguridad (una desconexión breve
 * de Realtime — cambio de pestaña, red inestable — no debería dejar el dato pegado).
 * Devuelve null si no aplica (sin onuExternalId) o si no hay fila en onu_signals — nunca un
 * objeto vacío/placeholder.
 */
export function useOnuSignal(companyId: string | null | undefined, onuExternalId: string | null | undefined): OnuSignal | null {
  const [signal, setSignal] = useState<OnuSignal | null>(null);

  useEffect(() => {
    setSignal(null);
    if (!onuExternalId || !companyId) return;
    let cancelled = false;

    const fetchSignal = () => {
      (supabase as any)
        .from("onu_signals")
        .select(COLUMNAS)
        .eq("company_id", companyId)
        .eq("onu_external_id", onuExternalId)
        .maybeSingle()
        .then(({ data }: any) => { if (!cancelled) setSignal(data ?? null); });
    };

    fetchSignal();

    const channel = supabase
      .channel(`onu-signal-${onuExternalId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "onu_signals", filter: `onu_external_id=eq.${onuExternalId}` }, (payload: any) => {
        if (payload.eventType === "DELETE") { setSignal(null); return; }
        const nt = payload.new;
        // `onu_external_id` no es único global: la misma ONU existe en varias empresas
        // con valores distintos, y el filtro de Realtime no incluye company_id.
        if (!nt || nt.company_id !== companyId) return;
        setSignal({
          signal_status: nt.signal_status,
          signal_1310: nt.signal_1310,
          signal_1490: nt.signal_1490,
          onu_status: nt.onu_status ?? null,
          last_status_change: nt.last_status_change ?? null,
          status_updated_at: nt.status_updated_at ?? null,
          raw: nt.raw ?? null,
          updated_at: nt.updated_at,
        });
      })
      .subscribe();

    const interval = setInterval(fetchSignal, POLL_MS);

    return () => { cancelled = true; clearInterval(interval); supabase.removeChannel(channel); };
  }, [companyId, onuExternalId]);

  return signal;
}
