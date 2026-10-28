import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  Mic,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

/* ─── Piezas visuales ────────────────────────────────────────────────────── */

/**
 * Burbuja copiada de `Burbuja` de src/components/soporte/ChatArto.tsx (es interna
 * y no se exporta). Se mantiene el mismo markup y los mismos tokens
 * `--sop-burbuja-*`, para que el simulador se vea como el widget real.
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
        className={`max-w-[80%] rounded-2xl px-3 py-2 ${mio ? "rounded-br-md" : "rounded-bl-md"}`}
        style={{ background: mio ? "var(--sop-burbuja-cliente)" : "var(--sop-burbuja-arto)" }}
      >
        {autor && !mio && (
          <p className="mb-0.5 text-xs font-semibold" style={{ color: "var(--sop-acento)" }}>
            {autor}
          </p>
        )}

        {imagen && <AdjuntoMensaje adjunto={imagen} onAbrir={() => onAbrirImagen(imagen)} />}

        {texto && (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{texto}</p>
        )}

        <div
          className="mt-0.5 flex items-center justify-end gap-1 text-[11px]"
          style={{ color: "var(--sop-texto-2)" }}
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

function fechaCorta(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "dd/MM HH:mm");
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
  // Lista de conversaciones
  const [convs, setConvs] = useState<ConversacionSim[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);

  // Conversación abierta
  const [selId, setSelId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DetalleConversacion | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Turno en curso
  const [texto, setTexto] = useState("");
  const [imagen, setImagen] = useState<Adjunto | null>(null);
  const [audio, setAudio] = useState<Adjunto | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [turno, setTurno] = useState<RespuestaTurno | null>(null);

  // Mensajes optimistas (los que todavía no volvieron del servidor)
  const [pendientes, setPendientes] = useState<MensajeSim[]>([]);

  // Nueva conversación
  const [perfiles, setPerfiles] = useState<PerfilSim[]>([]);
  const [abrirNuevo, setAbrirNuevo] = useState(false);
  const [companyKey, setCompanyKey] = useState<CompanyKey>("dropp");
  const [perfilRut, setPerfilRut] = useState<string>("");
  const [telefono, setTelefono] = useState("");
  const [nombreLibre, setNombreLibre] = useState("");
  const [creando, setCreando] = useState(false);

  // Borrar
  const [aBorrar, setABorrar] = useState<ConversacionSim | null>(null);
  const [borrando, setBorrando] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [trazaAbierta, setTrazaAbierta] = useState(false);

  const finRef = useRef<HTMLDivElement | null>(null);
  const inputArchivoRef = useRef<HTMLInputElement | null>(null);
  const inputAudioRef = useRef<HTMLInputElement | null>(null);
  const juezTimer = useRef<number | null>(null);
  const abrirConversacionRef = useRef<
    ((id: string, opciones?: { conservarTurno?: boolean; silencioso?: boolean }) => Promise<void>) | null
  >(null);

  /** El juez LLM corre en segundo plano: se vuelve a pedir la conversación a
   *  los ~6 s para traer `runs[].veredictos` sin bloquear el turno. */
  const cancelarJuez = useCallback(() => {
    if (juezTimer.current != null) {
      window.clearTimeout(juezTimer.current);
      juezTimer.current = null;
    }
  }, []);

  const programarJuez = useCallback(
    (id: string) => {
      cancelarJuez();
      juezTimer.current = window.setTimeout(() => {
        juezTimer.current = null;
        void abrirConversacionRef.current?.(id, { conservarTurno: true, silencioso: true });
      }, 6000);
    },
    [cancelarJuez],
  );

  useEffect(() => () => cancelarJuez(), [cancelarJuez]);

  const perfilSeleccionado = useMemo(
    () => perfiles.find((p) => p.rut === perfilRut) || null,
    [perfiles, perfilRut],
  );

  const mensajes = useMemo(() => {
    const base = detalle?.mensajes ? [...detalle.mensajes] : [];
    return [...base, ...pendientes];
  }, [detalle, pendientes]);

  const scrollAlFinal = useCallback(() => {
    requestAnimationFrame(() => {
      if (finRef.current) finRef.current.scrollIntoView({ block: "end" });
    });
  }, []);

  const cargarLista = useCallback(async () => {
    setCargandoLista(true);
    try {
      const r = await simuladorApi.listar();
      setConvs(r.conversaciones || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "No se pudieron cargar las conversaciones.");
    } finally {
      setCargandoLista(false);
    }
  }, []);

  const abrirConversacion = useCallback(
    async (id: string, opciones?: { conservarTurno?: boolean; silencioso?: boolean }) => {
      const conservar = !!opciones?.conservarTurno;
      const silencioso = !!opciones?.silencioso;
      if (!conservar) {
        setTurno(null);
        setPendientes([]);
      }
      setSelId(id);
      if (!silencioso) setCargandoDetalle(true);
      try {
        const d = await simuladorApi.obtener(id);
        setDetalle(d);
        // Lo que ya está en la base reemplaza a las burbujas optimistas.
        setPendientes([]);
        setError(null);
      } catch (e: any) {
        if (!silencioso) {
          setDetalle(null);
          setError(e?.message || "No se pudo abrir la conversación.");
        }
      } finally {
        if (!silencioso) setCargandoDetalle(false);
      }
    },
    [],
  );

  useEffect(() => {
    abrirConversacionRef.current = abrirConversacion;
  }, [abrirConversacion]);

  useEffect(() => {
    void cargarLista();
  }, [cargarLista]);

  useEffect(() => {
    void simuladorApi
      .perfiles()
      .then((r) => setPerfiles(r.perfiles || []))
      .catch(() => setPerfiles([]));
  }, []);

  useEffect(() => {
    if (mensajes.length > 0) scrollAlFinal();
  }, [mensajes.length, scrollAlFinal]);

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
    if (!selId || enviando) return;
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
        id: selId,
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
      void abrirConversacion(selId, { conservarTurno: true, silencioso: true }).then(() =>
        programarJuez(selId),
      );
      void cargarLista();
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

  const crear = async () => {
    const tel = telefono.trim();
    if (!tel) {
      setError("Escribí el teléfono de prueba: el contrato de sim-proxy lo exige.");
      return;
    }
    setCreando(true);
    setError(null);
    try {
      const r = await simuladorApi.crear({
        companyKey,
        phone: tel,
        ...(perfilSeleccionado
          ? { clientRut: perfilSeleccionado.rut, clientName: perfilSeleccionado.nombre }
          : nombreLibre.trim()
            ? { clientName: nombreLibre.trim() }
            : {}),
      });
      setAbrirNuevo(false);
      setTelefono("");
      setNombreLibre("");
      setPerfilRut("");
      await cargarLista();
      if (r.conversacion?.id) await abrirConversacion(r.conversacion.id);
    } catch (e: any) {
      setError(e?.message || "No se pudo crear la conversación.");
    } finally {
      setCreando(false);
    }
  };

  const borrar = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      await simuladorApi.borrar(aBorrar.id);
      if (selId === aBorrar.id) {
        setSelId(null);
        setDetalle(null);
        setPendientes([]);
        setTurno(null);
      }
      setABorrar(null);
      await cargarLista();
    } catch (e: any) {
      setError(e?.message || "No se pudo borrar la conversación.");
    } finally {
      setBorrando(false);
    }
  };

  const abrirImagen = (a: Adjunto) => window.open(a.url, "_blank", "noopener,noreferrer");

  const convActual = convs.find((c) => c.id === selId) || detalle?.conversacion || null;

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
          <Button size="sm" onClick={() => setAbrirNuevo(true)}>
            <MessageSquarePlus className="mr-1.5 h-4 w-4" /> Nueva conversación
          </Button>
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
        {/* Lista */}
        <aside className="flex min-h-[180px] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border/40 bg-card lg:h-full lg:w-[260px]">
          <div className="border-b border-border/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Conversaciones
          </div>
          <ScrollArea className="min-h-0 flex-1">
            {cargandoLista ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
              </div>
            ) : convs.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">Sin conversaciones.</p>
            ) : (
              <ul className="divide-y divide-border/30">
                {convs.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        cancelarJuez();
                        void abrirConversacion(c.id);
                      }}
                      className={`group flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent/60 ${
                        selId === c.id ? "bg-accent/80" : ""
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium">{c.phone}</span>
                        <span className="shrink-0 text-[10.5px] text-muted-foreground">{fechaCorta(c.updated_at)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11.5px] text-muted-foreground">
                          {c.client_name || "sin nombre"} · {c.company_key}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="Borrar conversación"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setABorrar(c);
                          }}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.stopPropagation();
                              setABorrar(c);
                            }
                          }}
                          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </aside>

        {/* Chat */}
        <section className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-xl border border-border/40 bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold">
                {convActual ? convActual.phone : "Elegí una conversación"}
              </p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {convActual
                  ? `${convActual.client_name || "sin nombre"} · ${convActual.company_key}`
                  : "o creá una nueva con un perfil de prueba"}
              </p>
            </div>
            {convActual && (
              <Badge variant="outline" className="shrink-0 text-[10.5px]">
                modo prueba
              </Badge>
            )}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="px-3 py-3">
              {!selId && (
                <p className="py-10 text-center text-[12.5px] text-muted-foreground">
                  Sin conversación abierta.
                </p>
              )}
              {selId && cargandoDetalle && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
                </div>
              )}
              {selId && !cargandoDetalle && mensajes.length === 0 && (
                <p className="py-10 text-center text-[12.5px] text-muted-foreground">
                  Todavía no hay mensajes: escribí abajo para arrancar.
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
                    onAbrirImagen={abrirImagen}
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
                disabled={!selId || enviando}
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
                disabled={!selId || enviando}
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
                disabled={!selId || enviando}
                placeholder={selId ? "Escribí como si fueras el cliente…" : "Elegí una conversación"}
                className="h-10 flex-1"
              />

              <Button
                className="h-10 w-10 shrink-0"
                size="icon"
                aria-label="Enviar"
                disabled={!selId || enviando || (!texto.trim() && !imagen && !audio)}
                onClick={() => void enviar()}
              >
                {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </div>
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

      {/* Nueva conversación */}
      <Dialog open={abrirNuevo} onOpenChange={setAbrirNuevo}>
        <DialogContent className="border-border/30 bg-card sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Nueva conversación de prueba</DialogTitle>
            <DialogDescription>
              Elegí un perfil de prueba o escribí un teléfono libre. Nada de esto toca el WhatsApp de producción.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground">Empresa</label>
              <Select value={companyKey} onValueChange={(v) => setCompanyKey(v as CompanyKey)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPRESAS.map((e) => (
                    <SelectItem key={e.key} value={e.key}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground">Perfil de prueba</label>
              <Select
                value={perfilRut || "__ninguno"}
                onValueChange={(v) => {
                  if (v === "__ninguno") {
                    setPerfilRut("");
                    return;
                  }
                  setPerfilRut(v);
                  // El perfil ya trae su teléfono: se precarga y queda editable
                  // por si hay que probar otro número.
                  const p = perfiles.find((x) => x.rut === v);
                  if (p?.telefono) setTelefono(p.telefono);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sin perfil (teléfono libre)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ninguno">Sin perfil (teléfono libre)</SelectItem>
                  {perfiles.map((p) => (
                    <SelectItem key={p.rut} value={p.rut}>
                      {p.rut} · {p.nombre}
                      {p.plan ? ` · ${p.plan}` : ""}
                      {p.estado ? ` · ${p.estado}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {perfilSeleccionado && (
                <p className="text-[11.5px] text-muted-foreground">
                  {perfilSeleccionado.direccion || "sin dirección"}
                  {perfilSeleccionado.plan ? ` · plan ${perfilSeleccionado.plan}` : ""}
                  {perfilSeleccionado.estado ? ` · ${perfilSeleccionado.estado}` : ""}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground">
                Teléfono de prueba <span className="text-destructive">*</span>
              </label>
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+56 9 0000 0000"
                className="h-9"
              />
            </div>

            {!perfilSeleccionado && (
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-muted-foreground">Nombre del cliente (opcional)</label>
                <Input
                  value={nombreLibre}
                  onChange={(e) => setNombreLibre(e.target.value)}
                  placeholder="Cliente de prueba"
                  className="h-9"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbrirNuevo(false)} disabled={creando}>
              Cancelar
            </Button>
            <Button onClick={() => void crear()} disabled={creando}>
              {creando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Borrar */}
      <AlertDialog open={!!aBorrar} onOpenChange={(v) => !v && setABorrar(null)}>
        <AlertDialogContent className="border-border/30 bg-card" aria-describedby={undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar la conversación de prueba?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra {aBorrar?.phone} con sus mensajes y trazas. No afecta nada fuera del simulador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void borrar();
              }}
              disabled={borrando}
            >
              {borrando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
