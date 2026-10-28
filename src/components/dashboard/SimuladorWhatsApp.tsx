import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  ImagePlus,
  Loader2,
  Mic,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AdjuntoMensaje } from "@/components/soporte/AdjuntoMensaje";
import type { Adjunto } from "@/lib/soporte/adjuntos";
import {
  simuladorApi,
  ErrorSimulador,
  type CompanyKey,
  type ConversacionSim,
  type DetalleConversacion,
  type MensajeSim,
  type PerfilSim,
  type RespuestaTurno,
  type RunSim,
  type Veredicto,
} from "@/lib/simulador/api";

/* ─── Constantes ─────────────────────────────────────────────────────────── */

const MAX_IMAGEN_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_AUDIO_BYTES = 12 * 1024 * 1024; // 12 MB, tope del proxy

/** Formatos que acepta sim-proxy para el audio del cliente. */
const AUDIO_MIMES = ["audio/ogg", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/webm"];

const EMPRESAS: Array<{ key: CompanyKey; label: string }> = [
  { key: "dropp", label: "Dropp" },
  { key: "optve", label: "Optve" },
];

/** Empresa con la que se abren las pruebas (decisión de Demis). */
const EMPRESA_PRUEBA: CompanyKey = "dropp";

/** Teléfono sintético para "empezar de cero": nunca es un número de cliente. */
function telefonoDePrueba() {
  const n = Math.floor(10000000 + Math.random() * 89999999);
  return `+569${n}`;
}

/* ─── Piezas visuales ────────────────────────────────────────────────────── */

/**
 * Burbuja del simulador. Usa SÓLO tokens del tema, a propósito.
 *
 * La versión anterior copió los `--sop-burbuja-*` del widget de soporte, que son
 * hex fijos oscuros (#1B2138 burbuja del agente, #4C2A85 la del cliente) y están
 * pensados para un widget que fija su propio `color` de texto. Acá el texto
 * heredaba el color del tema → en modo claro, texto casi negro sobre #1B2138:
 * bloque oscuro ilegible.
 *
 * Contraste medido sobre los tokens de src/index.css:
 *   claro  → cliente primary-foreground/primary 4,72:1 · agente foreground/muted 14,58:1
 *   oscuro → cliente primary-foreground/primary 3,96:1 · agente foreground/secondary-20 11,06:1
 */
function BurbujaSim({
  rol,
  texto,
  hora,
  autor,
  imagen,
  pegada,
  onAbrirImagen,
}: {
  rol: "user" | "agent";
  texto: string;
  hora: string;
  autor?: string | null;
  imagen?: Adjunto | null;
  pegada: boolean;
  onAbrirImagen: (a: Adjunto) => void;
}) {
  const mio = rol === "user";
  return (
    <div className={`flex ${mio ? "justify-end" : "justify-start"} ${pegada ? "" : "mt-1.5"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 ${mio ? "rounded-br-md" : "rounded-bl-md"} ${
          mio ? "bg-primary text-primary-foreground" : "bg-muted text-foreground dark:bg-secondary/20"
        }`}
      >
        {autor && !mio && <p className="mb-0.5 text-xs font-semibold text-foreground/80">{autor}</p>}

        {imagen && <AdjuntoMensaje adjunto={imagen} onAbrir={() => onAbrirImagen(imagen)} />}

        {texto && <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{texto}</p>}

        <div
          className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${
            mio ? "text-primary-foreground/75" : "text-muted-foreground"
          }`}
        >
          <span>{hora}</span>
        </div>
      </div>
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</span>
      <span className="text-right text-[12.5px] font-medium text-foreground break-words">{children}</span>
    </div>
  );
}

function tonoVeredicto(veredicto: string | null | undefined) {
  const v = (veredicto || "").toLowerCase();
  if (!v) return "bg-muted text-muted-foreground";
  if (v.includes("ok") || v.includes("aprob") || v.includes("pass") || v.includes("correcto"))
    return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
  if (v.includes("fail") || v.includes("rechaz") || v.includes("error") || v.includes("violac"))
    return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
  return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
}

function horaCorta(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "HH:mm");
}

function tonoEstado(estado: string | null | undefined) {
  const e = (estado || "").toLowerCase();
  if (e.includes("activo") || e.includes("vigente") || e.includes("ok"))
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (e.includes("suspend") || e.includes("mora") || e.includes("cortad") || e.includes("baja"))
    return "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400";
  return "border-border/50 text-muted-foreground";
}

/* ─── Panel de traza ─────────────────────────────────────────────────────── */

function TrazaPanel({
  turno,
  runs,
  onCerrar,
}: {
  turno: RespuestaTurno | null;
  runs: RunSim[];
  onCerrar?: () => void;
}) {
  const ultimoRun = runs.length > 0 ? runs[0] : null;
  const veredictos: Veredicto[] = ultimoRun?.veredictos || [];
  const tokensIn = turno ? null : ultimoRun?.prompt_tokens ?? null;
  const tokensOut = turno ? null : ultimoRun?.completion_tokens ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-border/40 bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Traza del turno</h3>
        </div>
        {onCerrar && (
          <Button variant="ghost" size="icon" className="h-7 w-7 lg:hidden" onClick={onCerrar}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-3 p-3">
          {!turno && !ultimoRun && (
            <p className="text-[12.5px] text-muted-foreground">
              Todavía no hay turnos en esta conversación. Enviá un mensaje y acá aparece la intención,
              las herramientas y el costo.
            </p>
          )}

          {turno && (
            <div className="rounded-lg border border-border/40 p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Último turno</span>
                <Badge variant="outline" className={`text-[10.5px] ${tonoVeredicto(turno.veredicto)}`}>
                  {turno.veredicto || "sin veredicto"}
                </Badge>
              </div>
              <Dato etiqueta="Intención">{turno.intencion || "—"}</Dato>
              <Dato etiqueta="Vía">{turno.via || "—"}</Dato>
              <Dato etiqueta="Modelo">{turno.modelo || "—"}</Dato>
              <Dato etiqueta="Latencia">{turno.ms != null ? `${turno.ms} ms` : "—"}</Dato>
              <Dato etiqueta="Costo">{turno.costo != null ? `$${turno.costo.toFixed(6)} USD` : "—"}</Dato>
              <Dato etiqueta="Tipo de falla">{turno.tipo_falla || "—"}</Dato>
              <Dato etiqueta="runId">
                <span className="font-mono text-[11px]">{turno.runId}</span>
              </Dato>
            </div>
          )}

          {turno && turno.tools.length > 0 && (
            <div className="rounded-lg border border-border/40 p-2.5">
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Herramientas ({turno.tools.length})
              </p>
              <ul className="space-y-1">
                {turno.tools.map((t, i) => (
                  <li key={`${t.name}-${i}`} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="flex items-center gap-1.5 truncate">
                      <span
                        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                          t.ok === false ? "bg-red-500" : t.ok === true ? "bg-emerald-500" : "bg-muted-foreground"
                        }`}
                      />
                      <span className="truncate font-mono text-[11.5px]">{t.name}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">{t.ms != null ? `${t.ms} ms` : "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {turno && turno.violaciones.length > 0 && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5" /> Guardrails ({turno.violaciones.length})
              </p>
              <ul className="space-y-1.5">
                {turno.violaciones.map((v, i) => (
                  <li key={`${v.regla}-${i}`} className="text-[12px]">
                    <span className="font-medium">{v.regla}</span>
                    <span className="ml-1 text-muted-foreground">· {v.severidad}</span>
                    {v.evidencia && (
                      <p className="mt-0.5 break-words text-[11.5px] italic text-muted-foreground">
                        “{v.evidencia}”
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ultimoRun && !turno && (
            <div className="rounded-lg border border-border/40 p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Último run guardado</span>
                <Badge variant="outline" className={`text-[10.5px] ${tonoVeredicto(ultimoRun.verdict)}`}>
                  {ultimoRun.verdict || "sin veredicto"}
                </Badge>
              </div>
              <Dato etiqueta="Modelo">{ultimoRun.model || "—"}</Dato>
              <Dato etiqueta="Latencia">{ultimoRun.ms != null ? `${ultimoRun.ms} ms` : "—"}</Dato>
              <Dato etiqueta="Tokens in">{tokensIn != null ? tokensIn : "—"}</Dato>
              <Dato etiqueta="Tokens out">{tokensOut != null ? tokensOut : "—"}</Dato>
              <Dato etiqueta="Costo">
                {ultimoRun.cost_usd != null ? `$${Number(ultimoRun.cost_usd).toFixed(6)} USD` : "—"}
              </Dato>
              <Dato etiqueta="Tipo de falla">{ultimoRun.fail_type || "—"}</Dato>
            </div>
          )}

          {veredictos.length > 0 && (
            <div className="rounded-lg border border-border/40 p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <FlaskConical className="h-3.5 w-3.5" /> Juez LLM ({veredictos.length})
                </p>
                <span className="shrink-0 text-[10.5px] text-muted-foreground">
                  {veredictos.filter((v) => v.falla === 1).length} con falla
                </span>
              </div>
              <ul className="space-y-1.5">
                {veredictos.map((v) => (
                  <li key={v.id} className="rounded-md border border-border/30 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                            v.falla === 1 ? "bg-red-500" : "bg-emerald-500"
                          }`}
                        />
                        <span className="truncate text-[12px] font-medium">
                          {v.falla === 1 ? (v.tipo || "falla").replace(/_/g, " ") : "sin falla"}
                        </span>
                        {v.severidad && (
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-[9.5px] ${
                              v.severidad === "alta"
                                ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                                : v.severidad === "media"
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                  : "border-border/40 text-muted-foreground"
                            }`}
                          >
                            {v.severidad}
                          </Badge>
                        )}
                      </span>
                      <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">
                        {Math.round(v.confianza * 100)}%
                      </span>
                    </div>
                    {v.evidencia && (
                      <p className="mt-1 break-words text-[11.5px] italic text-muted-foreground">
                        “{v.evidencia}”
                      </p>
                    )}
                    {v.correccion && (
                      <p className="mt-0.5 break-words text-[11.5px]">
                        <span className="text-muted-foreground">Corrección: </span>
                        {v.correccion}
                      </p>
                    )}
                    <p className="mt-1 text-[10.5px] tabular-nums text-muted-foreground">
                      {v.modelo} · {v.ms} ms · ${Number(v.costo || 0).toFixed(6)} USD · {horaCorta(v.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!veredictos.length && (turno || ultimoRun) && (
            <p className="text-[11.5px] text-muted-foreground">
              El juez LLM corre en segundo plano: el veredicto aparece unos segundos después del turno
              (se refresca solo a los ~6 s).
            </p>
          )}

          {ultimoRun && !turno && ultimoRun.eventos.length > 0 && (
            <div className="rounded-lg border border-border/40 p-2.5">
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Eventos ({ultimoRun.eventos.length})
              </p>
              <ul className="space-y-1">
                {ultimoRun.eventos.map((e) => (
                  <li key={e.seq} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 text-muted-foreground">#{e.seq}</span>
                      <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{e.kind}</span>
                      <span className="truncate font-mono">{e.name || "—"}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {e.ok === false ? "✗" : e.ok === true ? "✓" : "·"} {e.ms != null ? `${e.ms} ms` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {runs.length > 1 && (
            <div className="rounded-lg border border-border/40 p-2.5">
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Runs de esta conversación
              </p>
              <ul className="space-y-1">
                {runs.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="truncate font-mono text-[10.5px]">{r.id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">
                      {r.cost_usd != null ? `$${Number(r.cost_usd).toFixed(6)}` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ─── Pantalla ───────────────────────────────────────────────────────────── */

export default function SimuladorWhatsApp() {
  const [perfiles, setPerfiles] = useState<PerfilSim[]>([]);
  const [cargandoPerfiles, setCargandoPerfiles] = useState(true);

  /** Perfil de la prueba en curso (null = "empezar de cero"). */
  const [perfil, setPerfil] = useState<PerfilSim | null>(null);
  const [conv, setConv] = useState<ConversacionSim | null>(null);
  const [creando, setCreando] = useState(false);

  const [detalle, setDetalle] = useState<DetalleConversacion | null>(null);
  const [pendientes, setPendientes] = useState<MensajeSim[]>([]);
  const [turno, setTurno] = useState<RespuestaTurno | null>(null);

  const [texto, setTexto] = useState("");
  const [imagen, setImagen] = useState<Adjunto | null>(null);
  const [audio, setAudio] = useState<Adjunto | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [trazaAbierta, setTrazaAbierta] = useState(false);

  const finRef = useRef<HTMLDivElement | null>(null);
  const inputArchivoRef = useRef<HTMLInputElement | null>(null);
  const inputAudioRef = useRef<HTMLInputElement | null>(null);
  const juezTimer = useRef<number | null>(null);
  const refrescarRef = useRef<((id: string) => void) | null>(null);

  /** El juez LLM corre en segundo plano: ~6 s después del turno se vuelve a
   *  pedir la conversación para traer `runs[].veredictos`, sin bloquear nada. */
  const cancelarJuez = useCallback(() => {
    if (juezTimer.current != null) {
      window.clearTimeout(juezTimer.current);
      juezTimer.current = null;
    }
  }, []);

  const mensajes = useMemo(() => {
    const base = detalle?.mensajes ? [...detalle.mensajes] : [];
    return [...base, ...pendientes];
  }, [detalle, pendientes]);

  const scrollAlFinal = useCallback(() => {
    requestAnimationFrame(() => {
      if (finRef.current) finRef.current.scrollIntoView({ block: "end" });
    });
  }, []);

  useEffect(() => {
    if (mensajes.length > 0) scrollAlFinal();
  }, [mensajes.length, scrollAlFinal]);

  useEffect(() => () => cancelarJuez(), [cancelarJuez]);

  /** Única carga automática de la pantalla: los perfiles de prueba. */
  const cargarPerfiles = useCallback(async () => {
    setCargandoPerfiles(true);
    try {
      const r = await simuladorApi.perfiles();
      setPerfiles(r.perfiles || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "No se pudieron cargar los perfiles de prueba.");
    } finally {
      setCargandoPerfiles(false);
    }
  }, []);

  useEffect(() => {
    void cargarPerfiles();
  }, [cargarPerfiles]);

  const refrescar = useCallback(async (id: string) => {
    try {
      const d = await simuladorApi.obtener(id);
      setDetalle(d);
      setPendientes([]);
    } catch {
      /* silencioso: es un refresco de fondo */
    }
  }, []);

  useEffect(() => {
    refrescarRef.current = (id: string) => {
      cancelarJuez();
      juezTimer.current = window.setTimeout(() => {
        juezTimer.current = null;
        void refrescar(id);
      }, 6000);
    };
  }, [cancelarJuez, refrescar]);

  const volverAlSelector = useCallback(() => {
    cancelarJuez();
    setPerfil(null);
    setConv(null);
    setDetalle(null);
    setPendientes([]);
    setTurno(null);
    setTexto("");
    setImagen(null);
    setAudio(null);
  }, [cancelarJuez]);

  /** Crea SIEMPRE una conversación nueva y deja el chat vacío. */
  const iniciar = useCallback(async (elegido: PerfilSim | null) => {
    setCreando(true);
    setError(null);
    try {
      const r = await simuladorApi.crear({
        companyKey: EMPRESA_PRUEBA,
        phone: elegido?.telefono || telefonoDePrueba(),
        ...(elegido ? { clientRut: elegido.rut, clientName: elegido.nombre } : {}),
      });
      setPerfil(elegido);
      setConv(r.conversacion);
      setDetalle({ conversacion: r.conversacion, mensajes: [], runs: [], tickets: [] });
      setPendientes([]);
      setTurno(null);
      setTexto("");
      setImagen(null);
      setAudio(null);
    } catch (e: any) {
      setError(e?.message || "No se pudo abrir la conversación de prueba.");
    } finally {
      setCreando(false);
    }
  }, []);

  /** Descartar la prueba: borra la conversación y vuelve al selector. */
  const reiniciarPrueba = useCallback(async () => {
    const id = conv?.id;
    volverAlSelector();
    if (id) {
      try {
        await simuladorApi.borrar(id);
      } catch {
        /* si falla el borrado igual volvemos al selector */
      }
    }
  }, [conv, volverAlSelector]);

  /* ── Adjuntos ───────────────────────────────────────────────────────── */

  const elegirImagen = (archivo: File) => {
    if (!archivo.type.startsWith("image/")) {
      setError("El adjunto tiene que ser una imagen.");
      return;
    }
    if (archivo.size > MAX_IMAGEN_BYTES) {
      setError(`La imagen pasa de 5 MB (${(archivo.size / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      const dataUrl = String(lector.result || "");
      if (!dataUrl.startsWith("data:image/")) {
        setError("No se pudo leer la imagen.");
        return;
      }
      setImagen({
        url: dataUrl,
        tipo: "imagen",
        nombre: archivo.name,
        mime: archivo.type,
        tamano: archivo.size,
      });
      setError(null);
    };
    lector.onerror = () => setError("No se pudo leer la imagen.");
    lector.readAsDataURL(archivo);
  };

  const elegirAudio = (archivo: File) => {
    const mime = (archivo.type || "").toLowerCase();
    const porExtension = /\.(ogg|mp3|m4a|wav|webm)$/i.test(archivo.name);
    if (!AUDIO_MIMES.includes(mime) && !porExtension) {
      setError("El audio tiene que ser ogg, mp3, m4a, wav o webm.");
      return;
    }
    if (archivo.size > MAX_AUDIO_BYTES) {
      setError(`El audio pasa de 12 MB (${(archivo.size / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      const dataUrl = String(lector.result || "");
      if (!dataUrl.startsWith("data:")) {
        setError("No se pudo leer el audio.");
        return;
      }
      setAudio({
        url: dataUrl,
        tipo: "audio",
        nombre: archivo.name,
        mime: mime || "audio/ogg",
        tamano: archivo.size,
      });
      setError(null);
    };
    lector.onerror = () => setError("No se pudo leer el audio.");
    lector.readAsDataURL(archivo);
  };

  /* ── Enviar ─────────────────────────────────────────────────────────── */

  const enviar = async () => {
    if (!conv || enviando) return;
    const limpio = texto.trim();
    if (!limpio && !imagen && !audio) return;

    const optimista: MensajeSim = {
      id: `opt-${Date.now()}`,
      role: "user",
      kind: audio ? "audio" : imagen ? "imagen" : "text",
      content: limpio,
      created_at: new Date().toISOString(),
    };

    setPendientes((p) => [...p, optimista]);
    setTexto("");
    const imagenEnviada = imagen;
    const audioEnviado = audio;
    setImagen(null);
    setAudio(null);
    setEnviando(true);
    setError(null);

    try {
      const r = await simuladorApi.mensaje({
        id: conv.id,
        texto: limpio,
        ...(imagenEnviada
          ? {
              imagen: {
                dataUrl: imagenEnviada.url,
                nombre: imagenEnviada.nombre,
                mime: imagenEnviada.mime,
                tamano: imagenEnviada.tamano,
              },
            }
          : {}),
        ...(audioEnviado
          ? {
              audio: {
                dataUrl: audioEnviado.url,
                nombre: audioEnviado.nombre,
                mime: audioEnviado.mime,
                tamano: audioEnviado.tamano,
              },
            }
          : {}),
      });

      setTurno(r);
      // La respuesta del agente se pinta al instante; después se recarga para
      // traer los ids canónicos y los runs.
      if (r.reply) {
        setPendientes((p) => [
          ...p,
          {
            id: `opt-reply-${r.runId}`,
            role: "agent",
            kind: "text",
            content: r.reply,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      await refrescar(conv.id);
      refrescarRef.current?.(conv.id);
    } catch (e: any) {
      setPendientes((p) => p.filter((m) => m.id !== optimista.id));
      setTexto(limpio);
      if (imagenEnviada) setImagen(imagenEnviada);
      if (audioEnviado) setAudio(audioEnviado);
      const esApi = e instanceof ErrorSimulador;
      setError(
        esApi
          ? e.message
          : e?.message || "No se pudo enviar el mensaje al simulador.",
      );
    } finally {
      setEnviando(false);
    }
  };

  const abrirAdjunto = (a: Adjunto) => window.open(a.url, "_blank", "noopener,noreferrer");

  const etiquetaPrueba = perfil
    ? `Probando como ${perfil.nombre}${perfil.plan ? ` · ${perfil.plan}` : ""}`
    : "Probando con un teléfono libre";

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 lg:p-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Simulador de WhatsApp</h1>
            <p className="text-[12px] text-muted-foreground">
              Habla con el agente en modo prueba. No manda WhatsApp ni abre tickets reales.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setTrazaAbierta((v) => !v)}>
            {trazaAbierta ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronUp className="mr-1 h-4 w-4" />}
            Traza
          </Button>
          {conv && (
            <Button variant="outline" size="sm" onClick={() => void reiniciarPrueba()}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Reiniciar prueba
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1 break-words">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Cerrar aviso">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* Chat, o selector de perfil. Nunca se listan conversaciones viejas. */}
        <section className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-xl border border-border/40 bg-card">
          {!conv ? (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Elegí un perfil de prueba</h2>
              </div>

              {cargandoPerfiles ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
                </div>
              ) : perfiles.length === 0 ? (
                <p className="py-6 text-[12.5px] text-muted-foreground">
                  No hay perfiles cargados. Igual podés empezar de cero.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {perfiles.map((p) => (
                    <button
                      key={p.rut}
                      type="button"
                      disabled={creando}
                      onClick={() => void iniciar(p)}
                      className="flex flex-col gap-1 rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/5 disabled:opacity-60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[11px] text-muted-foreground">{p.rut}</span>
                        {p.estado && (
                          <Badge variant="outline" className={`shrink-0 text-[9.5px] ${tonoEstado(p.estado)}`}>
                            {p.estado}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-[13.5px] font-semibold">{p.nombre}</p>
                      <p className="truncate text-[11.5px] text-muted-foreground">
                        {p.plan || "sin plan"}
                        {p.telefono ? ` · ${p.telefono}` : ""}
                      </p>
                      {p.direccion && <p className="truncate text-[11px] text-muted-foreground">{p.direccion}</p>}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                <Button variant="outline" size="sm" disabled={creando} onClick={() => void iniciar(null)}>
                  {creando ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                  )}
                  Empezar de cero
                </Button>
                <span className="text-[11.5px] text-muted-foreground">
                  Crea una conversación nueva con un teléfono generado, sin perfil.
                </span>
              </div>
            </div>
          ) : (
            <>
          <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold">{perfil ? perfil.nombre : conv.phone}</p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {conv.phone} · {conv.company_key}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 text-[10.5px]">
              modo prueba
            </Badge>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="px-3 py-3">
              <div className="mb-3 flex justify-center">
                <span className="rounded-full bg-muted px-3 py-1 text-center text-[11.5px] text-muted-foreground">
                  {etiquetaPrueba}
                </span>
              </div>

              {mensajes.length === 0 && (
                <p className="py-8 text-center text-[12.5px] text-muted-foreground">
                  Conversación nueva. Escribí abajo para arrancar.
                </p>
              )}
              {mensajes.map((m, i) => {
                const anterior = mensajes[i - 1];
                const pegada = !!anterior && anterior.role === m.role;
                const esImagen = m.kind === "imagen" && /^data:image\//.test(m.content);
                // El backend NO guarda el data URL del audio: en `content` queda la
                // transcripción. El data URL sólo existe en la burbuja optimista,
                // mientras el turno está en vuelo.
                const esAudioDataUrl = m.kind === "audio" && /^data:audio\//.test(m.content);
                const adjunto = esImagen
                  ? ({
                      url: m.content,
                      tipo: "imagen",
                      nombre: "imagen",
                      mime: "image/*",
                      tamano: 0,
                    } as Adjunto)
                  : esAudioDataUrl
                    ? ({
                        url: m.content,
                        tipo: "audio",
                        nombre: "audio",
                        mime: "audio/*",
                        tamano: 0,
                      } as Adjunto)
                    : null;
                const textoBurbuja = adjunto
                  ? ""
                  : m.kind === "audio"
                    ? `🎤 ${m.content || "(audio sin transcripción)"}`
                    : m.content;
                return (
                  <BurbujaSim
                    key={m.id}
                    rol={m.role}
                    texto={textoBurbuja}
                    hora={horaCorta(m.created_at)}
                    autor={m.role === "agent" ? "Agente ARTORIA" : null}
                    imagen={adjunto}
                    pegada={pegada}
                    onAbrirImagen={abrirAdjunto}
                  />
                );
              })}
              {enviando && (
                <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> el agente está respondiendo…
                </div>
              )}
              <div ref={finRef} />
            </div>
          </ScrollArea>

          {imagen && (
            <div className="flex items-center gap-2 border-t border-border/40 px-3 py-2">
              <img src={imagen.url} alt={imagen.nombre} className="h-10 w-10 rounded object-cover" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                {imagen.nombre} · {(imagen.tamano / 1024).toFixed(0)} KB
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setImagen(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {audio && (
            <div className="flex items-center gap-2 border-t border-border/40 px-3 py-2">
              <audio src={audio.url} controls preload="metadata" className="h-9 w-[220px] max-w-[55%]" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                {audio.nombre} · {(audio.tamano / 1024).toFixed(0)} KB
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAudio(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="border-t border-border/40 p-2">
            <div className="flex items-end gap-2">
              <input
                ref={inputArchivoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) elegirImagen(f);
                  e.currentTarget.value = "";
                }}
              />
              <input
                ref={inputAudioRef}
                type="file"
                accept="audio/*,.ogg,.mp3,.m4a,.wav,.webm"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) elegirAudio(f);
                  e.currentTarget.value = "";
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                aria-label="Adjuntar imagen"
                disabled={enviando}
                onClick={() => inputArchivoRef.current?.click()}
              >
                <ImagePlus className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                aria-label="Adjuntar audio"
                title="Audio: ogg, mp3, m4a, wav o webm (máx 12 MB)"
                disabled={enviando}
                onClick={() => inputAudioRef.current?.click()}
              >
                <Mic className="h-5 w-5" />
              </Button>

              <Input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enviar();
                  }
                }}
                disabled={enviando}
                placeholder="Escribí como si fueras el cliente…"
                className="h-10 flex-1"
              />

              <Button
                className="h-10 w-10 shrink-0"
                size="icon"
                aria-label="Enviar"
                disabled={enviando || (!texto.trim() && !imagen && !audio)}
                onClick={() => void enviar()}
              >
                {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </div>
            </>
          )}
        </section>

        {/* Traza */}
        <aside
          className={`w-full shrink-0 lg:block lg:h-full lg:w-[340px] ${
            trazaAbierta ? "block" : "hidden"
          }`}
        >
          <div className="h-full min-h-[260px]">
            <TrazaPanel turno={turno} runs={detalle?.runs || []} onCerrar={() => setTrazaAbierta(false)} />
          </div>
        </aside>
      </div>

    </div>
  );
}
