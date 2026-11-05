import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  FileText,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Mic,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  type TicketSim,
  type Veredicto,
} from "@/lib/simulador/api";

/* ─── Constantes ─────────────────────────────────────────────────────────── */

const MAX_IMAGEN_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024; // 10 MB
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
  latencia,
}: {
  rol: "user" | "agent";
  texto: string;
  hora: string;
  autor?: string | null;
  imagen?: Adjunto | null;
  pegada: boolean;
  onAbrirImagen: (a: Adjunto) => void;
  latencia?: string | null;
}) {
  const mio = rol === "user";
  return (
    <div className={`flex ${mio ? "justify-end" : "justify-start"} ${pegada ? "" : "mt-1.5"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 ${
          mio
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground dark:bg-secondary dark:text-secondary-foreground"
        }`}
      >
        {autor && !mio && (
          <p className="mb-0.5 text-xs font-semibold text-primary">{autor}</p>
        )}

        {imagen && <AdjuntoMensaje adjunto={imagen} onAbrir={() => onAbrirImagen(imagen)} />}

        {texto && (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{texto}</p>
        )}

        <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] opacity-60">
          {latencia && <span className="mr-1">⏱ {latencia}</span>}
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

function TarjetaTicket({ t }: { t: TicketSim }) {
  const fecha = new Date(t.created_at).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const prio =
    t.prioridad === "alta"
      ? "border-red-500/40 bg-red-500/10 text-red-600"
      : "border-amber-500/40 bg-amber-500/10 text-amber-600";
  return (
    <div className="mt-3 rounded-xl border border-border/50 bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          Ticket simulado
        </span>
        <span className={`rounded border px-1.5 py-0.5 text-[10.5px] font-medium ${prio}`}>
          prioridad {t.prioridad}
        </span>
      </div>
      <p className="mt-1 text-[13px] font-semibold text-foreground">
        {t.categoria.replace(/_/g, " ")} · {t.estado}
      </p>
      <div className="mt-1 space-y-0.5 text-[11.5px] text-foreground/90">
        <p>
          <span className="text-muted-foreground">Cliente: </span>
          {t.nombre ?? "No informado"}
          {t.rut ? ` · RUT ${t.rut}` : " · sin RUT"}
        </p>
        {t.direccion && (
          <p>
            <span className="text-muted-foreground">Dirección: </span>
            {t.direccion}
          </p>
        )}
        {t.plan && (
          <p>
            <span className="text-muted-foreground">Plan: </span>
            {t.plan}
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Motivo: </span>
          {t.descripcion}
        </p>
        <p>
          <span className="text-muted-foreground">Creado: </span>
          {fecha} · {t.id.slice(0, 12)}
        </p>
      </div>
      <p className="mt-1.5 text-[10.5px] text-muted-foreground">
        Derivación simulada: no se envió nada a producción.
      </p>
    </div>
  );
}

function FichaPerfil({ p, onCambiar }: { p: PerfilSim; onCambiar: () => void }) {
  const impagas = (p.boletas || []).filter((b) => !b.pagada);
  const deuda = impagas.reduce((a, b) => a + Number(b.monto || 0), 0);
  const suspendido = String(p.estado).toUpperCase().includes("SUSPEND");
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          Cliente de la prueba
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10.5px] font-medium ${
            suspendido
              ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
          }`}
        >
          {p.estado}
        </span>
      </div>
      <div>
        <p className="text-[13.5px] font-semibold text-foreground">{p.nombre}</p>
        <p className="text-[11.5px] text-muted-foreground">{p.rut} · {p.telefono}</p>
      </div>
      <div className="space-y-1 rounded-lg border border-border/40 bg-background p-2 text-[11.5px]">
        <p><span className="text-muted-foreground">Plan: </span>{p.plan}{p.costo_plan ? ` · $${p.costo_plan.toLocaleString("es-CL")}` : ""}</p>
        <p><span className="text-muted-foreground">Dirección: </span>{p.direccion}</p>
        <p>
          <span className="text-muted-foreground">Boletas: </span>
          {impagas.length ? `${impagas.length} pendiente(s) · $${deuda.toLocaleString("es-CL")}` : "sin pendientes"}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Equipos</p>
        {(p.equipos || []).map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-2 rounded border border-border/40 px-2 py-1 text-[11.5px]">
            <span className="truncate">{e.modelo}</span>
            <span className={/los|offline|power/i.test(e.estado) ? "text-red-600" : "text-emerald-600"}>
              {e.estado} · {e.online_dias} d
            </span>
          </div>
        ))}
        {!(p.equipos || []).length && <p className="text-[11.5px] text-muted-foreground">Sin equipos.</p>}
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={onCambiar}>
        Cambiar perfil de prueba
      </Button>
      <p className="text-[10.5px] text-muted-foreground">
        Datos reales (ISPControl, solo lectura). El agente NO los conoce: tiene que pedir el RUT.
      </p>
    </div>
  );
}

function ListaPerfiles({
  perfiles,
  creando,
  onElegir,
}: {
  perfiles: PerfilSim[];
  creando: boolean;
  onElegir: (p: PerfilSim) => void;
}) {
  return (
    <div className="space-y-2 p-2">
      {perfiles.map((p) => {
        const deuda = (p.boletas || [])
          .filter((b) => !b.pagada)
          .reduce((a, b) => a + Number(b.monto || 0), 0);
        const equipos = (p.equipos || []).map((e) => `${e.modelo}: ${e.estado}`).join(" · ");
        return (
          <div key={p.rut} className="rounded-lg border border-border/40 bg-background p-2">
            <p className="text-[12.5px] font-semibold text-foreground">{p.nombre}</p>
            <p className="text-[11px] text-muted-foreground">{p.rut} · {p.plan}</p>
            <p className="mt-0.5 text-[11px] text-foreground">
              {p.estado}
              {deuda > 0 ? ` · deuda $${deuda.toLocaleString("es-CL")}` : " · sin deuda"}
            </p>
            {equipos && <p className="mt-0.5 text-[10.5px] text-muted-foreground">{equipos}</p>}
            <Button
              size="sm"
              variant="outline"
              className="mt-1.5 h-6 px-2 text-[11px]"
              disabled={creando}
              onClick={() => onElegir(p)}
            >
              Usar este perfil
            </Button>
          </div>
        );
      })}
      {!perfiles.length && <p className="p-2 text-[12px] text-muted-foreground">Cargando perfiles…</p>}
    </div>
  );
}

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
  const [documento, setDocumento] = useState<Adjunto | null>(null);
  // Varios mensajes seguidos se agrupan en un solo turno: la misma respuesta
  // llega a cada POST y se pintaria varias veces. Se deduplica por runId.
  const pintados = useRef<Set<string>>(new Set());
  const [audio, setAudio] = useState<Adjunto | null>(null);
  const [enVuelo, setEnVuelo] = useState(0);
  const enviando = enVuelo > 0;
  const [turno, setTurno] = useState<RespuestaTurno | null>(null);

  // Mensajes optimistas (los que todavía no volvieron del servidor)
  const [pendientes, setPendientes] = useState<MensajeSim[]>([]);

  // Nueva conversación
  const [perfiles, setPerfiles] = useState<PerfilSim[]>([]);
  const [abrirNuevo, setAbrirNuevo] = useState(false);
  const [perfilesAbiertos, setPerfilesAbiertos] = useState(false);
  const [verFicha, setVerFicha] = useState(true);
  const [companyKey, setCompanyKey] = useState<CompanyKey>("dropp");
  const [perfilRut, setPerfilRut] = useState<string>("");
  const [telefono, setTelefono] = useState("");
  const [nombreLibre, setNombreLibre] = useState("");
  const [creando, setCreando] = useState(false);

  // Borrar
  const [aBorrar, setABorrar] = useState<ConversacionSim | null>(null);
  const [borrando, setBorrando] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const finRef = useRef<HTMLDivElement | null>(null);
  const inputArchivoRef = useRef<HTMLInputElement | null>(null);
  const inputAudioRef = useRef<HTMLInputElement | null>(null);
  const inputDocumentoRef = useRef<HTMLInputElement | null>(null);
  const juezTimer = useRef<number | null>(null);
  // Envios en vuelo: mientras haya alguno, recargar no debe borrar las burbujas
  // optimistas (si no, al volver a la pestaña parece que el mensaje no se envio).
  const enVueloRef = useRef(0);
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
    const vistos = new Set<string>();
    return [...base, ...pendientes]
      .filter((m) => (vistos.has(m.id) ? false : (vistos.add(m.id), true)))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
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
        if (enVueloRef.current === 0) setPendientes([]);
      }
      setSelId(id);
      if (!silencioso) setCargandoDetalle(true);
      try {
        const d = await simuladorApi.obtener(id);
        setDetalle(d);
        setVerFicha(true);
        // Lo que ya está en la base reemplaza a las burbujas optimistas, salvo
        // que haya un envio en vuelo: ahi se conservan hasta que llegue.
        if (enVueloRef.current === 0) setPendientes([]);
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


  // Al volver a la pestaña (o al foco) se recarga la conversacion: el turno pudo
  // terminar mientras la pestaña estaba en segundo plano y el navegador frena
  // timers. Sin esto, el mensaje y la respuesta quedan invisibles hasta cambiar
  // de conversacion.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible" || !selId) return;
      void abrirConversacionRef.current?.(selId, { conservarTurno: true, silencioso: true });
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [selId]);

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

  const elegirDocumento = (archivo: File) => {
    if (archivo.type !== "application/pdf") {
      setError("El documento tiene que ser un PDF.");
      return;
    }
    if (archivo.size > MAX_DOCUMENTO_BYTES) {
      setError(`El PDF pasa de 10 MB (${(archivo.size / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      const dataUrl = String(lector.result || "");
      if (!dataUrl.startsWith("data:application/pdf")) {
        setError("No se pudo leer el PDF.");
        return;
      }
      setDocumento({ url: dataUrl, tipo: "documento", nombre: archivo.name, mime: archivo.type, tamano: archivo.size });
    };
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
    if (!selId) return;
    const limpio = texto.trim();
    if (!limpio && !imagen && !audio && !documento) return;

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
    const documentoEnviado = documento;
    setImagen(null);
    setAudio(null);
    setDocumento(null);
    enVueloRef.current += 1;
    setEnVuelo((n) => n + 1);
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
        ...(documentoEnviado ? { documento: documentoEnviado.url } : {}),
      });

      setTurno(r);
      // La respuesta del agente se pinta al instante; después se recarga para
      // traer los ids canónicos y los runs.
      if (r.reply && !pintados.current.has(r.runId)) {
        pintados.current.add(r.runId);
        setPendientes((p) => [
          ...p,
          {
            id: `opt-reply-${r.runId}`,
            role: "agent",
            kind: "text",
            content: r.reply,
            created_at: new Date().toISOString(),
            meta: JSON.stringify({ ms: r.ms, debounceMs: r.debounceMs ?? 0 }),
          },
        ]);
      }
      // La derivacion es falsa, pero el ticket queda guardado: la bandeja lo muestra.
      setDetalle((d) => (d ? { ...d, tickets: r.tickets ?? d.tickets } : d));
      programarJuez(selId);
      void cargarLista();
    } catch (e: any) {
      setPendientes((p) => p.filter((m) => m.id !== optimista.id));
      setTexto(limpio);
      if (imagenEnviada) setImagen(imagenEnviada);
      if (audioEnviado) setAudio(audioEnviado);
      if (documentoEnviado) setDocumento(documentoEnviado);
      const esApi = e instanceof ErrorSimulador;
      setError(
        esApi
          ? e.message
          : e?.message || "No se pudo enviar el mensaje al simulador.",
      );
    } finally {
      enVueloRef.current = Math.max(0, enVueloRef.current - 1);
      setEnVuelo((n) => Math.max(0, n - 1));
    }
  };


  /** Borra la prueba actual y arranca una nueva con la misma empresa y cliente. */
  const reiniciarPrueba = async () => {
    const conv = detalle?.conversacion || convs.find((c) => c.id === selId) || null;
    setCreando(true);
    setError(null);
    try {
      if (conv?.id) await simuladorApi.borrar(conv.id).catch(() => {});
      const tel = conv?.phone || telefono.trim() || "+56911110000";
      const r = await simuladorApi.crear({
        companyKey,
        phone: tel,
        ...(conv?.client_rut ? { clientRut: conv.client_rut } : {}),
        ...(conv?.client_name ? { clientName: conv.client_name } : {}),
      });
      setDetalle(null);
      setPendientes([]);
      setTurno(null);
      pintados.current.clear();
      await cargarLista();
      if (r.conversacion?.id) await abrirConversacion(r.conversacion.id);
    } catch (e: any) {
      setError(e?.message || "No se pudo reiniciar la prueba.");
    } finally {
      setCreando(false);
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

  /**
   * Arranca una prueba desde un perfil, sin pasar por el diálogo: el simulador se
   * usa siempre desde cero (Demis no quiere ver el historial de conversaciones).
   */
  const crearConPerfil = async (p: PerfilSim) => {
    setCreando(true);
    setError(null);
    try {
      const r = await simuladorApi.crear({
        companyKey,
        phone: (p.telefono || telefono || "+56900000000").trim(),
        clientRut: p.rut,
        clientName: p.nombre,
      });
      await cargarLista();
      if (r.conversacion?.id) await abrirConversacion(r.conversacion.id);
    } catch (e: any) {
      setError(e?.message || "No se pudo crear la conversación.");
    } finally {
      setCreando(false);
    }
  };

  /** Prueba sin perfil: teléfono generado, el agente no tendrá datos del cliente. */
  const empezarDeCero = async () => {
    setCreando(true);
    setError(null);
    try {
      const tel = `+569${Math.floor(10000000 + Math.random() * 89999999)}`;
      const r = await simuladorApi.crear({ companyKey, phone: tel });
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

  const ultimoAgenteId = [...mensajes].reverse().find((m) => m.role === "agent")?.id;

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
          <div className="flex items-center gap-2">
            <span className="hidden text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline">
              Probando
            </span>
            <Select
              value={companyKey}
              onValueChange={(v) => {
                setCompanyKey(v as CompanyKey);
                setSelId(null);
                setDetalle(null);
                setPendientes([]);
                setTurno(null);
                pintados.current.clear();
              }}
            >
              <SelectTrigger className="h-8 w-[132px] text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dropp">Dropp Telecom</SelectItem>
                <SelectItem value="optve">Optve</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setPerfilesAbiertos(true)}>
            <Users className="mr-1.5 h-4 w-4" /> Perfiles
          </Button>
          <Button size="sm" onClick={() => void reiniciarPrueba()} disabled={creando}>
            {creando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
            Reiniciar
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
        

        {/* Chat */}
        <section className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-xl border border-border/40 bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold">
                {convActual ? convActual.phone : "Simulador de WhatsApp"}
              </p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {convActual
                  ? `${convActual.client_name || "sin nombre"} · ${convActual.company_key}`
                  : "Elegí un perfil de prueba para empezar"}
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
                <div className="mx-auto max-w-2xl py-2">
                  <h3 className="text-[15px] font-semibold">Empezá una prueba</h3>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    Elegí un perfil. Cada prueba arranca vacía y no toca el WhatsApp de producción.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {perfiles.map((p) => (
                      <button
                        key={p.rut}
                        type="button"
                        disabled={creando}
                        onClick={() => void crearConPerfil(p)}
                        className="rounded-lg border border-border/50 bg-background p-3 text-left transition-colors hover:bg-accent/60 disabled:opacity-50"
                      >
                        <p className="text-[13px] font-semibold">{p.nombre}</p>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                          {p.rut} · {p.plan} · {p.estado}
                        </p>
                        {p.direccion && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{p.direccion}</p>
                        )}
                      </button>
                    ))}
                  </div>
                  {!perfiles.length && (
                    <p className="mt-3 text-[12.5px] text-muted-foreground">Cargando perfiles…</p>
                  )}
                  <Button
                    variant="outline"
                    className="mt-3"
                    disabled={creando}
                    onClick={() => void empezarDeCero()}
                  >
                    {creando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Empezar de cero (sin perfil)
                  </Button>
                </div>
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
                const toolsDelTurno =
                  m.role === "agent" && m.id === ultimoAgenteId ? turno?.tools || [] : [];
                return (
                  <div key={m.id}>
                    <BurbujaSim
                      rol={m.role}
                      texto={textoBurbuja}
                      hora={horaCorta(m.created_at)}
                      autor={m.role === "agent" ? "Agente ARTORIA" : null}
                      imagen={adjunto}
                      pegada={pegada}
                      onAbrirImagen={abrirImagen}
                      latencia={(() => {
                        try {
                          const meta = m.meta ? JSON.parse(m.meta) : null;
                          if (!meta?.ms) return null;
                          const resp = Number(meta.ms) / 1000;
                          const delay = Number(meta.debounceMs ?? 0) / 1000;
                          return delay
                            ? `${delay.toFixed(0)} s + ${resp.toFixed(1)} s = ${(delay + resp).toFixed(1)} s`
                            : `${resp.toFixed(1)} s`;
                        } catch {
                          return null;
                        }
                      })()}
                    />
                    {toolsDelTurno.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1 pl-1">
                        {toolsDelTurno.map((t, k) => (
                          <span
                            key={`${t.name}-${k}`}
                            className={`rounded border px-1.5 py-0.5 text-[10.5px] ${
                              t.ok
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                            }`}
                          >
                            {t.name} · {t.ms} ms {t.ok ? "✓" : "✗"}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {enviando && (
                <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> el agente está respondiendo…
                </div>
              )}
              {detalle?.tickets?.length ? (
                <div className="mt-2">
                  {detalle.tickets.map((t) => (
                    <TarjetaTicket key={t.id} t={t} />
                  ))}
                </div>
              ) : null}
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

          {documento && (
            <div className="flex items-center gap-2 border-t border-border/40 px-3 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded bg-red-500/10 text-[10px] font-bold text-red-600">
                PDF
              </div>
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                {documento.nombre} · {(documento.tamano / 1024).toFixed(0)} KB
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDocumento(null)}>
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
                ref={inputDocumentoRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) elegirDocumento(f);
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
                disabled={!selId}
                onClick={() => inputArchivoRef.current?.click()}
              >
                <ImagePlus className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                aria-label="Adjuntar PDF"
                title="PDF: comprobante de servicios básicos (máx 10 MB)"
                disabled={!selId}
                onClick={() => inputDocumentoRef.current?.click()}
              >
                <FileText className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                aria-label="Adjuntar audio"
                title="Audio: ogg, mp3, m4a, wav o webm (máx 12 MB)"
                disabled={!selId}
                onClick={() => inputAudioRef.current?.click()}
              >
                <Mic className="h-5 w-5" />
              </Button>

              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  // Enter envia; Shift+Enter hace salto de linea.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enviar();
                  }
                }}
                rows={1}
                disabled={!selId}
                placeholder={selId ? "Escribí como si fueras el cliente… (Shift+Enter = salto de línea)" : "Reiniciá la prueba para escribir"}
                className="max-h-32 min-h-10 flex-1 resize-none py-2 text-[14px]"
              />

              <Button
                className="h-10 w-10 shrink-0"
                size="icon"
                aria-label="Enviar"
                disabled={!selId || (!texto.trim() && !imagen && !audio)}
                onClick={() => void enviar()}
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </section>

        {/* Perfiles de prueba */}
        <aside className="hidden w-full shrink-0 lg:block lg:h-full lg:w-[320px]">
          <div className="flex h-full min-h-[260px] flex-col overflow-hidden rounded-xl border border-border/40 bg-card">
            <div className="border-b border-border/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Perfiles de prueba
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {detalle?.ficha && verFicha ? (
                <FichaPerfil p={detalle.ficha} onCambiar={() => setVerFicha(false)} />
              ) : (
                <ListaPerfiles
                  perfiles={perfiles}
                  creando={creando}
                  onElegir={(p) => {
                    setVerFicha(true);
                    void crearConPerfil(p);
                  }}
                />
              )}
            </ScrollArea>
          </div>
        </aside>
      </div>


      {/* Perfiles (móvil) */}
      <Dialog open={perfilesAbiertos} onOpenChange={setPerfilesAbiertos}>
        <DialogContent className="border-border/30 bg-card sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Perfiles de prueba</DialogTitle>
            <DialogDescription>
              Elegí un caso: deuda, equipos caídos, suspendido. Cada prueba arranca vacía.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <ListaPerfiles
              perfiles={perfiles}
              creando={creando}
              onElegir={(p) => {
                setPerfilesAbiertos(false);
                void crearConPerfil(p);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

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
