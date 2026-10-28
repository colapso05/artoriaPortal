import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, Send, CheckCheck, Bot, User, StickyNote, Terminal,
  Ticket as TicketIcon, RotateCcw, ArrowLeft, Zap, CheckCircle2,
} from "lucide-react";

/**
 * Demo pública del agente, para que una empresa vea de qué es capaz.
 *
 * Tres paneles a la vez, y el tercero es el que vende: cualquiera muestra un bot
 * que contesta bonito, pero mostrar las consultas a los sistemas —qué mandó, qué
 * le respondieron y desde qué sistema— es lo que le prueba a un ISP que esto se
 * enchufa con lo suyo.
 *
 * La empresa es ficticia (TuISP) y los clientes también, pero los RUT tienen
 * dígito verificador válido y cada uno arrastra un caso distinto: con deuda,
 * suspendido, equipo caído, mudanza. Un catálogo de casos redondos es lo que hace
 * que una demo se sienta un sistema y no una maqueta.
 */

const ENDPOINT = "https://bot.artoria.cl/webhook/artoria-demo";

type Quien = "cliente" | "agente" | "operador";

/**
 * Una línea de la conversación.
 *
 * La nota privada vive en el mismo hilo y no en una lista aparte porque importa
 * *cuándo* se escribió: una nota al final de un caso dice algo distinto que la
 * misma nota antes de la primera respuesta.
 */
interface Mensaje { quien: Quien; texto: string; hora: string; privada?: boolean; }
interface PasoTraza {
  sistema?: string; herramienta: string; entrada: string; salida: string; turno: number;
}
interface Contacto {
  cliente?: string; rut?: string; n_cliente?: string | number; plan?: string;
  cuenta?: string; deuda?: string | number; situacion?: string; equipo?: string;
}
interface Respuesta {
  respuesta?: string; categoria?: string; prioridad?: string; etiquetas?: string[];
  asignada_a?: string; estado?: string; derivado?: boolean; ticket?: string | null;
  reinicio?: boolean; contacto?: Contacto;
  traza?: { sistema?: string; herramienta: string; entrada: string; salida: string }[];
}

/**
 * Cada botón es un cliente con su situación.
 *
 * El RUT va dentro del mensaje a propósito: si el botón dijera solo "no tengo
 * internet", el agente pediría el RUT y el que está evaluando tendría que
 * adivinar uno que exista. Con el RUT puesto, el primer clic ya muestra al agente
 * entrando a los sistemas, que es lo único que hay que mostrar.
 */
const CASOS: { etiqueta: string; quien: string; mensaje: string }[] = [
  { etiqueta: "¿Cuánto debo?", quien: "Matías Fuentes · 1 boleta vencida",
    mensaje: "buenas, quiero saber cuánto debo. mi rut es 20.938.174-5" },
  { etiqueta: "Internet lento", quien: "Camila Herrera · reinicio remoto",
    mensaje: "hola, mi rut es 16.245.879-5 y el internet está lentísimo desde ayer" },
  { etiqueta: "Pagué y sigo cortado", quien: "Rodrigo Peña · suspendido",
    mensaje: "pagué y sigo sin servicio, mi rut es 13.890.452-K" },
  { etiqueta: "No tengo internet", quien: "Valentina Ríos · deriva a técnico",
    mensaje: "mi rut es 19.467.233-K, llevo 2 días sin internet y ya estoy harta" },
  { etiqueta: "Quiero agregar TV", quien: "Jorge Salinas · ventas",
    mensaje: "hola, mi rut es 15.208.741-1 y quiero agregar TV a mi plan" },
  { etiqueta: "Me cambio de casa", quien: "Fernanda Bustos · factibilidad",
    mensaje: "me cambio de dirección este mes, mi rut es 21.360.985-8" },
  { etiqueta: "Olvidé la clave del wifi", quien: "Antonia Vega · soporte",
    mensaje: "hola, no me acuerdo la clave del wifi. mi rut es 17.509.833-0" },
  { etiqueta: "Un RUT que no existe", quien: "cómo responde al error",
    mensaje: "hola, mi rut es 12.345.678-5 y no tengo internet" },
];

const ahora = () =>
  new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * El texto de una entrada o salida de la traza, sin el envoltorio.
 *
 * Llegan serializadas (`{"input":"20938174-5"}`). Mostrarlas crudas llena de
 * llaves justo el panel que tiene que convencer. Si no reconoce la forma, se
 * muestra tal cual: un texto raro se entiende mejor que un hueco.
 */
type Legible = { texto: string } | { pares: [string, string][] };

function legible(bruto: string): Legible {
  const s = (bruto ?? "").trim();
  if (!s) return { texto: "" };
  try {
    const v = JSON.parse(s);
    const uno = Array.isArray(v) ? v[0] : v;
    if (typeof uno === "string") return { texto: uno };
    if (uno && typeof uno === "object") {
      for (const k of ["response", "input", "output", "result", "texto"]) {
        if (typeof (uno as any)[k] === "string") return { texto: (uno as any)[k] };
      }
      /*
       * La ficha del cliente llega como objeto entero, sin un campo de texto.
       * Volcada como JSON se lee como un error de sistema justo en el panel que
       * tiene que dar confianza; en filas clave/valor se lee como una consulta.
       */
      const pares = Object.entries(uno)
        .filter(([, val]) => val != null && val !== "")
        .map(([k, val]) => [
          k.replace(/_/g, " "),
          typeof val === "boolean" ? (val ? "sí" : "no") : String(val),
        ] as [string, string]);
      if (pares.length) return { pares };
    }
  } catch { /* no era JSON */ }
  return { texto: s };
}

/** Una entrada o salida de la traza, ya legible. */
function Volcado({ bruto, tono }: { bruto: string; tono: string }) {
  const l = legible(bruto);
  if ("texto" in l) {
    return <p className={`text-[11px] font-mono ${tono} break-words leading-relaxed whitespace-pre-wrap`}>{l.texto}</p>;
  }
  return (
    <div className="space-y-0.5">
      {l.pares.map(([k, v]) => (
        <div key={k} className="flex gap-1.5 items-baseline">
          <span className="text-[10px] font-mono text-white/30 flex-shrink-0">{k}</span>
          <span className={`text-[11px] font-mono ${tono} break-words min-w-0`}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Quién tiene la conversación.
 *
 * El agente todavía se identifica como "Sofia · Agente IA" en `asignada_a` —queda
 * del prompt anterior—, y el asistente es ARTORIA. El nombre es marca, no dato, así
 * que acá se normaliza; cuando el caso queda con una persona, se muestra tal cual
 * viene, que ahí sí es información.
 */
function asignadaA(valor?: string): string {
  const v = (valor ?? "").trim();
  if (!v || /sofia|sofía|agente\s*ia/i.test(v)) return "ARTORIA · Asistente virtual";
  return v;
}

const TONO_PRIORIDAD: Record<string, string> = {
  alta: "text-rose-400 border-rose-400/40 bg-rose-400/10",
  media: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  baja: "text-sky-400 border-sky-400/40 bg-sky-400/10",
};

const Chip = ({ children, clase = "" }: { children: React.ReactNode; clase?: string }) => (
  <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded border ${
    clase || "text-white/65 border-white/15 bg-white/[0.04]"}`}>
    {children}
  </span>
);

/* ── Panel 1: el WhatsApp del cliente ─────────────────────────────────────── */

function PanelWhatsApp({ mensajes, escribiendo, texto, setTexto, enviar, ocupado }: {
  mensajes: Mensaje[]; escribiendo: boolean; texto: string;
  setTexto: (v: string) => void; enviar: (m: string) => void; ocupado: boolean;
}) {
  const fin = useRef<HTMLDivElement | null>(null);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes, escribiendo]);

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden border border-white/10 bg-[#fcf5eb] shadow-2xl h-full">
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-black/[0.08] flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500/25 to-violet-500/5 flex items-center justify-center text-[11px] font-black text-violet-700">
          TI
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#1c1e21] leading-tight">TuISP</p>
          <p className="text-[11px] text-[#5e5e5e] leading-tight">en línea</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-[#25d366]">
          <span className="w-2 h-2 rounded-full bg-[#25d366]" /> WhatsApp
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 min-h-0">
        <p className="text-center">
          <span className="inline-block text-[10.5px] text-[#5e5e5e] bg-white/80 rounded-full px-2.5 py-1">hoy</span>
        </p>

        {mensajes.length === 0 && (
          <p className="text-[12px] text-[#5e5e5e] text-center px-6 pt-6 leading-relaxed">
            Escribile como si fueras un cliente de TuISP.
            Elegí uno de los casos de abajo o inventá el tuyo.
          </p>
        )}

        {/* La nota privada no sale acá: el cliente nunca la ve. */}
        {mensajes.filter((m) => !m.privada).map((m, i) => (
          <div key={i} className={`flex ${m.quien === "cliente" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 shadow-sm ${
              m.quien === "cliente" ? "bg-[#e6ffda]" : "bg-white"}`}>
              <p className="text-[13px] text-[#1c1e21] leading-relaxed whitespace-pre-wrap break-words">{m.texto}</p>
              <p className="text-[10px] text-[#5e5e5e] text-right mt-0.5 flex items-center justify-end gap-0.5">
                {m.hora}
                {m.quien === "cliente" && <CheckCheck className="w-3 h-3 text-[#53bdeb]" />}
              </p>
            </div>
          </div>
        ))}

        {escribiendo && (
          <div className="flex justify-start">
            <div className="bg-white rounded-xl px-3 py-2.5 shadow-sm flex items-center gap-1">
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-[#9aa0a6] animate-bounce"
                  style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={fin} />
      </div>

      {/* Los casos viven acá, junto al teclado: es donde el visitante actúa. */}
      <div className="flex-shrink-0 border-t border-black/[0.07] bg-white/70 px-2.5 py-2.5">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {CASOS.map((c) => (
            <button
              key={c.etiqueta}
              onClick={() => enviar(c.mensaje)}
              disabled={ocupado}
              title={c.quien}
              className="rounded-full border border-black/10 bg-white hover:border-violet-400 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2.5 py-1 text-[11px] font-medium text-[#1c1e21]"
            >
              {c.etiqueta}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); enviar(texto); }}
          className="flex items-center gap-2"
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={ocupado}
            placeholder="Escribí un mensaje"
            className="flex-1 min-w-0 rounded-full bg-white border border-black/10 focus:border-violet-400 focus:outline-none px-3.5 py-2 text-[13px] text-[#1c1e21] placeholder:text-[#9aa0a6] transition-colors"
          />
          <button
            type="submit"
            disabled={ocupado || !texto.trim()}
            className="flex-shrink-0 w-9 h-9 rounded-full bg-[#25d366] hover:bg-[#1fb855] disabled:opacity-35 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-white"
          >
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Panel 2: la bandeja del operador ─────────────────────────────────────── */

function Dato({ k, v, tono = "" }: { k: string; v: React.ReactNode; tono?: string }) {
  return (
    <div className="flex items-baseline gap-2 justify-between">
      <span className="text-[10.5px] text-white/35 flex-shrink-0">{k}</span>
      <span className={`text-[11.5px] font-semibold text-right break-words min-w-0 ${tono || "text-white/80"}`}>{v}</span>
    </div>
  );
}

function PanelOperador({ mensajes, d, modo, setModo, textoOperador, setTextoOperador, enviarComoOperador }: {
  mensajes: Mensaje[]; d: Respuesta;
  modo: "cliente" | "nota"; setModo: (m: "cliente" | "nota") => void;
  textoOperador: string; setTextoOperador: (v: string) => void;
  enviarComoOperador: () => void;
}) {
  const fin = useRef<HTMLDivElement | null>(null);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes]);

  const c = d.contacto ?? {};
  const derivado = !!(d.derivado || d.ticket);
  const iniciales = (c.cliente ?? "").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("") || "?";

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden border border-white/10 bg-[#151718] h-full">
      <div className="flex items-center gap-3 px-4 py-3 bg-[#1d2022] border-b border-white/[0.07] flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-white/[0.07] flex items-center justify-center text-[11px] font-bold text-white/70">
          {c.cliente ? iniciales : <User className="w-4 h-4 text-white/35" />}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white/90 leading-tight truncate">
            {c.cliente || "+56 9 8765 4321"}
          </p>
          <p className="text-[11px] text-white/40 leading-tight">WhatsApp · TuISP</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {d.estado && (
            <Chip clase={derivado
              ? "text-amber-400 border-amber-400/40 bg-amber-400/10"
              : "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"}>
              {d.estado}
            </Chip>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-300">
            <Bot className="w-3.5 h-3.5" /> ARTORIA
          </span>
        </div>
      </div>

      {/* Lo que el agente dedujo del caso, antes de que lo mire una persona. */}
      {(d.categoria || d.prioridad) && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.07] bg-white/[0.015] flex-wrap flex-shrink-0">
          <span className="text-[10.5px] text-white/35">Caso clasificado como</span>
          {d.categoria && <Chip clase="text-sky-300 border-sky-400/30 bg-sky-400/10">{d.categoria}</Chip>}
          {d.prioridad && <Chip clase={TONO_PRIORIDAD[d.prioridad] ?? ""}>Prioridad {d.prioridad}</Chip>}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_200px] lg:grid-rows-[minmax(0,1fr)_auto] min-h-0">
        <div className="overflow-y-auto px-4 py-4 space-y-2.5 min-h-0">
          {mensajes.length === 0 && (
            <p className="text-[12px] text-white/35 text-center px-6 pt-8 leading-relaxed">
              Así ve el operador la conversación: los mensajes del cliente, lo que responde
              el agente, las notas internas de cada gestión y el momento en que el caso pasa
              a una persona.
            </p>
          )}

          {mensajes.map((m, i) => {
            if (m.privada) {
              return (
                <div key={i} className="rounded-lg border-l-[3px] border-[#f0c454] bg-[#f0c454]/[0.08] px-3 py-2">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-[#f0c454] flex items-center gap-1.5 mb-0.5">
                    <StickyNote className="w-3 h-3" /> Nota del operador · {m.hora}
                  </p>
                  <p className="text-[12px] text-white/80 leading-relaxed whitespace-pre-wrap break-words">{m.texto}</p>
                </div>
              );
            }
            const mio = m.quien !== "cliente";
            return (
              <div key={i} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%]">
                  <p className={`text-[9.5px] font-bold uppercase tracking-wider mb-1 ${
                    mio ? "text-right" : "text-white/30"} ${
                    m.quien === "agente" ? "text-violet-300/70" : m.quien === "operador" ? "text-emerald-300/70" : ""}`}>
                    {m.quien === "agente" ? "ARTORIA · Asistente virtual"
                      : m.quien === "operador" ? "Vos · Operador"
                      : "Cliente · WhatsApp"}
                  </p>
                  {/* El operador en verde: en un caso mixto hay que poder ver de un
                      golpe qué contestó la IA y qué contestó una persona. */}
                  <div className={`rounded-xl px-3 py-2 ${
                    m.quien === "agente" ? "bg-[#1f6fd0]" : m.quien === "operador" ? "bg-emerald-700" : "bg-[#2b3033]"}`}>
                    <p className="text-[12.5px] text-white/95 leading-relaxed whitespace-pre-wrap break-words">{m.texto}</p>
                  </div>
                  <p className={`text-[10px] text-white/30 mt-0.5 ${mio ? "text-right" : ""}`}>{m.hora}</p>
                </div>
              </div>
            );
          })}

          {d.reinicio && (
            <p className="text-center">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] text-emerald-300/80 bg-emerald-400/[0.08] border border-emerald-400/20 rounded-full px-2.5 py-1">
                <Zap className="w-3 h-3" /> El agente reinició el equipo desde la central
              </span>
            </p>
          )}

          {!!d.etiquetas?.length && (
            <p className="text-center">
              <span className="inline-block text-[10.5px] text-white/40 bg-white/[0.04] border border-white/10 rounded-full px-2.5 py-1">
                Etiquetas aplicadas por el agente: {d.etiquetas.join(" · ")}
              </span>
            </p>
          )}

          {/*
           * La nota interna es el momento que más le importa a quien evalúa:
           * muestra que la derivación deja rastro y no es un "hablá con un humano"
           * tirado al vacío.
           */}
          {derivado && (
            <div className="rounded-lg border-l-[3px] border-[#f0c454] bg-[#f0c454]/[0.08] px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#f0c454] flex items-center gap-1.5 mb-1">
                <StickyNote className="w-3 h-3" /> Nota interna · automática
              </p>
              <p className="text-[12px] text-white/75 leading-relaxed">
                El caso pasó a una persona
                {d.ticket && <> con el ticket <strong className="text-white/90">{d.ticket}</strong></>},
                con todo el contexto de la conversación ya cargado.
              </p>
            </div>
          )}
          <div ref={fin} />
        </div>

        {/* El teclado del operador: lo que hace creíble que una persona puede entrar. */}
        <div className="border-t border-white/[0.07] bg-[#1d2022] px-3 py-2.5 lg:col-start-1 lg:row-start-2">
          <div className="flex gap-1.5 mb-2">
            {([["cliente", "Responder al cliente"], ["nota", "Nota privada"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setModo(id)}
                className={`text-[11.5px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                  modo === id
                    ? id === "nota"
                      ? "border-[#f0c454]/50 bg-[#f0c454]/15 text-[#f0c454]"
                      : "border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
                    : "border-white/10 text-white/45 hover:text-white/70"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); enviarComoOperador(); }} className="flex items-center gap-2">
            <input
              value={textoOperador}
              onChange={(e) => setTextoOperador(e.target.value)}
              placeholder={modo === "nota" ? "Nota que solo ve el equipo…" : "Responde como operador…"}
              className={`flex-1 min-w-0 rounded-lg bg-white/[0.04] border px-3 py-2 text-[12.5px] placeholder:text-white/25 focus:outline-none transition-colors ${
                modo === "nota" ? "border-[#f0c454]/30 focus:border-[#f0c454]/60" : "border-white/10 focus:border-emerald-400/50"}`}
            />
            <button
              type="submit"
              disabled={!textoOperador.trim()}
              className="flex-shrink-0 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-3.5 py-2 text-[12.5px] font-bold text-white/80"
            >
              Enviar
            </button>
          </form>
        </div>

        {/* La ficha: lo que el operador tiene al lado sin buscar en otro sistema. */}
        <aside className="border-t lg:border-t-0 lg:border-l border-white/[0.07] px-3 py-3 space-y-3 overflow-y-auto min-h-0 lg:row-span-2 lg:col-start-2 lg:row-start-1">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/30 mb-1.5">Contacto</p>
            {c.cliente ? (
              <div className="space-y-1">
                <Dato k="Cliente" v={c.cliente} />
                {c.rut && <Dato k="RUT" v={c.rut} />}
                {c.n_cliente != null && <Dato k="N° cliente" v={String(c.n_cliente)} />}
                {c.plan && <Dato k="Plan" v={c.plan} />}
                {c.cuenta && <Dato k="Cuenta" v={c.cuenta} />}
                {c.deuda != null && c.deuda !== "" && (
                  <Dato k="Deuda" v={String(c.deuda)}
                    tono={String(c.deuda).replace(/[^0-9]/g, "") !== "" && String(c.deuda) !== "0" ? "text-amber-400" : ""} />
                )}
                {c.situacion && (() => {
                  /*
                   * El ámbar solo cuando hay algo que mirar. "Sin boletas
                   * pendientes" pintado de alerta dice lo contrario de lo que dice
                   * el texto, y el operador frena por nada.
                   */
                  const mala = /vencid|suspend|cort|deuda|moroso|pendiente[s]?\b(?!.*sin)/i.test(c.situacion)
                    && !/^sin /i.test(c.situacion.trim());
                  return (
                    <Dato k="Situación" v={
                      <span className="inline-flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${mala ? "bg-amber-400" : "bg-emerald-400"}`} />
                        {c.situacion}
                      </span>
                    } tono={mala ? "text-amber-400" : "text-emerald-400/90"} />
                  );
                })()}
                {c.equipo && <Dato k="Equipo" v={c.equipo} />}
              </div>
            ) : (
              <p className="text-[11.5px] text-white/30">sin identificar</p>
            )}
          </div>

          <div className="pt-2.5 border-t border-white/[0.07]">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/30 mb-1.5">Conversación</p>
            <div className="space-y-1">
              <Dato k="Asignada a" v={asignadaA(d.asignada_a)} tono="text-violet-300" />
              <Dato k="Prioridad" v={d.prioridad || "sin definir"} />
              <Dato k="Estado" v={d.estado || "abierta"} />
              {d.ticket && (
                <Dato k="Ticket" v={
                  <span className="inline-flex items-center gap-1"><TicketIcon className="w-3 h-3" />{d.ticket}</span>
                } />
              )}
            </div>
            {!!d.etiquetas?.length && (
              <div className="flex flex-wrap gap-1 mt-2">
                {d.etiquetas.map((e) => <Chip key={e}>{e}</Chip>)}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ── Panel 3: los sistemas ────────────────────────────────────────────────── */

function PanelSistemas({ traza, consultando }: { traza: PasoTraza[]; consultando: boolean }) {
  const fin = useRef<HTMLDivElement | null>(null);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth" }); }, [traza, consultando]);

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden border border-white/10 bg-[#0d0f12] h-full">
      <div className="px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
        <p className="text-[12px] font-bold text-white/85 flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-violet-400" /> Sistemas de TuISP
        </p>
        <p className="text-[10.5px] text-white/35 leading-relaxed mt-0.5">
          Cada gestión que hace el agente aparece acá en el momento, con lo que envió
          y lo que recibió de vuelta.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {traza.length === 0 && !consultando && (
          <p className="text-[11.5px] text-white/30 text-center px-5 pt-8 leading-relaxed">
            Todavía no hizo ninguna gestión. Apenas le des un RUT, acá vas a ver
            al agente entrando a los sistemas.
          </p>
        )}

        {traza.map((p, i) => {
          const nuevoTurno = i === 0 || traza[i - 1].turno !== p.turno;
          return (
            <div key={i}>
              {nuevoTurno && (
                <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/20 text-center my-2.5">
                  turno {p.turno}
                </p>
              )}
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                <div className="px-2.5 pt-2 pb-1.5 bg-violet-500/[0.07] border-b border-white/[0.06]">
                  {p.sistema && (
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-300/60 mb-0.5">
                      {p.sistema}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                    <p className="text-[11.5px] font-bold text-violet-200 font-mono truncate">{p.herramienta}</p>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400/70 ml-auto flex-shrink-0" />
                  </div>
                </div>
                <div className="px-2.5 py-2 space-y-1.5">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-white/25 mb-0.5">Envió</p>
                    <Volcado bruto={p.entrada} tono="text-sky-300/80" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-white/25 mb-0.5">Recibió</p>
                    <Volcado bruto={p.salida} tono="text-emerald-300/80" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {consultando && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
            <p className="text-[11px] text-white/40">consultando los sistemas…</p>
          </div>
        )}
        <div ref={fin} />
      </div>
    </div>
  );
}

/* ── La página ────────────────────────────────────────────────────────────── */

export default function Demo() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [traza, setTraza] = useState<PasoTraza[]>([]);
  const [caso, setCaso] = useState<Respuesta>({});
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelMovil, setPanelMovil] = useState<"wa" | "op" | "sis">("wa");
  const [modo, setModo] = useState<"cliente" | "nota">("cliente");
  const [textoOperador, setTextoOperador] = useState("");
  const [semilla, setSemilla] = useState(0);
  const turno = useRef(0);

  /** Una sesión por visitante: el agente recuerda el hilo y no se mezcla con otro. */
  const sesion = useMemo(
    () => `web-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    [semilla],
  );

  const reiniciar = () => {
    setMensajes([]); setTraza([]); setCaso({}); setTexto(""); setError(null);
    setTextoOperador(""); setModo("cliente");
    turno.current = 0;
    setSemilla((s) => s + 1);
  };

  const enviar = async (mensaje: string) => {
    const limpio = mensaje.trim();
    if (!limpio || enviando) return;

    setError(null);
    setTexto("");
    turno.current += 1;
    const miTurno = turno.current;
    setMensajes((m) => [...m, { quien: "cliente", texto: limpio, hora: ahora() }]);
    setEnviando(true);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesion, mensaje: limpio }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const crudo = await res.json();
      // Por si el webhook devuelve el objeto envuelto en un arreglo.
      const d: Respuesta = Array.isArray(crudo) ? crudo[0] ?? {} : crudo ?? {};

      if (Array.isArray(d.traza) && d.traza.length) {
        setTraza((t) => [...t, ...d.traza!.map((p) => ({ ...p, turno: miTurno }))]);
      }

      /*
       * El caso se acumula, no se reemplaza.
       *
       * La ficha del cliente llega en el turno en que se identifica y en los
       * siguientes puede venir vacía; pisándola, el panel del medio se vaciaba
       * solo a mitad de la conversación. Lo mismo con el ticket.
       */
      setCaso((prev) => ({
        ...prev,
        ...Object.fromEntries(Object.entries(d).filter(([, v]) =>
          v != null && v !== "" && !(Array.isArray(v) && v.length === 0))),
        contacto: { ...prev.contacto, ...(d.contacto ?? {}) },
        derivado: prev.derivado || !!d.derivado || !!d.ticket,
      }));

      setMensajes((m) => [...m, {
        quien: "agente",
        texto: d.respuesta?.trim() || "No pude responder eso. Probá de nuevo en unos segundos.",
        hora: ahora(),
      }]);
    } catch {
      /*
       * El error va como aviso y no como mensaje del agente: en una demo, una
       * falla de red escrita en el globo se lee como que el agente contestó mal,
       * que es la impresión opuesta a la que buscamos.
       */
      setError("No se pudo contactar al agente. Revisá la conexión y probá otra vez.");
    } finally {
      setEnviando(false);
    }
  };

  /*
   * El operador escribe y no pasa por el agente.
   *
   * A propósito: si una persona toma el caso, la IA no tiene que seguir
   * contestando encima. Acá eso es simulado —no hay WhatsApp de verdad del otro
   * lado— pero es el comportamiento que hay que mostrar, porque es lo que pasa en
   * el portal real cuando alguien se hace cargo.
   */
  const enviarComoOperador = () => {
    const limpio = textoOperador.trim();
    if (!limpio) return;
    setMensajes((m) => [...m, {
      quien: "operador", texto: limpio, hora: ahora(), privada: modo === "nota",
    }]);
    setTextoOperador("");
  };

  const paneles = [
    { id: "wa" as const, label: "Cliente" },
    { id: "op" as const, label: "Operador" },
    { id: "sis" as const, label: "Sistemas" },
  ];

  return (
    /*
     * Alto exacto, no mínimo.
     *
     * Con `min-h-screen` la página crecía con cada mensaje y había que desplazar
     * toda la pantalla para seguir escribiendo —se iban el teclado y los otros dos
     * paneles—. Fijando el alto, lo que se desplaza es el contenido de cada panel,
     * que es lo que uno espera de un chat. En pantallas chicas vuelve a ser una
     * página normal, porque ahí se muestra un panel por vez.
     */
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#08090b] text-white/90 flex flex-col">
      <header className="border-b border-white/[0.07] px-5 py-3 flex items-center gap-3 flex-wrap flex-shrink-0">
        <span className="text-[15px] font-black tracking-tight">
          ARTOR<span className="text-violet-400">IA</span>
        </span>
        <span className="w-px h-4 bg-white/15" />
        <span className="text-[12.5px] text-white/50">Asistente virtual · demo en vivo</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={reiniciar}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 hover:border-white/30 hover:bg-white/5 transition-colors px-2.5 py-1.5 text-[12px] font-semibold text-white/70"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Nueva conversación
          </button>
          <a href="/" className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 hover:border-white/30 hover:bg-white/5 transition-colors px-2.5 py-1.5 text-[12px] font-semibold text-white/70">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver
          </a>
        </div>
      </header>

      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-6 flex-wrap flex-shrink-0">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-violet-400 mb-1">
            TuISP · proveedor de internet
          </p>
          <h1 className="text-[28px] sm:text-[32px] font-black leading-none tracking-tight">
            Probá el asistente
          </h1>
        </div>
        <p className="text-[12.5px] text-white/45 leading-relaxed max-w-[620px]">
          TuISP es una empresa inventada y los clientes son de prueba: nadie tiene que darnos
          datos reales. A la izquierda, el WhatsApp del cliente. Al centro, la misma conversación
          como la ve el operador en su bandeja. A la derecha, cada gestión que ARTORIA ejecuta en
          los sistemas mientras responde.
        </p>
      </div>

      {error && <p className="px-5 pb-2 text-[11.5px] text-rose-400 flex-shrink-0">{error}</p>}

      {/* En pantallas chicas los tres paneles no entran al lado: se eligen. */}
      <div className="lg:hidden px-5 pb-3 flex-shrink-0">
        <div className="inline-flex rounded-lg border border-white/15 overflow-hidden text-[12px] font-bold">
          {paneles.map((p) => (
            <button key={p.id} onClick={() => setPanelMovil(p.id)}
              className={`px-3.5 py-1.5 transition-colors ${
                panelMovil === p.id ? "bg-violet-500 text-white" : "text-white/50 hover:bg-white/5"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/*
       * Alto fijo y cada panel con su propio desplazamiento.
       *
       * Con la página entera creciendo, el teclado del cliente terminaba abajo de
       * todo y había que bajar para escribir. Acá los tres paneles entran en la
       * pantalla y lo que se desplaza es el contenido de cada uno.
       */}
      <div className="flex-1 min-h-0 overflow-hidden px-5 pb-5 grid gap-4 lg:grid-cols-[minmax(330px,0.85fr)_minmax(0,1.5fr)_minmax(300px,0.9fr)]">
        <div className={`${panelMovil === "wa" ? "block" : "hidden"} lg:block h-[70vh] lg:h-auto lg:min-h-0 overflow-hidden`}>
          <PanelWhatsApp
            mensajes={mensajes} escribiendo={enviando} texto={texto}
            setTexto={setTexto} enviar={enviar} ocupado={enviando}
          />
        </div>
        <div className={`${panelMovil === "op" ? "block" : "hidden"} lg:block h-[70vh] lg:h-auto lg:min-h-0 overflow-hidden`}>
          <PanelOperador
            mensajes={mensajes} d={caso}
            modo={modo} setModo={setModo}
            textoOperador={textoOperador} setTextoOperador={setTextoOperador}
            enviarComoOperador={enviarComoOperador}
          />
        </div>
        <div className={`${panelMovil === "sis" ? "block" : "hidden"} lg:block h-[70vh] lg:h-auto lg:min-h-0 overflow-hidden`}>
          <PanelSistemas traza={traza} consultando={enviando} />
        </div>
      </div>
    </div>
  );
}
