/**
 * Meses para los historiales del inicio.
 *
 * Todo se calcula en hora de Chile. Un mensaje enviado el 30 de septiembre a las
 * 22:00 es de septiembre aunque en UTC ya sea 1 de octubre; si se agrupara por UTC,
 * cada mes arrancaría y terminaría unas horas corrido.
 */

const ZONA = "America/Santiago";

const NOMBRES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export interface Mes {
  /** "2026-09" */
  clave: string;
  /** "Septiembre 2026" */
  etiqueta: string;
  /** Primer día, "2026-09-01". */
  desde: string;
  /** Último día del mes, o hoy si es el mes en curso. */
  hasta: string;
  enCurso: boolean;
}

const dos = (n: number) => String(n).padStart(2, "0");

/** El año, mes y día de este instante, vistos desde Chile. */
function partesEnChile(fecha: Date): { a: number; m: number; d: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(fecha);
  const num = (t: string) => Number(p.find(x => x.type === t)?.value);
  return { a: num("year"), m: num("month"), d: num("day") };
}

/** La fecha "AAAA-MM-DD" de un instante, vista desde Chile. Por defecto, hoy. */
export function isoChile(fecha: Date = new Date()): string {
  const { a, m, d } = partesEnChile(fecha);
  return `${a}-${dos(m)}-${dos(d)}`;
}

/** El primer día del mes en curso, "AAAA-MM-01", en hora de Chile. */
export function inicioMesChile(fecha: Date = new Date()): string {
  return isoChile(fecha).slice(0, 8) + "01";
}

/**
 * Una fecha "AAAA-MM-DD" (o con hora) escrita como se lee en Chile: "09-10-2026", día
 * primero. Se parte el texto y no se pasa por Date, para que la zona horaria no corra el día.
 */
export function fechaCl(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** Lo mismo sin el año, "09-10", para los ejes de los gráficos. */
export function diaMes(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}-${m[2]}` : "";
}

/** La clave "AAAA-MM" de un instante, en hora de Chile. */
export function claveMes(fecha: Date): string {
  const { a, m } = partesEnChile(fecha);
  return `${a}-${dos(m)}`;
}

/** Los últimos `n` meses, el actual primero. */
export function ultimosMeses(n: number, ahora: Date = new Date()): Mes[] {
  const hoy = partesEnChile(ahora);
  const salida: Mes[] = [];
  for (let i = 0; i < n; i++) {
    // Se resta sobre el contador de meses y no sobre una fecha: restarle días a
    // un 31 de marzo para llegar a "febrero" da otro mes.
    const total = hoy.a * 12 + (hoy.m - 1) - i;
    const a = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const enCurso = i === 0;
    const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
    salida.push({
      clave: `${a}-${dos(m)}`,
      etiqueta: `${NOMBRES[m - 1][0].toUpperCase()}${NOMBRES[m - 1].slice(1)} ${a}`,
      desde: `${a}-${dos(m)}-01`,
      hasta: enCurso ? `${a}-${dos(m)}-${dos(hoy.d)}` : `${a}-${dos(m)}-${dos(ultimoDia)}`,
      enCurso,
    });
  }
  return salida;
}

/** "12 sep, 15:30", en hora de Chile. Si no es una fecha, devuelve el texto tal cual. */
export function fechaHoraCorta(valor: string | null | undefined): string {
  if (!valor) return "—";
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) return String(valor);
  const partes = new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(f);
  return partes.replace(".", "").replace(",", ",");
}
