import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, MapPin, Phone, Clock, CheckCircle2, Navigation, CalendarDays,
} from "lucide-react";
import { format, parseISO, isToday, addMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { STATUS_COLORS, STATUS_LABELS, type Appointment, type AppointmentStatus } from "./schedule/types";
import type { TecnicoBandeja } from "@/hooks/useTecnicos";

/** Cuántos trabajos cerrados se muestran en el historial. */
const TOPE_HISTORIAL = 8;

/**
 * El panel que acompaña al chat de un técnico.
 *
 * Un técnico no es un caso de soporte: no tiene RUT que verificar ni plan
 * contratado ni un motivo que dictaminar, así que la ficha de cliente al lado de
 * su conversación no decía nada útil. Lo que el operador necesita saber mientras
 * le escribe es dónde está y qué le queda por hacer hoy, que es lo que esto
 * muestra.
 */
export default function PanelTecnico({
  tecnico, companyId,
}: {
  tecnico: TecnicoBandeja;
  companyId: string;
}) {
  const [citas, setCitas] = useState<Appointment[] | null>(null);

  useEffect(() => {
    if (!companyId || !tecnico.id) return;
    let cancelado = false;

    const cargar = () => {
      (supabase as any)
        .from("appointments")
        .select("*")
        .eq("company_id", companyId)
        .eq("technician_id", tecnico.id)
        .order("start_datetime", { ascending: false })
        .limit(60)
        .then(({ data }: any) => {
          if (!cancelado) setCitas(Array.isArray(data) ? data : []);
        });
    };
    cargar();

    // El estado lo cambia el propio técnico desde su app: sin esto, el operador
    // leería "pendiente" mientras el otro ya está en la puerta del cliente.
    const canal = supabase
      .channel(`citas-tecnico-${tecnico.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `technician_id=eq.${tecnico.id}` },
        cargar,
      )
      .subscribe();

    return () => { cancelado = true; supabase.removeChannel(canal); };
  }, [companyId, tecnico.id]);

  const { enCurso, hoy, historial, cerradasHoy } = useMemo(() => {
    const todas = citas ?? [];
    const deHoy = todas
      .filter((c) => isToday(parseISO(c.start_datetime)))
      .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
    return {
      // "En camino" es lo más cerca que hay de saber qué está haciendo ahora:
      // es el estado que el técnico marca al salir hacia el domicilio.
      enCurso: deHoy.find((c) => c.status === "en_camino") ?? null,
      hoy: deHoy,
      cerradasHoy: deHoy.filter((c) => c.status === "completado").length,
      historial: todas
        .filter((c) => c.status === "completado" && !isToday(parseISO(c.start_datetime)))
        .slice(0, TOPE_HISTORIAL),
    };
  }, [citas]);

  const pill = (estado: AppointmentStatus) => (
    <span
      className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0"
      style={{ backgroundColor: STATUS_COLORS[estado] + "22", color: STATUS_COLORS[estado] }}
    >
      {STATUS_LABELS[estado]}
    </span>
  );

  const fila = (c: Appointment, conFecha = false) => {
    const desde = parseISO(c.start_datetime);
    return (
      <div key={c.id} className="rounded-xl border border-border/25 bg-muted/30 px-2.5 py-2 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold tabular-nums shrink-0">
            {conFecha ? format(desde, "d MMM", { locale: es }) : format(desde, "HH:mm")}
            {!conFecha && (
              <span className="text-muted-foreground/40 font-medium">
                {"–"}{format(addMinutes(desde, c.duration_minutes), "HH:mm")}
              </span>
            )}
          </span>
          <span className="text-[11px] text-muted-foreground/70 truncate flex-1">{c.service_type}</span>
          {pill(c.status)}
        </div>
        <p className="text-[12px] font-semibold leading-tight truncate">{c.client_name}</p>
        {c.client_address && (
          <p className="text-[10.5px] text-muted-foreground/60 leading-tight flex items-start gap-1">
            <MapPin className="w-2.5 h-2.5 mt-[3px] shrink-0" />
            <span className="break-words">{c.client_address}</span>
          </p>
        )}
      </div>
    );
  };

  const titulo = (texto: string, icono: React.ReactNode) => (
    <h4 className="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-2 px-1">
      {icono} {texto}
    </h4>
  );

  return (
    <div className="space-y-4">
      {/* ── Quién es ── */}
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-[15px] text-white shrink-0 overflow-hidden"
          style={{ backgroundColor: tecnico.color }}
        >
          {tecnico.photo_url
            ? <img src={tecnico.photo_url} alt="" className="w-full h-full object-cover" />
            : tecnico.name.trim().slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-tight truncate">{tecnico.name}</p>
          <p className="text-[11px] text-muted-foreground/60 font-mono flex items-center gap-1 leading-tight mt-0.5">
            <Phone className="w-2.5 h-2.5" /> {tecnico.phone || "sin número"}
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-[9px] font-black uppercase tracking-wider shrink-0"
          style={tecnico.is_active
            ? { color: "#22c55e", borderColor: "#22c55e55" }
            : { color: "#94a3b8", borderColor: "#94a3b855" }}
        >
          {tecnico.is_active ? "Activo" : "Inactivo"}
        </Badge>
      </div>

      {citas === null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
        </div>
      ) : (
        <>
          {/* ── Qué está haciendo ahora ── */}
          <div className="space-y-2">
            {titulo("Ahora", <Navigation className="w-3 h-3" />)}
            {enCurso ? (
              <div
                className="rounded-xl border px-3 py-2.5 space-y-1"
                style={{ borderColor: STATUS_COLORS.en_camino + "55", backgroundColor: STATUS_COLORS.en_camino + "12" }}
              >
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: STATUS_COLORS.en_camino }}>
                  En camino {"·"} {format(parseISO(enCurso.start_datetime), "HH:mm")}
                </p>
                <p className="text-[13px] font-bold leading-tight">{enCurso.client_name}</p>
                <p className="text-[11px] text-muted-foreground/70 leading-snug flex items-start gap-1">
                  <MapPin className="w-3 h-3 mt-[2px] shrink-0" />
                  <span className="break-words">{enCurso.client_address}</span>
                </p>
                {enCurso.notes && (
                  <p className="text-[11px] text-muted-foreground/60 leading-snug border-t border-border/20 pt-1.5 mt-1.5 break-words">
                    {enCurso.notes}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground/60 px-1">
                {/* No es lo mismo "no salió todavía" que "ya no le queda nada". */}
                {hoy.some((c) => c.status === "pendiente" || c.status === "en_espera")
                  ? "Sin trabajo en curso. Tiene visitas pendientes para hoy."
                  : "Sin trabajo en curso."}
              </p>
            )}
          </div>

          {/* ── El día ── */}
          <div className="space-y-2">
            {titulo("Hoy", <Clock className="w-3 h-3" />)}
            {hoy.length === 0 ? (
              <p className="text-[12px] text-muted-foreground/60 px-1">Sin visitas agendadas para hoy.</p>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground/60 px-1">
                  {cerradasHoy} de {hoy.length} completada{hoy.length === 1 ? "" : "s"}
                </p>
                <div className="space-y-1.5">{hoy.map((c) => fila(c))}</div>
              </>
            )}
          </div>

          {/* ── Lo anterior ── */}
          {historial.length > 0 && (
            <div className="space-y-2">
              {titulo("Trabajos anteriores", <CheckCircle2 className="w-3 h-3" />)}
              <div className="space-y-1.5">{historial.map((c) => fila(c, true))}</div>
            </div>
          )}

          {citas.length === 0 && (
            <p className="text-[12px] text-muted-foreground/50 px-1 flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5" />
              Todavía no tiene visitas asignadas en la agenda.
            </p>
          )}
        </>
      )}
    </div>
  );
}
