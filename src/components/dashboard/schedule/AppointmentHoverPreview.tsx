import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, MapPin, Phone, User, Wrench, Info } from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS, type Appointment } from "./types";

/**
 * Vista previa de una cita al pasar el mouse por encima, en el calendario.
 *
 * Pedido de un cliente: en la grilla semanal las tarjetas son chicas y hay que abrir la
 * ficha para saber de qué se trata. Con esto, pasar el mouse ya muestra cliente,
 * dirección, hora, técnico y estado; el clic sigue abriendo la ficha completa.
 *
 * Cómo funciona: no envuelve las tarjetas (tocar la estructura del calendario para algo
 * cosmético es pedir un problema). Escucha `mouseover` en el documento y busca el
 * atributo `data-cita` que llevan las tarjetas; con el id busca la cita en la lista.
 * Se dibuja en un portal al `body` para que no la recorte ningún contenedor con
 * `overflow: hidden`, y no recibe eventos (`pointer-events: none`) para no estorbar.
 *
 * En pantallas táctiles no pasa nada: no hay hover y el toque sigue abriendo la ficha.
 */

export const ATRIBUTO_CITA = "data-cita";

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });

const horaFin = (a: Appointment) =>
  hora(new Date(new Date(a.start_datetime).getTime() + a.duration_minutes * 60000).toISOString());

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

const ANCHO = 270;
/** Separación entre el puntero y la tarjeta. */
const MARGEN = 16;

export default function AppointmentHoverPreview({ appointments }: { appointments: Appointment[] }) {
  const [previa, setPrevia] = useState<{ appt: Appointment; x: number; y: number } | null>(null);

  useEffect(() => {
    const alMover = (evento: MouseEvent) => {
      const objetivo = evento.target as HTMLElement | null;
      const tarjeta = objetivo?.closest?.(`[${ATRIBUTO_CITA}]`);
      const id = tarjeta?.getAttribute(ATRIBUTO_CITA);
      const appt = id ? appointments.find((a) => a.id === id) : undefined;

      if (!appt) {
        // Salió de toda tarjeta: se cierra. Sin esto la previa queda pegada en pantalla.
        setPrevia((actual) => (actual ? null : actual));
        return;
      }
      // Misma tarjeta: no se recalcula (si no, se re-renderiza a cada pixel de movimiento
      // y la previa tiembla). La posición se fija donde entró el mouse.
      setPrevia((actual) => (actual?.appt.id === appt.id ? actual : { appt, x: evento.clientX, y: evento.clientY }));
    };

    document.addEventListener("mouseover", alMover);
    return () => document.removeEventListener("mouseover", alMover);
  }, [appointments]);

  /*
   * La posición se calcula MIDIENDO la tarjeta ya dibujada, no con una altura
   * supuesta: la tarjeta cambia de alto según cuántos datos tenga la cita (con
   * notas queda bastante más alta) y con un número fijo se salía por abajo y el
   * navegador la recortaba.
   *
   * Regla: primero se intenta abajo-derecha del puntero; si no entra, se da vuelta
   * —arriba o a la izquierda— y recién si tampoco entra se pega al borde.
   */
  const referencia = useRef<HTMLDivElement | null>(null);
  const [caja, setCaja] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = referencia.current;
    if (!el) return;
    const alto = el.offsetHeight;
    const ancho = el.offsetWidth;

    let left = previa ? previa.x + MARGEN : 0;
    let top = previa ? previa.y + MARGEN : 0;

    if (previa) {
      if (left + ancho > window.innerWidth - 8) {
        left = previa.x - ancho - MARGEN;
      }
      if (top + alto > window.innerHeight - 8) {
        top = previa.y - alto - MARGEN;
      }
      setCaja({
        left: Math.max(8, Math.min(left, window.innerWidth - ancho - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - alto - 8)),
      });
    }
  }, [previa]);

  // Al hacer scroll la tarjeta quedaría apuntando a un lugar que ya no está: se cierra.
  useEffect(() => {
    if (!previa) return;
    const cerrar = () => setPrevia(null);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [previa]);

  if (!previa) return null;
  const { appt } = previa;

  return createPortal(
    <div
      ref={referencia}
      className="fixed z-[9999] pointer-events-none rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden dark:bg-[hsl(226_20%_15%)] dark:border-[hsl(226_16%_26%)] dark:shadow-[0_16px_50px_-12px_rgba(0,0,0,0.85)]"
      style={{
        left: caja?.left ?? previa.x + MARGEN,
        top: caja?.top ?? previa.y + MARGEN,
        width: ANCHO,
        maxHeight: "80vh",
        // Hasta que no está medida, no se muestra: si no, se ve el salto de posición.
        visibility: caja ? "visible" : "hidden",
      }}
      role="tooltip"
    >
      <div className="px-3 py-2 border-b border-border/40 flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-bold truncate">{appt.service_type}</p>
        <span
          className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${STATUS_COLORS[appt.status]}`}
        >
          {STATUS_LABELS[appt.status]}
        </span>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        <p className="text-[11.5px] flex items-start gap-1.5">
          <CalendarClock className="w-3 h-3 mt-0.5 flex-shrink-0 text-foreground/55" />
          <span>
            <span className="capitalize">{fecha(appt.start_datetime)}</span>
            <br />
            <span className="tabular-nums font-semibold">
              {hora(appt.start_datetime)}–{horaFin(appt)}
            </span>
            <span className="text-foreground/70"> · {appt.duration_minutes} min</span>
          </span>
        </p>

        <p className="text-[11.5px] flex items-start gap-1.5">
          <User className="w-3 h-3 mt-0.5 flex-shrink-0 text-foreground/55" />
          <span className="text-[12px] font-semibold">{appt.client_name}</span>
        </p>

        {appt.client_address && (
          <p className="text-[11.5px] flex items-start gap-1.5 text-foreground/90">
            <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-foreground/55" />
            <span>{appt.client_address}</span>
          </p>
        )}

        {appt.client_phone && (
          <p className="text-[11.5px] flex items-start gap-1.5 text-foreground/90">
            <Phone className="w-3 h-3 mt-0.5 flex-shrink-0 text-foreground/55" />
            <span className="tabular-nums">{appt.client_phone}</span>
          </p>
        )}

        {appt.technician?.name && (
          <p className="text-[11.5px] flex items-start gap-1.5 text-foreground/90">
            <Wrench className="w-3 h-3 mt-0.5 flex-shrink-0 text-foreground/55" />
            <span>{appt.technician.name}</span>
          </p>
        )}

        {appt.notes && (
          <p className="text-[11px] text-foreground/90 leading-relaxed border-t border-border/30 pt-1.5 line-clamp-3">
            {appt.notes}
          </p>
        )}

        <p className="text-[10px] text-foreground/65 flex items-center gap-1 pt-0.5">
          <Info className="w-2.5 h-2.5" /> Clic para abrir la ficha completa
        </p>
      </div>
    </div>,
    document.body,
  );
}
