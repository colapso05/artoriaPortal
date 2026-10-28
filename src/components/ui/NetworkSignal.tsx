import { useEffect, useState } from "react";
import { Wifi, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import type { OnuSignal } from "@/hooks/useOnuSignal";

const NETWORK_STATUS_MAP: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  "very good": { label: "Señal muy buena", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-500" },
  "good": { label: "Señal buena", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-500" },
  "warning": { label: "Señal con advertencia", color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20", dot: "bg-amber-500" },
  "critical": { label: "Señal crítica", color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", dot: "bg-destructive" },
};
const DEFAULT_NETWORK_STATUS = { label: "Sin estado", color: "text-muted-foreground", bg: "bg-muted/30 border-border/20", dot: "bg-muted-foreground" };

export function getNetworkStatusInfo(signal: OnuSignal | null) {
  if (!signal?.signal_status) return DEFAULT_NETWORK_STATUS;
  return NETWORK_STATUS_MAP[signal.signal_status.toLowerCase()] ?? DEFAULT_NETWORK_STATUS;
}

// Rango típico de potencia óptica GPON en dBm: -8 (excelente) a -30 (crítico/sin señal).
const dbmToPercent = (v: number) => {
  const MIN = -30, MAX = -8;
  return Math.max(4, Math.min(100, ((v - MIN) / (MAX - MIN)) * 100));
};

/** Pastilla compacta (ícono wifi + chevron) para colocar junto a un título. Null-safe: no renderiza nada sin señal. */
export function NetworkSignalBadge({ signal, open }: { signal: OnuSignal | null; open: boolean }) {
  if (!signal) return null;
  const statusInfo = getNetworkStatusInfo(signal);
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 cursor-pointer ${statusInfo.bg} ${statusInfo.color}`}>
      <Wifi className="w-2.5 h-2.5" />
      <ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? "rotate-180" : ""}`} />
    </span>
  );
}

/** Panel desplegable con el detalle de la señal. Se anima con height: 0 → auto. Null-safe. */
export function NetworkSignalPanel({ signal, open, className = "" }: { signal: OnuSignal | null; open: boolean; className?: string }) {
  /*
   * La antigüedad se recalcula sola cada 30 s mientras el panel está abierto.
   *
   * Antes solo se recalculaba al llegar un dato nuevo, y como la sincronización de
   * SmartOLT y el refresco del portal comparten período (5 minutos), quedaban
   * enganchados en fase: la etiqueta mostraba siempre el mismo número. Con una
   * señal óptica estable —que no varía— el panel entero parecía congelado aunque
   * estuviera al día. Ahora el contador avanza a la vista y se reinicia en cada
   * sincronización, que es la señal de vida que faltaba.
   */
  const [, refrescarEdad] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => refrescarEdad(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, [open]);

  const statusInfo = getNetworkStatusInfo(signal);
  const channels = signal
    ? ([
        { label: "1310 nm · subida", value: signal.signal_1310 },
        { label: "1490 nm · bajada", value: signal.signal_1490 },
      ].filter(c => c.value != null) as { label: string; value: number }[])
    : [];

  return (
    <AnimatePresence>
      {open && signal && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`overflow-hidden ${className}`}
        >
          <div className={`rounded-xl border p-3 space-y-2.5 ${statusInfo.bg}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusInfo.color}`}>
                <span className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />
                {statusInfo.label}
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                Actualizado {formatDistanceToNow(new Date(signal.updated_at), { addSuffix: true, locale: es })}
              </span>
            </div>
            {channels.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {channels.map(ch => (
                  <div key={ch.label}>
                    <p className="text-[10px] text-muted-foreground/60 mb-0.5">{ch.label}</p>
                    <p className="text-lg font-bold font-['Space_Grotesk'] leading-none">
                      {ch.value.toFixed(1)}
                      <span className="text-[10px] font-normal text-muted-foreground/60 ml-0.5">dBm</span>
                    </p>
                    <div className="h-1.5 rounded-full bg-muted/50 mt-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${statusInfo.dot}`} style={{ width: `${dbmToPercent(ch.value)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Guard de click: para usar en el onClick del contenedor hoverable — ignora clicks sobre controles interactivos internos. */
export function isInteractiveTarget(e: React.MouseEvent): boolean {
  const target = e.target as HTMLElement;
  return !!target.closest('button, [role="combobox"], a, input, textarea');
}
