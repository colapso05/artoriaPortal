import { useEffect, useState } from "react";
import {
  Loader2, RefreshCw, LogOut, MapPin, ChevronRight, CalendarCheck, Inbox,
  Sun, Moon, List, CalendarRange,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { TecnicoPushBanner } from "./TecnicoPushBanner";
import { TecnicoCronograma } from "./TecnicoCronograma";
import { estadoCita, formatHora, formatFechaCorta, esHoy, estaAtrasada, esEstaSemana } from "./estado";
import type { Tema } from "@/lib/tecnicos/tema";
import { cerradaSinVisita } from "@/lib/tecnicos/api";
import type { Appointment, Tecnico } from "@/lib/tecnicos/api";

type Rango = "todas" | "hoy" | "semana";
type Vista = "lista" | "cronograma";
const VISTA_KEY = "tec_vista_agenda";

interface GrupoDia {
  clave: string;
  titulo: string;
  etiqueta: string | null;
  citas: Appointment[];
}

/**
 * Parte la lista en días conservando el orden de entrada (la API ya devuelve
 * próximos ascendente e historial descendente).
 */
function agruparPorDia(citas: Appointment[]): GrupoDia[] {
  const mapa = new Map<string, Appointment[]>();
  for (const cita of citas) {
    const d = cita.start_datetime ? new Date(cita.start_datetime) : null;
    const clave = d && !isNaN(d.getTime()) ? d.toDateString() : "sin-fecha";
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave)!.push(cita);
  }

  const hoy = new Date();
  const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);

  return [...mapa.entries()].map(([clave, lista]) => {
    if (clave === "sin-fecha") {
      return { clave, titulo: "Sin fecha asignada", etiqueta: null, citas: lista };
    }
    const fecha = new Date(clave);
    let etiqueta: string | null = null;
    if (fecha.toDateString() === hoy.toDateString()) etiqueta = "Hoy";
    else if (fecha.toDateString() === manana.toDateString()) etiqueta = "Mañana";
    else if (fecha.toDateString() === ayer.toDateString()) etiqueta = "Ayer";

    const titulo = fecha.toLocaleDateString("es-CL", {
      weekday: "long", day: "numeric", month: "long",
    });
    return {
      clave,
      titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1),
      etiqueta,
      citas: lista,
    };
  });
}

/** Agenda del técnico: Próximos e Historial, en lista o en cronograma. */
export function TecnicoAgenda({
  tecnico,
  upcoming,
  past,
  loading,
  refreshing,
  onRefresh,
  onSelect,
  onLogout,
  forzarTab,
  tema,
  onAlternarTema,
}: {
  tecnico: Tecnico;
  upcoming: Appointment[];
  past: Appointment[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (a: Appointment) => void;
  onLogout: () => void;
  forzarTab?: "proximos" | "historial";
  tema: Tema;
  onAlternarTema: () => void;
}) {
  const [tab, setTab] = useState<"proximos" | "historial">("proximos");

  /*
   * Filtro por rango. El técnico llega con una pregunta concreta —"qué tengo hoy"—
   * y antes tenía que buscarla dentro de toda la lista, donde además se cuelan
   * citas viejas que quedaron pendientes.
   */
  const [rango, setRango] = useState<Rango>("todas");
  const listaBase = tab === "proximos" ? upcoming : past;

  const lista =
    rango === "hoy" ? listaBase.filter(a => esHoy(a.start_datetime))
    : rango === "semana" ? listaBase.filter(a => esEstaSemana(a.start_datetime))
    : listaBase;

  const conteos: Record<Rango, number> = {
    todas: listaBase.length,
    hoy: listaBase.filter(a => esHoy(a.start_datetime)).length,
    semana: listaBase.filter(a => esEstaSemana(a.start_datetime)).length,
  };

  const [vista, setVista] = useState<Vista>(() => {
    try { return localStorage.getItem(VISTA_KEY) === "cronograma" ? "cronograma" : "lista"; }
    catch { return "lista"; }
  });

  const cambiarVista = (v: Vista) => {
    setVista(v);
    try { localStorage.setItem(VISTA_KEY, v); } catch { /* noop */ }
  };

  // Durante el tour la pestaña la decide el recorrido, no el técnico. El tour
  // señala tarjetas concretas de la lista, así que la vista también se fija.
  useEffect(() => {
    if (forzarTab) setTab(forzarTab);
  }, [forzarTab]);
  const vistaEfectiva: Vista = forzarTab ? "lista" : vista;

  return (
    <div className="min-h-[100dvh] bg-[var(--tec-fondo)] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[var(--tec-fondo-velo)] backdrop-blur border-b border-[var(--tec-borde)] px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 h-16">
          <LogoMark size={30} idSuffix="-tec-agenda" />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-[var(--tec-texto)] leading-tight truncate">
              {tecnico.name || "Técnico"}
            </p>
            <p className="text-[11px] text-[var(--tec-texto-3)] leading-tight">Mi agenda</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onAlternarTema}
              className="w-10 h-10 rounded-xl bg-[var(--tec-superficie-2)] border border-[var(--tec-borde)] flex items-center justify-center text-[var(--tec-texto-2)] active:scale-95 transition-transform"
              aria-label={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {tema === "oscuro" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="w-10 h-10 rounded-xl bg-[var(--tec-superficie-2)] border border-[var(--tec-borde)] flex items-center justify-center text-[var(--tec-texto-2)] active:scale-95 transition-transform disabled:opacity-50"
              aria-label="Actualizar agenda"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onLogout}
              className="w-10 h-10 rounded-xl bg-[var(--tec-superficie-2)] border border-[var(--tec-borde)] flex items-center justify-center text-[var(--tec-texto-2)] active:scale-95 transition-transform"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pestañas + selector de vista */}
        <div className="flex gap-2 pb-3">
          {([
            { id: "proximos", label: "Próximos", count: upcoming.length },
            { id: "historial", label: "Historial", count: past.length },
          ] as const).map(t => (
            <button
              key={t.id}
              data-tour={t.id === "historial" ? "historial" : undefined}
              onClick={() => setTab(t.id)}
              className={`flex-1 min-w-0 h-10 rounded-xl text-[13px] font-bold transition-all border ${
                tab === t.id
                  ? "bg-[var(--tec-acento-suave)] border-[var(--tec-acento-borde)] text-[var(--tec-acento)]"
                  : "bg-[var(--tec-superficie-2)] border-[var(--tec-borde)] text-[var(--tec-texto-3)]"
              }`}
            >
              {t.label} {t.count > 0 && <span className="opacity-70">({t.count})</span>}
            </button>
          ))}

          <div className="flex gap-1 p-1 h-10 rounded-xl bg-[var(--tec-superficie-2)] border border-[var(--tec-borde)] flex-shrink-0">
            {([
              { id: "lista", Icono: List, etiqueta: "Ver como lista" },
              { id: "cronograma", Icono: CalendarRange, etiqueta: "Ver como cronograma" },
            ] as const).map(v => (
              <button
                key={v.id}
                onClick={() => cambiarVista(v.id)}
                aria-label={v.etiqueta}
                aria-pressed={vistaEfectiva === v.id}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  vistaEfectiva === v.id
                    ? "bg-[var(--tec-acento-suave)] text-[var(--tec-acento)]"
                    : "text-[var(--tec-texto-4)]"
                }`}
              >
                <v.Icono className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>

        {/* Filtro por rango — responde "qué tengo hoy" sin buscar en toda la lista */}
        <div className="flex gap-2 pb-3">
          {([
            { id: "todas", label: "Todas" },
            { id: "hoy", label: "Hoy" },
            { id: "semana", label: "Semana" },
          ] as const).map(r => (
            <button
              key={r.id}
              onClick={() => setRango(r.id)}
              aria-pressed={rango === r.id}
              className={`flex-1 min-w-0 h-9 rounded-xl text-[12px] font-bold transition-all border ${
                rango === r.id
                  ? "bg-[var(--tec-cian-suave)] border-[var(--tec-cian)] text-[var(--tec-cian)]"
                  : "bg-[var(--tec-superficie-2)] border-[var(--tec-borde)] text-[var(--tec-texto-3)]"
              }`}
            >
              {r.label} <span className="opacity-70">({conteos[r.id]})</span>
            </button>
          ))}
        </div>
      </header>

      {/* Lista */}
      <main className="flex-1 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <TecnicoPushBanner />
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--tec-acento)]" />
            <p className="text-[13px] text-[var(--tec-texto-3)]">Cargando tu agenda...</p>
          </div>
        ) : lista.length === 0 ? (
          (() => {
            /* El sticker celebra no tener trabajo por delante, así que solo tiene
               sentido en Próximos. En Historial un día vacío no es un día libre:
               es que no cerraste nada, y felicitarte por eso no cuadra. */
            const esProximos = tab === "proximos";
            const conSticker = esProximos && rango === "hoy";

            const titulo = esProximos
              ? rango === "hoy" ? "No tienes ningún trabajo cargado para hoy. Estás chill de cojones"
                : rango === "semana" ? "Nada esta semana"
                : "Sin trabajos pendientes"
              : rango === "hoy" ? "No cerraste ningún trabajo hoy"
                : rango === "semana" ? "No cerraste ningún trabajo esta semana"
                : "Sin trabajos completados";

            const subtitulo = rango !== "todas" && conteos.todas > 0
              ? esProximos
                ? `Tienes ${conteos.todas} pendientes en total — toca "Todas" para verlos.`
                : `Tienes ${conteos.todas} completados en total — toca "Todas" para verlos.`
              : esProximos
                ? "Cuando te asignen uno, aparecerá aquí."
                : "Los trabajos que cierres quedarán registrados aquí.";

            return (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                {/* Si el archivo del sticker falta, la imagen se oculta sola. */}
                {conSticker ? (
                  <img
                    src="/tec-chill.png"
                    alt=""
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    className="w-44 h-44 object-cover rounded-3xl border-4 border-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] -rotate-3 mb-1"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-[var(--tec-superficie-2)] border border-[var(--tec-borde)] flex items-center justify-center">
                    {esProximos ? <Inbox className="w-6 h-6 text-[var(--tec-texto-4)]" /> : <CalendarCheck className="w-6 h-6 text-[var(--tec-texto-4)]" />}
                  </div>
                )}
                <div>
                  <p className={conSticker
                    ? "text-[17px] font-bold text-[var(--tec-texto)] leading-snug max-w-[16rem] mx-auto"
                    : "text-[14px] font-semibold text-[var(--tec-texto-2)]"}>
                    {titulo}
                  </p>
                  {/* Con un filtro puesto, el vacío puede ser del filtro y no de la agenda:
                      decirlo evita que el técnico crea que no tiene trabajo asignado. */}
                  <p className="text-[12px] text-[var(--tec-texto-4)] mt-1">{subtitulo}</p>
                </div>
              </div>
            );
          })()
        ) : vistaEfectiva === "cronograma" ? (
          <TecnicoCronograma
            citas={lista}
            onSelect={onSelect}
            orden={tab === "proximos" ? "asc" : "desc"}
          />
        ) : (
          // La lista se agrupa por día: corrida, no se distingue dónde termina
          // una jornada y empieza la siguiente.
          <div className="space-y-5">
            {agruparPorDia(lista).map(grupo => (
              <section key={grupo.clave}>
                <div className="flex items-center gap-2 mb-2.5">
                  <p className="text-[13px] font-bold text-[var(--tec-texto)]">
                    {grupo.titulo}
                  </p>
                  {grupo.etiqueta && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--tec-cian-suave)] text-[var(--tec-cian)]">
                      {grupo.etiqueta}
                    </span>
                  )}
                  <div className="flex-1 h-px bg-[var(--tec-borde)]" />
                  <span className="text-[11px] font-medium text-[var(--tec-texto-4)]">
                    {grupo.citas.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {grupo.citas.map(appt => {
                    const est = estadoCita(appt.status);
                    const hoy = esHoy(appt.start_datetime);
                    const atrasada = tab === "proximos" && estaAtrasada(appt.start_datetime);
                    /* En el historial, distinguir el trabajo que el técnico hizo de las
                       citas que el sistema cerró al resolverse el ticket —muchas por
                       teléfono, sin visita—. Sin esto, el técnico ve como suyos trabajos
                       en los que nunca estuvo. */
                    const sinVisita = tab === "historial" && cerradaSinVisita(appt);
                    const esPrimera = appt.id === lista[0]?.id;
                    return (
                      <button
                        key={appt.id}
                        data-tour={esPrimera && tab === "proximos" ? "tarjeta" : undefined}
                        onClick={() => onSelect(appt)}
                        className={`w-full text-left rounded-2xl border bg-[var(--tec-superficie)] p-4 active:scale-[0.99] transition-transform ${
                          hoy && tab === "proximos" ? "border-[var(--tec-acento-borde)]" : "border-[var(--tec-borde)]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span
                                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md"
                                style={{ color: est.color, backgroundColor: est.bg }}
                              >
                                {est.label}
                              </span>
                              {atrasada && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md text-[var(--tec-aviso)] bg-[var(--tec-aviso-suave)] border border-[var(--tec-aviso-borde)]">
                                  Fecha pasada
                                </span>
                              )}
                              {sinVisita && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md text-[var(--tec-texto-3)] bg-[var(--tec-superficie-2)] border border-dashed border-[var(--tec-borde)]">
                                  Cerrada sin visita
                                </span>
                              )}
                            </div>

                            <p className="text-[15px] font-bold text-[var(--tec-texto)] leading-tight truncate">
                              {appt.service_type || "Servicio"}
                            </p>
                            <p className="text-[13px] text-[var(--tec-texto-2)] leading-tight truncate mt-0.5">
                              {appt.client_name || "Cliente"}
                            </p>

                            {appt.client_address && (
                              <p className="text-[12px] text-[var(--tec-texto-3)] leading-snug mt-1.5 flex items-start gap-1.5">
                                <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                <span className="truncate">{appt.client_address}</span>
                              </p>
                            )}

                          </div>

                          {/* La hora ocupa el hueco de la derecha y va en grande a
                              propósito: un técnico leyó mal una cita porque el dato
                              más importante de la tarjeta era el más pequeño. */}
                          <div className="flex flex-col items-end flex-shrink-0 pl-1">
                            <p className={`text-[26px] font-black leading-none tabular-nums ${
                              hoy && tab === "proximos" ? "text-[var(--tec-acento)]" : "text-[var(--tec-texto)]"
                            }`}>
                              {formatHora(appt.start_datetime)}
                            </p>
                            <p className="text-[12px] font-semibold text-[var(--tec-texto-2)] mt-1 whitespace-nowrap">
                              {formatFechaCorta(appt.start_datetime)}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[var(--tec-texto-4)] flex-shrink-0 mt-1.5" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default TecnicoAgenda;
