import { useEffect, useState } from "react";
import { Power, Loader2, Radio, ArrowLeft, Activity, MapPin, Hash } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { OnuSignal } from "@/hooks/useOnuSignal";

/**
 * Vista completa del equipo del cliente (ONU).
 *
 * Ocupa el mismo espacio que la conversación en vez de desplegarse encima: los
 * datos de red son un contexto aparte del chat, y mezclarlos empujaba los
 * mensajes hacia abajo cada vez que el operador quería mirar la señal.
 */

/** Estados que devuelve SmartOLT. El resto cae en el genérico. */
const ESTADOS: Record<string, { etiqueta: string; detalle: string; color: string; fondo: string; punto: string }> = {
  "online": {
    etiqueta: "En línea",
    detalle: "El equipo está conectado y responde con normalidad.",
    color: "text-emerald-500", fondo: "bg-emerald-500/10 border-emerald-500/25", punto: "bg-emerald-500",
  },
  "offline": {
    etiqueta: "Fuera de línea",
    detalle: "El equipo no responde. Puede estar desconectado, apagado o dado de baja.",
    color: "text-muted-foreground", fondo: "bg-muted/40 border-border/40", punto: "bg-muted-foreground",
  },
  "power fail": {
    etiqueta: "Sin energía",
    detalle: "El equipo perdió alimentación eléctrica. Normalmente se resuelve pidiéndole al cliente que lo enchufe.",
    color: "text-amber-500", fondo: "bg-amber-500/10 border-amber-500/25", punto: "bg-amber-500",
  },
  "los": {
    etiqueta: "Sin señal óptica (LOS)",
    detalle: "El equipo no recibe luz: fibra cortada o desconectada. Requiere visita técnica.",
    color: "text-destructive", fondo: "bg-destructive/10 border-destructive/25", punto: "bg-destructive",
  },
};

/** Estado nulo recién sincronizado: puede ser un hueco pasajero, no una baja. */
const SIN_ESTADO = {
  etiqueta: "Sin información",
  detalle: "SmartOLT no devolvió el estado de este equipo en la última consulta.",
  color: "text-muted-foreground", fondo: "bg-muted/40 border-border/40", punto: "bg-muted-foreground",
};

/** Estado nulo y sin sincronizar hace horas: SmartOLT dejó de devolver el equipo. */
const DADO_DE_BAJA = {
  etiqueta: "Dado de baja",
  detalle: "SmartOLT ya no devuelve este equipo. Los datos de abajo son los últimos que se registraron y no se van a actualizar.",
  color: "text-muted-foreground", fondo: "bg-muted/40 border-dashed border-border/60", punto: "bg-muted-foreground/50",
};

/*
 * Un equipo dado de baja se distingue de un hueco pasajero por el tiempo: la
 * sincronización de estado corre cada 6 minutos, así que una fila sin estado y sin
 * tocar en horas es que SmartOLT dejó de devolverla. Se usa un margen amplio para
 * no etiquetar de baja a un equipo por un fallo puntual de la sincronización.
 */
const HORAS_PARA_BAJA = 3;

function estaDadoDeBaja(signal: OnuSignal | null): boolean {
  if (!signal || signal.onu_status) return false;
  const marcas = [signal.status_updated_at, signal.updated_at]
    .map(v => (v ? Date.parse(v) : NaN))
    .filter(n => !isNaN(n));
  if (!marcas.length) return false;
  return Date.now() - Math.max(...marcas) > HORAS_PARA_BAJA * 3_600_000;
}

const CALIDAD: Record<string, { etiqueta: string; color: string; barra: string }> = {
  "very good": { etiqueta: "Muy buena", color: "text-emerald-500", barra: "bg-emerald-500" },
  "good": { etiqueta: "Buena", color: "text-emerald-500", barra: "bg-emerald-500" },
  "warning": { etiqueta: "Con advertencia", color: "text-amber-500", barra: "bg-amber-500" },
  "critical": { etiqueta: "Crítica", color: "text-destructive", barra: "bg-destructive" },
};

// Rango típico de potencia óptica GPON en dBm: -8 (excelente) a -30 (crítico).
const aPorcentaje = (v: number) => Math.max(4, Math.min(100, ((v + 30) / 22) * 100));

const hace = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : formatDistanceToNow(d, { addSuffix: true, locale: es });
};

/** Lee un campo de texto del JSON crudo de SmartOLT sin romperse si falta. */
const crudo = (raw: Record<string, unknown> | null, clave: string): string | null => {
  const v = raw?.[clave];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

export function OnuPanel({
  signal,
  onuExternalId,
  puedeReiniciar,
  onReiniciar,
  reiniciando,
  onVolver,
}: {
  signal: OnuSignal | null;
  onuExternalId: string | null | undefined;
  puedeReiniciar: boolean;
  onReiniciar: () => void;
  reiniciando: boolean;
  onVolver: () => void;
}) {
  // Las antigüedades se recalculan solas: sin esto un panel abierto un rato
  // seguiría diciendo "hace 2 minutos" indefinidamente.
  const [, refrescarEdad] = useState(0);
  useEffect(() => {
    const id = setInterval(() => refrescarEdad(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const deBaja = estaDadoDeBaja(signal);
  const estado = signal?.onu_status
    ? (ESTADOS[signal.onu_status.trim().toLowerCase()] ?? { ...SIN_ESTADO, etiqueta: signal.onu_status })
    : deBaja ? DADO_DE_BAJA : SIN_ESTADO;

  const calidad = signal?.signal_status
    ? CALIDAD[signal.signal_status.trim().toLowerCase()] ?? null
    : null;

  const canales = signal
    ? ([
        { label: "1310 nm · subida", value: signal.signal_1310 },
        { label: "1490 nm · bajada", value: signal.signal_1490 },
      ].filter(c => c.value != null) as { label: string; value: number }[])
    : [];

  const serie = crudo(signal?.raw ?? null, "sn");
  const ubicacion = [
    crudo(signal?.raw ?? null, "olt_id") && `OLT ${crudo(signal?.raw ?? null, "olt_id")}`,
    crudo(signal?.raw ?? null, "board") && `Placa ${crudo(signal?.raw ?? null, "board")}`,
    crudo(signal?.raw ?? null, "port") && `Puerto ${crudo(signal?.raw ?? null, "port")}`,
  ].filter(Boolean).join(" · ");

  const desdeCuando = hace(signal?.last_status_change);
  const estadoSync = hace(signal?.status_updated_at);
  const senalSync = hace(signal?.updated_at);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ScrollArea className="h-full">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-4">

          {/* Estado del equipo — lo primero, porque decide si hay que mandar técnico */}
          <section className={`rounded-2xl border p-5 ${estado.fondo}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                  Estado del equipo
                </p>
                <h2 className={`text-xl font-bold leading-tight flex items-center gap-2 flex-wrap ${estado.color}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${estado.punto}`} />
                  {estado.etiqueta}
                  {deBaja && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground/70 bg-muted/50">
                      Fuera de SmartOLT
                    </span>
                  )}
                </h2>
                {desdeCuando && (
                  <p className="text-[12px] text-muted-foreground/80 mt-1">Así {desdeCuando}</p>
                )}
              </div>
              {estadoSync && (
                <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">
                  Estado consultado {estadoSync}
                </span>
              )}
            </div>
            <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-3">{estado.detalle}</p>
          </section>

          {/* Potencia óptica */}
          <section className="rounded-2xl border border-border/40 bg-card/40 p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> Potencia óptica
              </p>
              <div className="flex items-center gap-3">
                {calidad && (
                  <span className={`text-[11px] font-bold ${calidad.color}`}>{calidad.etiqueta}</span>
                )}
                {senalSync && (
                  <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">
                    Señal medida {senalSync}
                  </span>
                )}
              </div>
            </div>

            {canales.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {canales.map(c => (
                  <div key={c.label}>
                    <p className="text-[11px] text-muted-foreground/60 mb-1">{c.label}</p>
                    <p className="text-3xl font-bold font-['Space_Grotesk'] leading-none">
                      {c.value.toFixed(1)}
                      <span className="text-[11px] font-normal text-muted-foreground/60 ml-1">dBm</span>
                    </p>
                    <div className="h-2 rounded-full bg-muted/50 mt-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${calidad?.barra ?? "bg-muted-foreground"}`}
                        style={{ width: `${aPorcentaje(c.value)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                Sin lectura de potencia en ninguna longitud de onda. Con el equipo fuera de línea
                es lo esperado: el estado de arriba explica el motivo.
              </p>
            )}
          </section>

          {/* Identificación del equipo */}
          <section className="rounded-2xl border border-border/40 bg-card/40 p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-3 flex items-center gap-1.5">
              <Radio className="w-3 h-3" /> Equipo
            </p>
            <dl className="space-y-2.5 text-[12.5px]">
              {serie && (
                <div className="flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                  <dt className="text-muted-foreground/60">Serie</dt>
                  <dd className="font-mono font-semibold ml-auto">{serie}</dd>
                </div>
              )}
              {ubicacion && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                  <dt className="text-muted-foreground/60">Ubicación</dt>
                  <dd className="font-mono font-semibold ml-auto text-right">{ubicacion}</dd>
                </div>
              )}
              {onuExternalId && (
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                  <dt className="text-muted-foreground/60">ID en SmartOLT</dt>
                  <dd className="font-mono font-semibold ml-auto">{onuExternalId}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Acciones. Un equipo dado de baja ya no existe para SmartOLT: la orden de
              reinicio no llegaría a ninguna parte, así que no se ofrece. */}
          {puedeReiniciar && !deBaja && (
            <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                Acciones
              </p>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-3.5">
                Reiniciar corta el servicio del cliente durante uno o dos minutos. Sirve cuando
                el equipo está en línea pero navega mal.
              </p>
              <Button
                onClick={onReiniciar}
                disabled={reiniciando}
                variant="ghost"
                className="h-10 gap-2 text-[11px] font-bold tracking-widest uppercase border border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
              >
                {reiniciando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                {reiniciando ? "Reiniciando..." : "Reiniciar ONU"}
              </Button>
            </section>
          )}

          <button
            onClick={onVolver}
            className="w-full h-11 rounded-xl border border-border/40 text-[12px] font-bold tracking-widest uppercase text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a la conversación
          </button>
        </div>
      </ScrollArea>
    </div>
  );
}

export default OnuPanel;
