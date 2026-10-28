import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle, Camera, FileText, Image as ImageIcon, Loader2, Mic, Paperclip, Send, Trash2, X,
} from "lucide-react";
import { LogoMarca } from "./LogoMarca";
import { AdjuntoMensaje } from "./AdjuntoMensaje";
import { MediaLightbox, type LightboxMedia } from "@/components/ui/MediaLightbox";
import { useToast } from "@/hooks/use-toast";
import { useGrabadora } from "@/hooks/useGrabadora";
import { MARCA } from "@/lib/soporte/marca";
import {
  MAX_ARCHIVO_MB, etiquetaAdjunto, pesaDemasiado, pesoLegible, tipoDeArchivo,
} from "@/lib/soporte/adjuntos";
import {
  abrirConversacion, enviarMensaje, escucharMensajes, nuevoId,
  type Envio, type MensajeChat, type SesionSoporte,
} from "@/lib/soporte/api";

/**
 * Chat de soporte.
 *
 * Pensado para el celular: ocupa toda la pantalla, sin barra de navegación ni nada
 * más que la conversación, para que se sienta igual que WhatsApp. En el escritorio
 * se centra en una columna angosta por la misma razón.
 *
 * El cliente puede mandar lo mismo que por WhatsApp: texto, fotos, notas de voz,
 * videos y documentos (PDF, Word, lo que sea).
 */

const ALTO_MAX_CAMPO = 120;

function saludoInicial(sesion: SesionSoporte | null): MensajeChat {
  const nombre = sesion?.nombre?.trim().split(" ")[0];
  return {
    id: "saludo",
    origen: "arto",
    texto: nombre
      ? `¡Hola ${nombre}! 👋 Soy el asistente de ${MARCA.nombre}. Cuéntame qué problema tienes y lo dejo registrado al tiro.`
      : `¡Hola! 👋 Soy el asistente de soporte de ${MARCA.nombre}. Cuéntame qué problema tienes y lo dejo registrado al tiro.`,
    hora: new Date().toISOString(),
  };
}

const reloj = (segundos: number) =>
  `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;

export function ChatArto({ sesion }: { sesion: SesionSoporte | null }) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [visor, setVisor] = useState<LightboxMedia | null>(null);
  /** Conversación en la base; la entrega el flujo cuando ya sabe quién escribe. */
  const [convId, setConvId] = useState<string | null>(sesion?.conversationId ?? null);
  /** Credencial firmada para leer esta conversación por Realtime; se renueva con cada mensaje. */
  const tokenRealtimeRef = useRef<string | null>(null);

  const { toast } = useToast();
  const grabadora = useGrabadora();

  const campoRef = useRef<HTMLTextAreaElement>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const documentoRef = useRef<HTMLInputElement>(null);

  /** Archivos ya enviados, por si hay que reintentar. */
  const archivosRef = useRef(new Map<string, File>());
  /** URLs locales de vista previa: se liberan al salir del chat. */
  const urlsRef = useRef<string[]>([]);

  useEffect(() => () => urlsRef.current.forEach(URL.revokeObjectURL), []);

  /*
   * ── Saludo de apertura ─────────────────────────────────────────────────
   *
   * El primer mensaje lo escribe el agente, no la interfaz. Así retoma lo que el
   * cliente venía conversando por WhatsApp ("ya revisamos tu caso…") en vez de
   * saludar de cero, que sería raro para alguien que llega desde ese hilo.
   *
   * El saludo local queda como respaldo: si el flujo no responde, el cliente ve
   * un chat abierto y puede escribir igual, en vez de una pantalla en blanco.
   */
  const aperturaRef = useRef(false);
  useEffect(() => {
    if (aperturaRef.current) return;
    aperturaRef.current = true;

    let cancelado = false;
    setEscribiendo(true);
    abrirConversacion(sesion)
      .then(({ textos, conversationId, realtimeToken }) => {
        if (cancelado) return;
        if (realtimeToken) tokenRealtimeRef.current = realtimeToken;
        if (conversationId) setConvId(conversationId);
        setMensajes(textos.length
          ? textos.map(t => ({ id: nuevoId(), origen: "arto" as const, texto: t, hora: new Date().toISOString() }))
          : [saludoInicial(sesion)]);
      })
      .catch(() => { if (!cancelado) setMensajes([saludoInicial(sesion)]); })
      .finally(() => { if (!cancelado) setEscribiendo(false); });

    return () => { cancelado = true; };
  }, [sesion]);

  // ── Alto real de la pantalla ───────────────────────────────────────────
  // En iOS el documento no se achica al abrir el teclado; visualViewport sí lo
  // refleja, y sin esto el campo de texto queda tapado por el teclado.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const aplicar = () => document.documentElement.style.setProperty("--sop-alto", `${vv.height}px`);
    aplicar();
    vv.addEventListener("resize", aplicar);
    return () => {
      vv.removeEventListener("resize", aplicar);
      document.documentElement.style.removeProperty("--sop-alto");
    };
  }, []);

  // ── Bajar a lo último ──────────────────────────────────────────────────
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, escribiendo, archivo]);

  /*
   * ── Respuestas que llegan desde el portal ───────────────────────────────
   *
   * Cuando el caso se deriva, el agente de IA se calla y contesta una persona
   * desde la bandeja de operadores. Esas respuestas no vuelven en el request
   * —se escriben en `messages`— así que hay que escucharlas por Realtime o el
   * cliente se queda mirando un chat mudo mientras alguien le responde.
   *
   * Vale para los dos transportes: en "directo" el `conversation_id` lo entrega
   * el propio flujo en su respuesta, no la sesión.
   *
   * La autorización va en el token firmado que entrega el servidor: Realtime aplica
   * RLS igual que una consulta normal y el visitante no tiene sesión. Sin token la
   * suscripción se abre igual pero no recibe nada, sin error.
   */
  useEffect(() => {
    if (!convId) return;
    return escucharMensajes(convId, tokenRealtimeRef.current, entrante => {
      setEscribiendo(false);
      setMensajes(prev => prev.some(m => m.id === entrante.id) ? prev : [...prev, entrante]);
    });
  }, [convId]);

  // ── Envío ──────────────────────────────────────────────────────────────
  const enviar = useCallback(async (envio: Envio, idPrevio?: string) => {
    const limpio = envio.texto.trim();
    if (!limpio && !envio.archivo) return;

    const id = idPrevio ?? nuevoId();
    if (envio.archivo) archivosRef.current.set(id, envio.archivo);

    if (idPrevio) {
      setMensajes(prev => prev.map(m => (m.id === id ? { ...m, estado: "enviando" as const } : m)));
    } else {
      const nuevo: MensajeChat = {
        id,
        origen: "cliente",
        texto: limpio,
        hora: new Date().toISOString(),
        estado: "enviando",
      };
      if (envio.archivo) {
        // Vista previa inmediata: la copia local se muestra mientras viaja.
        const url = URL.createObjectURL(envio.archivo);
        urlsRef.current.push(url);
        nuevo.adjunto = {
          url,
          tipo: tipoDeArchivo(envio.archivo.type, envio.archivo.name),
          nombre: envio.archivo.name,
          mime: envio.archivo.type,
          tamano: envio.archivo.size,
        };
      }
      setMensajes(prev => [...prev, nuevo]);
    }
    setEscribiendo(true);

    try {
      const { textos, conversationId, realtimeToken } = await enviarMensaje({ texto: limpio, archivo: envio.archivo }, sesion);
      // Llega recién cuando el cliente entrega su teléfono: desde ahí se puede
      // escuchar lo que escriba el especialista desde el portal.
      if (realtimeToken) tokenRealtimeRef.current = realtimeToken;
      if (conversationId) setConvId(conversationId);
      setMensajes(prev => [
        ...prev.map(m => (m.id === id ? { ...m, estado: "enviado" as const } : m)),
        ...textos.map(r => ({
          id: nuevoId(),
          origen: "arto" as const,
          texto: r,
          hora: new Date().toISOString(),
        })),
      ]);
    } catch {
      setMensajes(prev => prev.map(m => (m.id === id ? { ...m, estado: "error" as const } : m)));
    } finally {
      setEscribiendo(false);
    }
  }, [sesion]);

  const enviarLoEscrito = () => {
    const pendiente = { texto, archivo };
    setTexto("");
    setArchivo(null);
    if (campoRef.current) campoRef.current.style.height = "auto";
    void enviar(pendiente);
  };

  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    enviarLoEscrito();
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // En el celular Enter hace salto de línea; ahí se envía con el botón.
    const tactil = window.matchMedia?.("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !tactil) {
      e.preventDefault();
      enviarLoEscrito();
    }
  };

  const ajustarAlto = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, ALTO_MAX_CAMPO)}px`;
  };

  // ── Adjuntos ───────────────────────────────────────────────────────────
  const alElegirArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const elegido = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    setMenuAbierto(false);
    if (!elegido) return;

    if (pesaDemasiado(elegido)) {
      toast({
        title: "Archivo muy pesado",
        description: `El máximo por archivo es ${MAX_ARCHIVO_MB} MB y este pesa ${pesoLegible(elegido.size)}.`,
        variant: "destructive",
      });
      return;
    }
    setArchivo(elegido);
    campoRef.current?.focus();
  };

  // ── Nota de voz ────────────────────────────────────────────────────────
  const grabar = async () => {
    try {
      await grabadora.iniciar();
    } catch {
      toast({
        title: "Sin acceso al micrófono",
        description: "Permite el micrófono en tu navegador para mandar notas de voz.",
        variant: "destructive",
      });
    }
  };

  const enviarGrabacion = async () => {
    const audio = await grabadora.detener();
    if (audio) void enviar({ texto: "", archivo: audio });
  };

  const hayQueEnviar = Boolean(texto.trim() || archivo);

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "var(--sop-alto, 100dvh)", background: "var(--sop-fondo)", color: "var(--sop-texto)" }}
    >
      {/* Cabecera */}
      <header
        className="flex items-center gap-3 px-4 py-2.5"
        style={{
          background: "var(--sop-barra)",
          borderBottom: "1px solid var(--sop-borde)",
          paddingTop: "calc(0.625rem + env(safe-area-inset-top))",
        }}
      >
        <LogoMarca tam={40} />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight">{MARCA.nombre}</p>
          <p className="truncate text-xs" style={{ color: escribiendo ? "var(--sop-acento)" : "var(--sop-texto-2)" }}>
            {escribiendo ? "escribiendo…" : "Soporte en línea"}
          </p>
        </div>
      </header>

      {/* Conversación */}
      <main className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
          {mensajes.map((m, i) => (
            <Burbuja
              key={m.id}
              mensaje={m}
              pegada={mensajes[i - 1]?.origen === m.origen}
              onAbrirMedia={setVisor}
              onReintentar={() => void enviar({ texto: m.texto, archivo: archivosRef.current.get(m.id) }, m.id)}
            />
          ))}
          {escribiendo && <Escribiendo />}
          <div ref={finRef} />
        </div>
      </main>

      {/* Barra inferior */}
      {grabadora.grabando ? (
        <div
          className="flex items-center gap-3 px-3 py-2.5"
          style={{
            background: "var(--sop-barra)",
            borderTop: "1px solid var(--sop-borde)",
            paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))",
          }}
        >
          <button
            type="button"
            onClick={grabadora.cancelar}
            aria-label="Descartar grabación"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
            style={{ color: "var(--sop-error)" }}
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <span className="flex items-center gap-2 text-sm tabular-nums">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: "var(--sop-error)" }} />
            {reloj(grabadora.segundos)}
          </span>
          <span className="flex-1 truncate text-xs" style={{ color: "var(--sop-texto-3)" }}>
            Grabando nota de voz…
          </span>
          <button
            type="button"
            onClick={() => void enviarGrabacion()}
            aria-label="Enviar nota de voz"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--sop-acento)", color: "#fff" }}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div
          style={{
            background: "var(--sop-barra)",
            borderTop: "1px solid var(--sop-borde)",
            paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))",
          }}
        >
          {archivo && (
            <VistaPreviaAdjunto archivo={archivo} onQuitar={() => setArchivo(null)} />
          )}

          <form onSubmit={alEnviar} className="relative flex items-end gap-2 px-3 py-2.5">
            {menuAbierto && (
              <MenuAdjuntar
                onCerrar={() => setMenuAbierto(false)}
                onCamara={() => camaraRef.current?.click()}
                onGaleria={() => galeriaRef.current?.click()}
                onDocumento={() => documentoRef.current?.click()}
              />
            )}

            <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={alElegirArchivo} />
            <input ref={galeriaRef} type="file" accept="image/*,video/*" className="hidden" onChange={alElegirArchivo} />
            {/* Sin `accept`, Android ofrecía cámara y galería también acá, que es
                justo lo que ya cubren los otros dos botones. */}
            <input
              ref={documentoRef}
              type="file"
              accept="application/pdf,.doc,.docx,.xls,.xlsx,.txt,audio/*"
              className="hidden"
              onChange={alElegirArchivo}
            />

            <button
              type="button"
              onClick={() => setMenuAbierto(a => !a)}
              aria-label="Adjuntar archivo"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
              style={{ color: menuAbierto ? "var(--sop-acento)" : "var(--sop-texto-2)" }}
            >
              <Paperclip className="h-5 w-5" />
            </button>

            <textarea
              ref={campoRef}
              rows={1}
              value={texto}
              onChange={e => { setTexto(e.target.value); ajustarAlto(e.target); }}
              onKeyDown={alTeclear}
              placeholder={archivo ? "Agrega un comentario…" : "Escribe tu mensaje…"}
              enterKeyHint="send"
              className="flex-1 resize-none rounded-2xl px-4 py-2.5 text-[15px] outline-none placeholder:text-[var(--sop-texto-3)]"
              style={{ background: "var(--sop-campo)", color: "var(--sop-texto)", maxHeight: ALTO_MAX_CAMPO }}
            />

            {hayQueEnviar || !grabadora.soportada ? (
              <button
                type="submit"
                disabled={!hayQueEnviar}
                aria-label="Enviar mensaje"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition-opacity disabled:opacity-40"
                style={{ background: "var(--sop-acento)", color: "#fff" }}
              >
                <Send className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void grabar()}
                aria-label="Grabar nota de voz"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                style={{ background: "var(--sop-acento)", color: "#fff" }}
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
          </form>
        </div>
      )}

      <MediaLightbox media={visor} onClose={() => setVisor(null)} />
    </div>
  );
}

/* ─── Piezas de la conversación ──────────────────────────────────────────── */

function Burbuja({
  mensaje, pegada, onReintentar, onAbrirMedia,
}: {
  mensaje: MensajeChat;
  pegada: boolean;
  onReintentar: () => void;
  onAbrirMedia: (m: LightboxMedia) => void;
}) {
  const mio = mensaje.origen === "cliente";
  const fallo = mensaje.estado === "error";
  const enviando = mensaje.estado === "enviando";
  const adjunto = mensaje.adjunto;

  const abrir = () => {
    if (!adjunto) return;
    onAbrirMedia({
      url: adjunto.url,
      name: adjunto.nombre,
      type: adjunto.tipo === "imagen" ? "image"
        : adjunto.tipo === "video" ? "video"
        : adjunto.mime === "application/pdf" || /\.pdf$/i.test(adjunto.nombre) ? "pdf"
        : "other",
    });
  };

  return (
    <div className={`flex ${mio ? "justify-end" : "justify-start"} ${pegada ? "" : "mt-1.5"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 ${mio ? "rounded-br-md" : "rounded-bl-md"}`}
        style={{ background: mio ? "var(--sop-burbuja-cliente)" : "var(--sop-burbuja-arto)" }}
      >
        {mensaje.autor && !mio && (
          <p className="mb-0.5 text-xs font-semibold" style={{ color: "var(--sop-acento)" }}>
            {mensaje.autor}
          </p>
        )}

        {adjunto && <AdjuntoMensaje adjunto={adjunto} onAbrir={abrir} />}

        {mensaje.texto && (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">
            <ConEnlaces texto={mensaje.texto} />
          </p>
        )}

        <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px]" style={{ color: "var(--sop-texto-2)" }}>
          {fallo ? (
            <button type="button" onClick={onReintentar} className="flex items-center gap-1" style={{ color: "var(--sop-error)" }}>
              <AlertCircle className="h-3 w-3" /> No se envió · Reintentar
            </button>
          ) : (
            <>
              {enviando && adjunto && <Loader2 className="h-3 w-3 animate-spin" />}
              <span>{format(new Date(mensaje.hora), "HH:mm")}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Lo que se va a mandar, arriba del campo de texto, con opción a descartarlo. */
function VistaPreviaAdjunto({ archivo, onQuitar }: { archivo: File; onQuitar: () => void }) {
  const tipo = tipoDeArchivo(archivo.type, archivo.name);
  const [miniatura, setMiniatura] = useState<string | null>(null);

  useEffect(() => {
    if (tipo !== "imagen") return;
    const url = URL.createObjectURL(archivo);
    setMiniatura(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo, tipo]);

  return (
    <div
      className="mx-3 mt-2 flex items-center gap-3 rounded-xl px-3 py-2"
      style={{ background: "var(--sop-campo)" }}
    >
      {miniatura ? (
        <img src={miniatura} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }}>
          <FileText className="h-5 w-5" style={{ color: "var(--sop-texto-2)" }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{archivo.name}</p>
        <p className="text-xs" style={{ color: "var(--sop-texto-2)" }}>
          {etiquetaAdjunto(tipo)} · {pesoLegible(archivo.size)}
        </p>
      </div>
      <button type="button" onClick={onQuitar} aria-label="Quitar archivo" className="shrink-0 p-1">
        <X className="h-5 w-5" style={{ color: "var(--sop-texto-2)" }} />
      </button>
    </div>
  );
}

/** Menú del clip: cámara, galería o cualquier archivo. */
function MenuAdjuntar({
  onCerrar, onCamara, onGaleria, onDocumento,
}: { onCerrar: () => void; onCamara: () => void; onGaleria: () => void; onDocumento: () => void }) {
  const opciones = [
    { icono: Camera, texto: "Cámara", accion: onCamara },
    { icono: ImageIcon, texto: "Fotos y videos", accion: onGaleria },
    { icono: FileText, texto: "Documento", accion: onDocumento },
  ];

  return (
    <>
      {/* Capa para cerrar tocando fuera */}
      <div className="fixed inset-0 z-10" onClick={onCerrar} />
      <div
        className="absolute bottom-full left-3 z-20 mb-2 w-52 overflow-hidden rounded-xl py-1 shadow-xl"
        style={{ background: "var(--sop-campo)", border: "1px solid var(--sop-borde)" }}
      >
        {opciones.map(({ icono: Icono, texto, accion }) => (
          <button
            key={texto}
            type="button"
            onClick={accion}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:opacity-80"
          >
            <Icono className="h-5 w-5" style={{ color: "var(--sop-acento)" }} />
            {texto}
          </button>
        ))}
      </div>
    </>
  );
}

function Escribiendo() {
  return (
    <div className="mt-1.5 flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md px-4 py-3" style={{ background: "var(--sop-burbuja-arto)" }}>
        {[0, 150, 300].map(retraso => (
          <span
            key={retraso}
            className="h-1.5 w-1.5 animate-bounce rounded-full"
            style={{ background: "var(--sop-texto-2)", animationDelay: `${retraso}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Convierte en enlaces las URLs que mande el bot (links de pago, boletas, etc.). */
function ConEnlaces({ texto }: { texto: string }) {
  const partes = texto.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {partes.map((parte, i) =>
        /^https?:\/\//.test(parte) ? (
          <a
            key={i}
            href={parte}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: "var(--sop-acento)" }}
          >
            {parte}
          </a>
        ) : (
          parte
        )
      )}
    </>
  );
}

export default ChatArto;
