import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { estadoCita, formatHora } from "./estado";
import type { Appointment } from "@/lib/tecnicos/api";

/**
 * Cronograma horizontal: una fila por día, las horas avanzando hacia la derecha.
 *
 * Misma lectura que la agenda del operador, pero donde allá cada fila es un
 * técnico, aquí cada fila es un día. Eso es lo que resuelve: con la fecha fija
 * en la columna izquierda no hay manera de confundir qué trabajo es de hoy y
 * cuál de mañana, que en una lista corrida se pierde.
 */

const PX_HORA = 112;        // ancho de una hora
const ANCHO_MIN_BLOQUE = 58;
const ALTO_FILA = 116;      // 3 días llenan la pantalla de un teléfono
const ANCHO_FECHAS = 66;    // columna fija de la izquierda
const ALTO_CABECERA = 28;
const COLA = 52;            // aire al final, para que quepa la última hora
const DURACION_DEFECTO = 60;

interface Bloque {
  cita: Appointment;
  desde: number; // minutos desde medianoche
  hasta: number;
}

interface Dia {
  clave: string;
  fecha: Date | null;
  bloques: Bloque[];
  sinHora: Appointment[];
}

const minutosDelDia = (d: Date) => d.getHours() * 60 + d.getMinutes();

function duracionDe(a: Appointment): number {
  const d = a.duration_minutes;
  return d && d > 0 ? d : DURACION_DEFECTO;
}

function duracionLegible(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}

function agrupar(citas: Appointment[], orden: "asc" | "desc") {
  const mapa = new Map<string, Dia>();

  for (const cita of citas) {
    const d = cita.start_datetime ? new Date(cita.start_datetime) : null;
    const valida = d && !isNaN(d.getTime());
    const clave = valida ? d!.toDateString() : "sin-fecha";
    if (!mapa.has(clave)) {
      mapa.set(clave, { clave, fecha: valida ? d! : null, bloques: [], sinHora: [] });
    }
    const dia = mapa.get(clave)!;
    if (valida) {
      const desde = minutosDelDia(d!);
      dia.bloques.push({ cita, desde, hasta: desde + duracionDe(cita) });
    } else {
      dia.sinHora.push(cita);
    }
  }

  const dias = [...mapa.values()];
  for (const dia of dias) dia.bloques.sort((a, b) => a.desde - b.desde);

  dias.sort((a, b) => {
    if (!a.fecha) return 1;
    if (!b.fecha) return -1;
    const dif = a.fecha.getTime() - b.fecha.getTime();
    return orden === "asc" ? dif : -dif;
  });

  // Un único eje de horas para todas las filas: si cada día tuviera el suyo, las
  // columnas no coincidirían y la comparación entre días dejaría de servir.
  const todos = dias.flatMap(d => d.bloques);
  let inicio = 8;
  let fin = 18;
  if (todos.length > 0) {
    inicio = Math.floor(Math.min(...todos.map(b => b.desde)) / 60);
    fin = Math.ceil(Math.max(...todos.map(b => b.hasta)) / 60);
    if (fin - inicio < 4) fin = inicio + 4;
    if (fin > 24) { fin = 24; inicio = Math.max(0, fin - 4); }
  }

  return { dias, inicio, fin };
}

function etiquetaDia(dia: Dia): { arriba: string; abajo: string; destacado: boolean } {
  if (!dia.fecha) return { arriba: "Sin", abajo: "fecha", destacado: false };

  const hoy = new Date();
  const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
  const esHoy = dia.fecha.toDateString() === hoy.toDateString();
  const esManana = dia.fecha.toDateString() === manana.toDateString();

  if (esHoy) return { arriba: "HOY", abajo: dia.fecha.toLocaleDateString("es-CL", { day: "numeric", month: "short" }), destacado: true };
  if (esManana) return { arriba: "MAÑANA", abajo: dia.fecha.toLocaleDateString("es-CL", { day: "numeric", month: "short" }), destacado: true };

  const diaSemana = dia.fecha.toLocaleDateString("es-CL", { weekday: "short" }).replace(".", "");
  return {
    arriba: diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1),
    abajo: dia.fecha.toLocaleDateString("es-CL", { day: "numeric", month: "short" }),
    destacado: false,
  };
}

export function TecnicoCronograma({
  citas,
  onSelect,
  orden = "asc",
}: {
  citas: Appointment[];
  onSelect: (a: Appointment) => void;
  orden?: "asc" | "desc";
}) {
  const { dias, inicio, fin } = useMemo(() => agrupar(citas, orden), [citas, orden]);
  const horas = fin - inicio;
  // La cola deja sitio al rótulo de la hora de cierre: sin ella, la última
  // etiqueta del eje caía fuera de la pista y no se dibujaba.
  const anchoPista = horas * PX_HORA + COLA;
  const origen = inicio * 60;

  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const cronometro = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(cronometro);
  }, []);

  // Al abrir, dejar a la vista la primera cita en vez del extremo izquierdo.
  const pista = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const primera = dias[0]?.bloques[0];
    if (!primera || !pista.current) return;
    pista.current.scrollLeft = Math.max(0, ((primera.desde - origen) / 60) * PX_HORA - 24);
  }, [dias, origen]);

  const minutosAhora = minutosDelDia(ahora);
  const ahoraVisible = minutosAhora >= origen && minutosAhora <= fin * 60;

  return (
    <div className="rounded-2xl border border-[var(--tec-borde)] bg-[var(--tec-superficie)] overflow-hidden">
      <div className="flex">
        {/* Columna fija de días */}
        <div
          className="flex-shrink-0 border-r border-[var(--tec-borde)] bg-[var(--tec-superficie)] z-10"
          style={{ width: ANCHO_FECHAS }}
        >
          <div style={{ height: ALTO_CABECERA }} className="border-b border-[var(--tec-borde)]" />
          {dias.map(dia => {
            const et = etiquetaDia(dia);
            const esHoy = dia.fecha?.toDateString() === ahora.toDateString();
            return (
              <div
                key={dia.clave}
                style={{
                  height: ALTO_FILA,
                  // Contorno de acento en vez de relleno: un fondo distinto se
                  // leía como un estado de la cita, no como "esta fila es hoy".
                  // Mismo grosor y color que el borde de la tarjeta de hoy en la
                  // lista — 1px translúcido, no una banda.
                  boxShadow: esHoy
                    ? "inset 0 1px 0 var(--tec-acento-borde), inset 0 -1px 0 var(--tec-acento-borde), inset 1px 0 0 var(--tec-acento-borde)"
                    : undefined,
                }}
                className="border-b border-[var(--tec-borde)] last:border-b-0 flex flex-col items-center justify-center"
              >
                <span
                  className={`text-[10.5px] font-bold uppercase tracking-wide leading-tight ${
                    et.destacado ? "text-[var(--tec-acento)]" : "text-[var(--tec-texto-3)]"
                  }`}
                >
                  {et.arriba}
                </span>
                <span className="text-[13px] font-bold text-[var(--tec-texto)] leading-tight mt-0.5">
                  {et.abajo}
                </span>
              </div>
            );
          })}
        </div>

        {/* Pista con scroll horizontal */}
        <div ref={pista} className="flex-1 overflow-x-auto no-scrollbar">
          <div style={{ width: anchoPista }} className="relative">
            {/* Cabecera de horas */}
            <div
              style={{ height: ALTO_CABECERA }}
              className="relative border-b border-[var(--tec-borde)]"
            >
              {Array.from({ length: horas + 1 }, (_, i) => (
                <span
                  key={i}
                  className="absolute top-1.5 text-[10px] font-medium text-[var(--tec-texto-4)] tabular-nums"
                  style={{ left: i * PX_HORA + 6 }}
                >
                  {String(inicio + i).padStart(2, "0")}:00
                </span>
              ))}
            </div>

            {/* Línea de ahora, atravesando todas las filas */}
            {ahoraVisible && (
              <div
                className="absolute z-20 pointer-events-none w-px bg-[var(--tec-error)]"
                style={{
                  left: ((minutosAhora - origen) / 60) * PX_HORA,
                  top: ALTO_CABECERA,
                  height: dias.length * ALTO_FILA,
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--tec-error)] -ml-[3px] -mt-[3px]" />
              </div>
            )}

            {/* Filas */}
            {dias.map(dia => {
              const esHoy = dia.fecha?.toDateString() === ahora.toDateString();
              return (
                <div
                  key={dia.clave}
                  style={{
                    height: ALTO_FILA,
                    // El contorno continúa por toda la pista, así no se corta al
                    // desplazar horizontalmente.
                    boxShadow: esHoy
                      ? "inset 0 1px 0 var(--tec-acento-borde), inset 0 -1px 0 var(--tec-acento-borde)"
                      : undefined,
                  }}
                  className="relative border-b border-[var(--tec-borde)] last:border-b-0"
                >
                  {/* Separadores de hora */}
                  {Array.from({ length: horas + 1 }, (_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 w-px bg-[var(--tec-borde)] opacity-60"
                      style={{ left: i * PX_HORA }}
                    />
                  ))}

                  {/* Trabajos */}
                  {dia.bloques.map(b => {
                    const est = estadoCita(b.cita.status);
                    const ancho = Math.max(
                      ANCHO_MIN_BLOQUE,
                      ((b.hasta - b.desde) / 60) * PX_HORA
                    );
                    return (
                      <button
                        key={b.cita.id}
                        onClick={() => onSelect(b.cita)}
                        title={`${b.cita.service_type ?? "Servicio"} — ${b.cita.client_name ?? "Cliente"}`}
                        className="absolute top-2 rounded-lg overflow-hidden text-left active:scale-[0.98] transition-transform"
                        style={{
                          left: ((b.desde - origen) / 60) * PX_HORA + 2,
                          width: ancho - 4,
                          height: ALTO_FILA - 16,
                          backgroundColor: est.bg,
                          borderLeft: `3px solid ${est.color}`,
                        }}
                      >
                        <div className="px-2 py-1.5 h-full flex flex-col gap-0.5">
                          <p className="text-[10px] font-bold tabular-nums leading-tight" style={{ color: est.color }}>
                            {formatHora(b.cita.start_datetime)} · {duracionLegible(b.hasta - b.desde)}
                          </p>
                          <p className="text-[12px] font-bold text-[var(--tec-texto)] leading-tight truncate">
                            {b.cita.service_type || "Servicio"}
                          </p>
                          <p className="text-[11px] text-[var(--tec-texto-2)] leading-tight truncate">
                            {b.cita.client_name || "Cliente"}
                          </p>
                          {b.cita.client_address && ancho >= 100 && (
                            <p className="text-[10px] text-[var(--tec-texto-3)] leading-tight truncate mt-auto flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                              {b.cita.client_address}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {/* Sin hora: no se pueden ubicar en el eje, se avisan en la fila */}
                  {dia.sinHora.length > 0 && dia.bloques.length === 0 && (
                    <button
                      onClick={() => onSelect(dia.sinHora[0])}
                      className="absolute left-2 top-1.5 rounded-lg px-2.5 flex items-center"
                      style={{
                        height: ALTO_FILA - 12,
                        backgroundColor: "var(--tec-tono-gris-bg)",
                        borderLeft: "3px solid var(--tec-tono-gris)",
                      }}
                    >
                      <span className="text-[11px] font-bold text-[var(--tec-texto-2)]">
                        {dia.sinHora.length} sin hora
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pista de ayuda: el scroll horizontal no siempre es evidente en móvil */}
      {anchoPista > 260 && (
        <div className="px-3 py-1.5 border-t border-[var(--tec-borde)] bg-[var(--tec-superficie-2)]">
          <p className="text-[10.5px] text-[var(--tec-texto-4)] text-center">
            Desliza para ver el resto del día →
          </p>
        </div>
      )}
    </div>
  );
}

export default TecnicoCronograma;
