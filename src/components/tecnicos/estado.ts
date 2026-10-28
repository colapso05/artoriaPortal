export type Tono = "azul" | "verde" | "rojo" | "ambar" | "gris";

/**
 * Etiqueta y tono de una cita — mismos estados que la app Android (TicketDetailScreen.kt).
 *
 * Devuelve variables CSS en vez de hex: los colores neón del tema oscuro no
 * tienen contraste suficiente sobre blanco, así que cada tono cambia de valor
 * según el tema activo (ver la paleta en index.css).
 */
export function estadoCita(status: string | null | undefined) {
  const con = (label: string, tono: Tono) => ({
    label,
    tono,
    color: `var(--tec-tono-${tono})`,
    bg: `var(--tec-tono-${tono}-bg)`,
  });

  switch ((status ?? "").toLowerCase()) {
    case "en_camino": return con("En camino", "azul");
    case "completado":
    case "completada": return con("Completado", "verde");
    case "resuelto": return con("Resuelto", "verde");
    case "cancelado": return con("Cancelado", "rojo");
    case "en_espera": return con("En espera", "ambar");
    default: return con("Pendiente", "gris");
  }
}

/** "lun 4 ago · 14:30" — formato compacto para las tarjetas de la agenda. */
export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return "Sin fecha";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Sin fecha";
  const fecha = d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
  const hora = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  return `${fecha} · ${hora}`;
}

export function formatHora(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

/** True si la cita es hoy — para destacarla en la lista. */
export function esHoy(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const hoy = new Date();
  return d.toDateString() === hoy.toDateString();
}

/**
 * True si la cita sigue pendiente con la fecha ya pasada.
 *
 * Casi siempre es una cita que en realidad ya se resolvió pero quedó marcada como
 * pendiente —el operador cierra el caso desde el panel y el estado de la cita no se
 * entera—, y al técnico le aparece trabajo que no existe. Marcarlas evita que las
 * confunda con trabajo real mientras se corrige el origen.
 */
export function estaAtrasada(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const inicioDeHoy = new Date();
  inicioDeHoy.setHours(0, 0, 0, 0);
  return d.getTime() < inicioDeHoy.getTime();
}

/** "lun 4 ago" — fecha sola, para acompañar a la hora en grande. */
export function formatFechaCorta(iso: string | null | undefined): string {
  if (!iso) return "Sin fecha";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Sin fecha";
  return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * True si la cita cae en la semana en curso, de lunes a domingo.
 *
 * Se usa la semana del calendario y no "los próximos 7 días" porque es lo que el
 * técnico entiende cuando pregunta qué tiene esta semana.
 */
export function esEstaSemana(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;

  const hoy = new Date();
  // getDay() devuelve 0 para domingo; se corrige para que la semana empiece el lunes.
  const diaSemana = (hoy.getDay() + 6) % 7;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - diaSemana);
  lunes.setHours(0, 0, 0, 0);
  const finDomingo = new Date(lunes);
  finDomingo.setDate(lunes.getDate() + 7);

  return d.getTime() >= lunes.getTime() && d.getTime() < finDomingo.getTime();
}
