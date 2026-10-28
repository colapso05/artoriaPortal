import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Suspense, lazy } from "react";
const ScheduleTab = lazy(() => import("./schedule/ScheduleTab"));

const sinTildes = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * La etiqueta de ticket "Técnicos", si la empresa todavía la tiene.
 *
 * Dejó de ser un estado de ticket: un técnico escribiendo no es un caso que
 * haya que resolver y cerrar. Pero las conversaciones que ya quedaron marcadas
 * así siguen ahí, así que la etiqueta se reconoce para dos cosas: esconderla de
 * donde ya no corresponde —los filtros normales y el selector de estado— y
 * seguir incluyendo esos chats bajo el filtro nuevo.
 */
const esEtiquetaTecnicos = (l: { key: string; name: string }) =>
  sinTildes(l.key) === "tecnicos" || sinTildes(l.name) === "tecnicos";
import * as Sentry from "@sentry/react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getShortcuts, type Shortcut } from "@/components/dashboard/ShortcutsManager";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSidebar, SidebarTrigger } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send, Search, ArrowLeft, Bot, Monitor,
  Phone, FileText, CheckCheck, Check, Clock,
  Ticket, User, Info, AlertCircle, XCircle, MessageCircle, X, Loader2, Download, Hand, Forward, SlidersHorizontal, Menu,
  ChevronDown, Copy, MapPin, Flame, StickyNote, CalendarClock, Plus, MessageSquarePlus,
  Calendar, CalendarCheck, RefreshCw, Power, Wifi, MoreVertical, Pencil, Trash2,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateTicketDialog } from "./CreateTicketDialog";
import PanelTecnico from "./PanelTecnico";
import { useTecnicos } from "@/hooks/useTecnicos";
import { MediaLightbox, type LightboxMedia } from "@/components/ui/MediaLightbox";
import { PdfPreview } from "@/components/ui/PdfPreview";
import { OnuPanel } from "@/components/dashboard/OnuPanel";
import { useOnuSignal } from "@/hooks/useOnuSignal";
import { CustomerTicketsSearch } from "./CustomerTicketsSearch";
import { ControlPropiedadCaso, ChipDueno } from "./ControlPropiedadCaso";
import { casoTomar, casoLiberar, casoTransferir, casoAbandonado, type CasoResultado } from "@/lib/casos";
import { useOperadores, mapaOperadores } from "@/hooks/useOperadores";
import { DialogoVeredicto } from "@/components/dashboard/ConversationsAnalytics";
import { useCanalSalida } from "@/hooks/useCanalSalida";
import { enviarPorCanal, editarMensajeEvolution, borrarMensajeEvolution, type CuerpoEnvio, type Proveedor, type ResultadoEnvio } from "@/lib/canalSalida";

/**
 * Estados que dan por terminado un ticket. Todo lo demás (En Proceso, Agendado,
 * Espera de Agenda, Revisión IA, …) significa que el ticket SIGUE ABIERTO y debe
 * conservar todas sus funcionalidades.
 *
 * Se incluyen 'resuelto'/'cerrado' como piso fijo para que el criterio sea correcto
 * incluso si `ticket_labels` todavía no terminó de cargar.
 */
const getFinalStatuses = (labels: Array<{ key: string; is_final?: boolean }>) =>
  new Set<string>(['resuelto', 'cerrado', ...labels.filter(l => l.is_final).map(l => l.key)]);

interface Conversation {
  id: string;
  wa_id: string;
  profile_name: string | null;
  profile_picture_url: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  is_agent_active?: boolean;
  assigned_role?: string | null;
  assigned_user_id?: string | null;
  taken_by?: string | null;
  taken_at?: string | null;
  company_id: string | null;
  status: 'abierto' | 'en_progreso' | 'cerrado'; // Virtual/Infered field
  match_content?: string; // For search results
  priority?: 'alta' | 'media' | 'baja' | null;
  /** Última vez que el cliente escribió desde el chat web (artoria.cl/soporte). */
  web_activo_en?: string | null;
}

interface Message {
  id: string;
  conversation_id: string;
  wa_message_id: string | null;
  direction: string;
  content: string;
  message_type: string;
  status: string | null;
  sender_name: string | null;
  sender_type?: string;
  media_url?: string | null;
  media_type?: string | null;
  context_message_id?: string | null;
  quoted_content?: string | null;
  /** 'web' cuando el mensaje entró o salió por el chat de soporte en vez de WhatsApp. */
  channel?: string | null;
  /**
   * Por dónde salió: 'ycloud' (API oficial de Meta) o 'evolution' (sesión de
   * WhatsApp Web, sin costo). Todo lo histórico quedó como 'ycloud'.
   */
  provider?: string | null;
  created_at: string;
}

function formatMessageTime(dateStr: string) {
  return format(new Date(dateStr), "HH:mm");
}

function formatWhatsAppText(text: string) {
  if (!text) return "";
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold
  formatted = formatted.replace(/\*([^\*]+)\*/g, "<strong>$1</strong>");
  // Italic
  formatted = formatted.replace(/_([^_]+)_/g, "<em>$1</em>");
  // Strikethrough
  formatted = formatted.replace(/~([^~]+)~/g, "<del>$1</del>");
  // Code
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-black/20 px-1 py-0.5 rounded text-[11px] font-mono">$1</code>');

  return formatted;
}

function formatConvDate(dateStr: string) {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return format(date, "dd/MM");
}

function getSenderBadge(senderType?: string, senderName?: string | null) {
  switch (senderType) {
    case "agent":
      return { icon: Bot, label: senderName || "ARTORIA" };
    case "specialist":
      return { icon: Phone, label: senderName || "Especialista" };
    case "platform":
      return { icon: Monitor, label: senderName || "Plataforma" };
    default:
      return null;
  }
}

function StatusIcon({ status, provider }: { status: string | null; provider?: string | null }) {
  /*
   * El canal sin costo no devuelve acuses: sus mensajes se quedan en "sent" para
   * siempre. Pintarles el reloj de pendiente o dejarlos con un solo check haria
   * creer al operador que no llegaron, y lo normal es que si hayan llegado.
   */
  if (provider === "evolution" && status !== "failed") {
    return (
      <Check
        className="w-[10px] h-[10px] text-muted-foreground/50"
        aria-label="Enviado"
      />
    );
  }
  if (!status) return <Clock className="w-[10px] h-[10px] text-muted-foreground/40" />;
  switch (status) {
    case "sent": return <Check className="w-[10px] h-[10px] text-muted-foreground/50" />;
    case "delivered": return <CheckCheck className="w-[10px] h-[10px] text-muted-foreground/50" />;
    case "read": return <CheckCheck className="w-[10px] h-[10px] text-blue-400" />;
    case "failed": return <AlertCircle className="w-[10px] h-[10px] text-destructive" />;
    default: return <Clock className="w-[10px] h-[10px] text-muted-foreground/40" />;
  }
}

function StatusBadge({ status, className = "" }: { status: string, className?: string }) {
  const configs: Record<string, { label: string; color: string; bg: string; pulse: string }> = {
    abierto: { label: 'ACTIVO', color: 'text-green-500', bg: 'bg-green-500', pulse: 'bg-green-400' },
    en_progreso: { label: 'En proceso', color: 'text-yellow-500', bg: 'bg-yellow-500', pulse: 'bg-yellow-400' },
  };

  const config = configs[status] || configs.en_progreso;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="relative flex h-2 w-2">
        <div className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.pulse} opacity-75`}></div>
        <div className={`relative inline-flex rounded-full h-2 w-2 ${config.bg}`}></div>
      </div>
      <span className={`text-[9px] font-bold tracking-widest uppercase ${config.color}`}>
        {config.label}
      </span>
    </div>
  );
}

// Badge dinámico: Prioriza etiqueta de ticket (si no es resuelto), sino muestra EN VIVO (agente)
function ConvStatusBadge({ conv, ticketStatus, labels }: {
  conv: Conversation;
  ticketStatus?: string;
  labels: Array<{ key: string; name: string; color: string }>;
}) {
  const tsLabel = ticketStatus ? labels.find(l => l.key === ticketStatus) : null;

  if (tsLabel) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded border shadow-sm" style={{ color: tsLabel.color, borderColor: tsLabel.color + '40', backgroundColor: tsLabel.color + '15' }}>
        <span className="w-1.5 h-1.5 rounded-full shadow-sm" style={{ backgroundColor: tsLabel.color, boxShadow: `0 0 6px ${tsLabel.color}` }} />
        {tsLabel.name}
      </span>
    );
  }

  if (conv.is_agent_active) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-green-500/30 bg-green-500/10 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_6px_#22c55e]" />
        <span className="text-[9px] font-black tracking-widest uppercase text-green-500 drop-shadow-sm">EN VIVO</span>
      </span>
    );
  }

  return null;
}

function getMediaType(mediaUrl: string, messageType?: string): 'image' | 'audio' | 'video' | 'document' {
  try {
    // 1. Try decoding YCloud payload
    const urlObj = new URL(mediaUrl);
    const payload = urlObj.searchParams.get('payload');
    if (payload) {
      const decoded = JSON.parse(atob(payload));
      const mime = decoded.mimeType || '';
      if (mime.startsWith('image')) return 'image';
      if (mime.startsWith('audio') || mime.includes('ogg')) return 'audio';
      if (mime.startsWith('video')) return 'video';
    }

    // 2. Fallback to extension/keywords if not a YCloud URL or payload missing
    const lowUrl = mediaUrl.toLowerCase();
    if (lowUrl.includes('image') || /\.(jpg|jpeg|png|gif|webp|heic)/i.test(lowUrl) || messageType === 'image') return 'image';
    if (lowUrl.includes('audio') || /\.(ogg|mp3|wav|m4a|amr)/i.test(lowUrl) || messageType === 'audio') return 'audio';
    if (lowUrl.includes('video') || /\.(mp4|mov|avi|3gp|mkv|wmv)/i.test(lowUrl) || messageType === 'video' || messageType === 'short_video') return 'video';
  } catch (e) {
    console.error("Error detecting media type:", e);
  }
  return 'document';
}

function MessageMedia({ message, onOpen }: { message: Message; onOpen: (m: LightboxMedia) => void }) {
  const url = message.media_url;
  if (!url) return null;

  const type = getMediaType(url, message.message_type);
  // URLs from Supabase Storage are public and loadable by the browser directly
  const isSupabaseUrl = url.includes('supabase.artoria.cl') || url.includes('supabase.co/storage');

  if (type === 'image') {
    return (
      <img
        src={url}
        alt="WhatsApp Image"
        className="rounded-lg max-w-[280px] md:max-w-xs max-h-[320px] object-cover cursor-pointer hover:opacity-90 transition mb-1.5 shadow-sm"
        onClick={() => onOpen({ url, type: "image" })}
        onError={(e) => {
          const el = e.currentTarget;
          el.style.display = "none";
          const placeholder = document.createElement("div");
          placeholder.className = "flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/30 text-xs text-muted-foreground mb-1.5";
          placeholder.innerHTML = "📷 Imagen no disponible (enlace expirado)";
          el.parentNode?.insertBefore(placeholder, el.nextSibling);
        }}
      />
    );
  }

  if (type === 'audio') {
    // Native player for Supabase Storage URLs
    if (isSupabaseUrl) {
      return (
        <div className="mb-1.5">
          <audio controls className="w-56 h-10 rounded-lg" preload="metadata">
            <source src={url} type="audio/ogg" />
            <source src={url} type="audio/mpeg" />
          </audio>
        </div>
      );
    }
    // Fallback link for old YCloud URLs
    return (
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 rounded-lg px-4 py-2.5 text-sm text-white transition-colors mb-1.5 shadow-md w-fit"
      >
        <Phone className="w-4 h-4" />
        <span className="font-medium">🎵 Reproducir audio</span>
      </a>
    );
  }

  if (type === 'video') {
    // Native player for Supabase Storage URLs
    if (isSupabaseUrl) {
      return (
        <div className="mb-2">
          <video controls className="max-w-xs rounded-lg w-full" preload="metadata" playsInline>
            <source src={url} />
            Tu navegador no soporta el reproductor de video.
          </video>
        </div>
      );
    }
    // Full player with overlay button for YCloud or other URLs
    return (
      <div className="relative group/video max-w-[280px] rounded-xl overflow-hidden bg-slate-900 border border-border/10 shadow-2xl mb-2">
        <video
          className="w-full h-auto aspect-video cursor-pointer"
          controls
          playsInline
          preload="metadata"
        >
          <source src={url} />
          Tu navegador no soporta el reproductor de video.
        </video>
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover/video:opacity-100 transition-opacity">
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 rounded-full bg-black/60 hover:bg-black/90 text-white border-0 backdrop-blur-sm"
            onClick={() => onOpen({ url, type: "video" })}
          >
            <Monitor className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  // Document/File — tarjeta tipo WhatsApp que abre el visor dentro del portal.
  // El nombre real llega en el contenido del mensaje; la URL solo trae un UUID.
  const rawName = (message.content || "")
    .replace(/^📎\s*Archivo adjunto:\s*/i, "")
    .replace(/^📄\s*/, "")
    .trim();
  const fileName = rawName && !/^https?:/i.test(rawName)
    ? rawName
    : (decodeURIComponent(url.split('/').pop()?.split('?')[0] || "") || "Archivo adjunto");
  const isPdf = /\.pdf(\?|$)/i.test(url) || /pdf/i.test(fileName);
  const ext = (fileName.split('.').pop() || '').toUpperCase().slice(0, 4);

  // PDF → tarjeta con vista previa de la primera página (estilo WhatsApp).
  if (isPdf) {
    return <PdfPreview url={url} fileName={fileName} onOpen={() => onOpen({ url, type: "pdf", name: fileName })} />;
  }

  return (
    <button
      onClick={() => onOpen({ url, type: "other", name: fileName })}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition mb-1.5 border border-border/30 w-full max-w-[280px] text-left"
    >
      <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
        <FileText className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium truncate leading-tight">{fileName}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">{ext || "Archivo"} · toca para ver</p>
      </div>
    </button>
  );
}

// ── Tipos para plantillas de WhatsApp ───────────────────────────────────────
interface WATplComponent {
  type: string;           // "HEADER" | "BODY" | "FOOTER" | "BUTTONS"
  format?: string;        // "TEXT" | "IMAGE" | ...
  text?: string;
  buttons?: { type: string; text: string }[];
}
interface WhatsAppTemplate {
  name: string;
  language: string;
  category: string;
  status: string;
  components: WATplComponent[];
}
interface TemplateVar {
  componentType: string;  // "header" | "body"
  varIndex: number;       // posición en el array (1, 2, 3 …)
  varName: string;        // nombre real: "1", "2", "motivo", "nombre", etc.
  contextText: string;    // texto completo del componente (para dar contexto al operador)
}

interface WhatsAppInboxProps {
  companyId?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  operatorRoles?: string[];
  initialConversationId?: string;
  initialPhone?: string;
  initialMessage?: string;
  onConversationOpened?: () => void;
  onConversationSelect?: (conversationId: string | null) => void;
  isSimulating?: boolean;
  simulatedUserName?: string;
  onNavigateToSchedule?: () => void;
  /** Lleva a Configuracion, donde se vincula la sesion de WhatsApp sin costo. */
  onNavigateToSettings?: () => void;
}

// ── Panel vacío: Agenda del día + Notas del turno ──────────────────────────
function InboxEmptyPanel({ companyId, onNavigateToSchedule }: { companyId?: string; onNavigateToSchedule?: () => void }) {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [notes, setNotes] = useState("");

  // Carga agenda de hoy
  useEffect(() => {
    if (!companyId) { setLoadingAppts(false); return; }
    const todayStr = format(new Date(), "yyyy-MM-dd");
    (supabase as any)
      .from("appointments")
      .select("id, start_datetime, client_name, client_address, status, technician_id")
      .eq("company_id", companyId)
      .neq("status", "cancelado")
      .gte("start_datetime", `${todayStr}T00:00:00`)
      .lte("start_datetime", `${todayStr}T23:59:59`)
      .order("start_datetime")
      .then(({ data }: any) => { setAppointments(data || []); setLoadingAppts(false); });
  }, [companyId]);

  // Carga notas del día desde localStorage (clave con fecha → se autolimpian)
  useEffect(() => {
    const key = `inbox_notes_${companyId}_${format(new Date(), "yyyy-MM-dd")}`;
    setNotes(localStorage.getItem(key) || "");
  }, [companyId]);

  const handleNotes = (value: string) => {
    const key = `inbox_notes_${companyId}_${format(new Date(), "yyyy-MM-dd")}`;
    localStorage.setItem(key, value);
    setNotes(value);
  };

  const statusDot: Record<string, string> = {
    pendiente:  "bg-amber-400",
    en_camino:  "bg-blue-400",
    completado: "bg-emerald-500",
  };

  const statusLabel: Record<string, string> = {
    pendiente: "Pendiente",
    en_camino: "En camino",
    completado: "Completado",
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Agenda del día ── */}
      <div className="flex-[3] flex flex-col min-h-0 border-b border-border/20">
        <div className="px-5 py-3 flex items-center justify-between flex-shrink-0 border-b border-border/20 bg-muted/40">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Agenda de hoy</span>
          </div>
          {onNavigateToSchedule && (
            <button
              onClick={onNavigateToSchedule}
              className="text-[10px] font-semibold text-primary hover:text-primary/70 transition-colors"
            >
              Ver todo →
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loadingAppts ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          ) : appointments.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 py-6">
              <CalendarCheck className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground/70">Sin citas para hoy</p>
            </div>
          ) : (
            <div className="space-y-1">
              {appointments.map(appt => {
                const time = format(parseISO(appt.start_datetime), "HH:mm");
                const dot = statusDot[appt.status] || "bg-muted-foreground/40";
                const lbl = statusLabel[appt.status] || appt.status;
                return (
                  <div key={appt.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors group">
                    <span className="text-xs font-mono font-bold text-muted-foreground flex-shrink-0 w-10 tabular-nums">{time}</span>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate leading-tight text-foreground">{appt.client_name}</p>
                      {appt.client_address && (
                        <p className="text-[10px] text-muted-foreground/70 truncate flex items-center gap-1 mt-0.5">
                          <MapPin className="w-2.5 h-2.5 flex-shrink-0" />{appt.client_address}
                        </p>
                      )}
                    </div>
                    <span className={`text-[9px] font-bold uppercase tracking-wide flex-shrink-0 px-1.5 py-0.5 rounded-full
                      ${appt.status === "completado" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                        appt.status === "en_camino"  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
                                                       "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
                      {lbl}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Notas del turno ── */}
      <div className="flex-[2] flex flex-col min-h-0">
        <div className="px-5 py-3 flex items-center gap-2 flex-shrink-0 border-b border-border/20 bg-muted/40">
          <StickyNote className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Notas del turno</span>
        </div>
        <div className="flex-1 flex flex-col min-h-0 p-3 gap-2">
          <textarea
            value={notes}
            onChange={e => handleNotes(e.target.value)}
            placeholder={"Apuntes rápidos del turno...\n(números, instrucciones, recordatorios)"}
            className="flex-1 min-h-0 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none border-none focus:ring-0 leading-relaxed font-medium"
          />
          <p className="text-[10px] text-muted-foreground/60 text-center flex-shrink-0 leading-tight">
            Se borran automáticamente al terminar el día
          </p>
        </div>
      </div>

    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

/**
 * Lo que se ve al pasar el mouse por un chat de la lista.
 *
 * La nota y el último mensaje conviven, no compiten: contestan cosas distintas.
 * La nota es lo que hay que saber del caso —la escribió alguien y no cambia
 * sola— y el mensaje es qué pasó recién. Elegir una escondía la otra, así que
 * van las dos, con la nota primero porque es la que cambia a quién atender.
 */
export function VistaPreviaChat({ nota, mensaje, quien, rect }: {
  nota: string | null | undefined;
  mensaje: string | null | undefined;
  /** Quién mandó el último mensaje, ya resuelto a texto. */
  quien: string | null | undefined;
  rect: DOMRect | null;
}) {
  if (!rect) return null;
  const n = nota?.trim();
  const m = mensaje?.trim();
  if (!n && !m) return null;

  /*
   * Si la fila está en la mitad de abajo, el globo se ancla por el pie. Centrado
   * siempre, una fila del final lo empujaba fuera de la pantalla.
   */
  const ancho = typeof window !== "undefined" ? window.innerWidth : 1200;
  const alto = typeof window !== "undefined" ? window.innerHeight : 800;
  const centro = rect.top + rect.height / 2;
  const abajo = centro > alto / 2;

  return (
    <div
      className="pointer-events-none fixed z-[9999] w-[300px] rounded-xl shadow-2xl animate-in fade-in slide-in-from-left-2 duration-200 overflow-hidden border border-border bg-popover backdrop-blur-xl"
      style={{
        left: Math.min(rect.right + 12, ancho - 316),
        [abajo ? "bottom" : "top"]: abajo ? Math.max(8, alto - centro - rect.height) : Math.max(8, centro - rect.height),
      }}
    >
      {n && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400" />}
      {n && (
        <div className="pl-4 pr-3.5 pt-3 pb-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider">Nota del caso</span>
          </div>
          <p className="text-[13px] font-semibold text-foreground leading-relaxed break-words line-clamp-4 uppercase">
            {n}
          </p>
        </div>
      )}
      {n && m && <div className="h-px bg-border/60 mx-3.5" />}
      {m && (
        <div className={`${n ? "pl-4" : "pl-3.5"} pr-3.5 pt-2.5 pb-3`}>
          {/*
           * La hora no va: ya está en la fila, a la derecha del nombre, y acá
           * repetida solo agrega ruido. Quién lo mandó sí importa — es la
           * diferencia entre "hay alguien esperando" y "ya le contestamos".
           */}
          <div className="flex items-baseline gap-1.5 mb-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Último mensaje
            </span>
            {quien && <span className="text-[10px] text-muted-foreground/45">· {quien}</span>}
          </div>
          <p className="text-[12px] text-foreground/85 leading-relaxed break-words whitespace-pre-wrap line-clamp-[10]">
            {m}
          </p>
        </div>
      )}
    </div>
  );
}

export default function WhatsAppInbox({ companyId, userId, userName, userRole, operatorRoles, initialConversationId, initialPhone, initialMessage, onConversationOpened, onConversationSelect, isSimulating, simulatedUserName, onNavigateToSchedule, onNavigateToSettings }: WhatsAppInboxProps) {
  // En vista simulada el admin escribe como el usuario simulado, así el historial queda correcto
  const effectiveSenderName = (isSimulating && simulatedUserName) ? simulatedUserName : userName;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasContent, setHasContent] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const { setOpenMobile: setSidebarOpen } = useSidebar();
  const [sending, setSending] = useState(false);
  const [ticketRefreshCounter, setTicketRefreshCounter] = useState(0);
  // Slash command autocomplete
  const [slashShortcuts, setSlashShortcuts] = useState<Shortcut[]>([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const msgTextareaRef = useRef<HTMLTextAreaElement>(null);
  const slashStartRef = useRef<number>(-1);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  // Búsqueda: ref para cancelar resultados de fetches viejos (race condition)
  const searchGenerationRef = useRef(0);
  const [chatFilter, setChatFilter] = useState<string>('all');
  // Scroll infinito de la lista de conversaciones (virtualización del render).
  const CONV_PAGE = 40;
  const [convVisibleCount, setConvVisibleCount] = useState(CONV_PAGE);
  const convSentinelRef = useRef<HTMLDivElement | null>(null);
  // Visor de imágenes/PDF dentro del portal (sin abrir pestañas).
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);
  const [ticketStatusByConvId, setTicketStatusByConvId] = useState<Record<string, string>>({});
  const [ticketLabels, setTicketLabels] = useState<Array<{key: string; name: string; color: string; is_initial?: boolean; is_final?: boolean}>>([
    { key: 'abierto', name: 'Abierto', color: '#22c55e', is_initial: true },
    { key: 'en_proceso', name: 'En Proceso', color: '#3b82f6' },
    { key: 'esperando_respuesta', name: 'Esperando Respuesta', color: '#f59e0b' },
    { key: 'en_espera', name: 'Retiro por confirmar', color: '#8b5cf6' },
    { key: 'resuelto', name: 'Resuelto', color: '#a855f7', is_final: true },
  ]);
  const [filterCounts, setFilterCounts] = useState<Array<{key: string; label: string; color: string; is_initial: boolean; is_final: boolean; total_convs: number; unread_convs: number}>>([]);
  const [filteredConvIds, setFilteredConvIds] = useState<Set<string> | null>(null);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferRole, setTransferRole] = useState("soporte_tecnico");
  // ── Propiedad del caso ──────────────────────────────────────────────────────
  const [casoOcupado, setCasoOcupado] = useState(false);
  /** Confirmación antes de quitarle el caso a alguien: conviene que sea deliberado. */
  const [arrebatoPendiente, setArrebatoPendiente] = useState<{ convId: string; nombre: string } | null>(null);
  const [transferPersonaOpen, setTransferPersonaOpen] = useState(false);
  const [transferPersonaId, setTransferPersonaId] = useState("");
  const [transferPersonaNota, setTransferPersonaNota] = useState("");
  const [activeTicket, setActiveTicket] = useState<any>(null);
  // Estado de red de la ONU del ticket activo (SmartOLT vía onu_signals). null = no aplica/no hay fila.
  const networkSignal = useOnuSignal(companyId, activeTicket?.onu_external_id);
  const operadores = useOperadores(companyId);
  const porOperador = useMemo(() => mapaOperadores(operadores), [operadores]);
  const {
    habilitado: evolutionHabilitado, usable: evolutionUsable, estadoSesion: evolutionEstadoSesion,
    refrescarEstado: refrescarCanal,
  } = useCanalSalida(companyId, selectedConv?.id);
  /**
   * Config de canales de la empresa, sólo lo que la UI necesita: nunca la
   * `ycloud_api_key` (se consulta su existencia con un conteo, sin traer el valor).
   */
  const [cfgCanales, setCfgCanales] = useState<{
    evolution_enabled: boolean;
    evolution_instance: string | null;
    ycloud_phone: string | null;
    default_provider: string | null;
    costo_mensaje_oficial: number | null;
    tiene_ycloud_key: boolean;
  } | null>(null);
  /**
   * Canal que eligió el operador, por conversación. Vive en memoria a propósito:
   * dura lo que la sesión, no se fija en la base ni pisa la config de la empresa.
   */
  const [canalPorConversacion, setCanalPorConversacion] = useState<Record<string, Proveedor>>({});
  /** Reenvío pendiente por el canal oficial, cuando la sesión sin costo se cayó. */
  const [reenvioOficial, setReenvioOficial] = useState<CuerpoEnvio | null>(null);
  /* Editar y borrar mensajes ya enviados: sólo aplican al canal sin costo. */
  const [mensajeEditando, setMensajeEditando] = useState<Message | null>(null);
  const [textoEdicion, setTextoEdicion] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [mensajeABorrar, setMensajeABorrar] = useState<Message | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [networkPanelOpen, setNetworkPanelOpen] = useState(false);
  // Un ticket solo deja de estar vigente al llegar a un estado final (Resuelto/Cerrado, o cualquier
  // etiqueta marcada is_final). Mientras NO lo esté, conserva todas sus funcionalidades (señal ONU,
  // reinicio, finalizar) sin importar el estado intermedio (En Proceso, Agendado, Espera de Agenda…).
  const ticketIsFinal = !!activeTicket && getFinalStatuses(ticketLabels).has(activeTicket.status);
  const activeNetworkSignal = ticketIsFinal ? null : networkSignal;
  /*
   * Color del punto en el botón de la ONU: adelanta el estado del equipo sin que el
   * operador tenga que abrir nada. Se usa el estado del equipo y no la calidad de la
   * señal porque es lo que decide si hay que mandar un técnico.
   */
  const onuPuntoEstado = (() => {
    switch ((networkSignal?.onu_status ?? "").trim().toLowerCase()) {
      case "online": return "bg-emerald-500";
      case "power fail": return "bg-amber-500";
      case "los": return "bg-destructive";
      case "offline": return "bg-muted-foreground";
      default: return "bg-muted-foreground/40";
    }
  })();
  const [rebootConfirmOpen, setRebootConfirmOpen] = useState(false);
  const [rebootingOnu, setRebootingOnu] = useState(false);
  const [nocodbEnabled, setNocodbEnabled] = useState(false);
  const [outboundEnabled, setOutboundEnabled] = useState(true);
  const [bandejaTemplateId, setBandejaTemplateId] = useState<string | null>(null);
  const [outboundTemplateId, setOutboundTemplateId] = useState<string | null>(null);

  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  /*
   * El veredicto que hay que responder antes de finalizar.
   *
   * Los tickets con la etiqueta Revisión IA no se pueden cerrar sin decir si el
   * agente se equivocó: cerrándolos sin preguntar, la sesión quedaba marcada como
   * revisada pero sin veredicto y sin nota, así que seguía contando como error
   * para siempre y encima sin registro de quién la había mirado.
   */
  const [veredictoPendiente, setVeredictoPendiente] = useState<
    { analysisId: string; nota: number | null; cierreStatus?: string } | null>(null);
  const [guardandoVeredicto, setGuardandoVeredicto] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [closeSummaryData, setCloseSummaryData] = useState<any>(null);
  const [closeSummaryText, setCloseSummaryText] = useState("");
  const closeSummaryRef = useRef<HTMLTextAreaElement>(null);
  const [closeSummaryKey, setCloseSummaryKey] = useState(0);
  const [pendingCloseStatus, setPendingCloseStatus] = useState<string | null>(null);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportType, setReportType] = useState("informacion_incorrecta");

  // ── Presencia en tiempo real (estilo Google Docs) ─────────────────────────────
  interface Viewer { user_id: string; user_name: string; initials: string; color: string; }
  const [activeViewers, setActiveViewers] = useState<Viewer[]>([]);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Actualizar Info Cliente ──
  const [infoClientModalOpen, setInfoClientModalOpen] = useState(false);
  const [infoClientRut, setInfoClientRut] = useState("");
  const [infoClientRutError, setInfoClientRutError] = useState("");
  const [infoClientLoading, setInfoClientLoading] = useState(false);

  /** Formatea el input de RUT en tiempo real: solo dígitos y K, añade guion antes del DV */
  function formatRutInput(raw: string): string {
    const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length === 0) return '';
    const dv   = clean.slice(-1);
    const body = clean.slice(0, -1);
    return body.length === 0 ? dv : `${body}-${dv}`;
  }

  /** Valida el RUT chileno con módulo 11. Acepta 7-9 dígitos en el cuerpo (incluye empresas). */
  function isRutValid(rut: string): boolean {
    const clean = rut.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length < 8 || clean.length > 10) return false;
    const dv   = clean.slice(-1);
    const body = clean.slice(0, -1);
    if (!/^\d+$/.test(body)) return false;
    let sum = 0, factor = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i]) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    const rem = 11 - (sum % 11);
    const expected = rem === 11 ? '0' : rem === 10 ? 'K' : String(rem);
    return dv === expected;
  }
  const [reportWrong, setReportWrong] = useState("");
  const [reportExpected, setReportExpected] = useState("");

  // Panel lateral — secciones colapsables
  const [clientInfoOpen, setClientInfoOpen] = useState(true);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [ticketStatusOpen, setTicketStatusOpen] = useState(false);
  const [derivedCaseOpen, setDerivedCaseOpen] = useState(false);
  const [ticketSearchOpen, setTicketSearchOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'caso' | 'acciones' | 'agenda'>('caso');

  /*
   * Los técnicos salen de la agenda, no de la bandeja.
   *
   * Ahí se dan de alta con nombre y número, así que esa es la única lista que
   * hay que mantener: el filtro, el nombre que se muestra en vez del teléfono y
   * el panel lateral salen todos de lo mismo.
   */
  const { buscarTecnico, tecnicos } = useTecnicos(companyId);
  const etiquetaTecnicos = useMemo(() => ticketLabels.find(esEtiquetaTecnicos), [ticketLabels]);
  const tecnicoDelChat = selectedConv ? buscarTecnico(selectedConv.wa_id) : null;
  const claveEtiquetaTecnicos = etiquetaTecnicos?.key ?? null;
  const colorTecnicos = etiquetaTecnicos?.color ?? '#ec4899';

  // Notas de conversación (compartidas en BD, por conversation_id)
  const [convNotes, setConvNotes] = useState<Record<string, string>>({});
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Dirección y correo del cliente (desde tabla clientes)
  const [clientAddress, setClientAddress] = useState<string | null>(null);
  const [clientEmail, setClientEmail] = useState<string | null>(null);

  // Próxima cita agendada del cliente activo
  const [clientNextAppt, setClientNextAppt] = useState<any>(null);

  // Motivo del caso derivado — expandible
  const [motivoExpanded, setMotivoExpanded] = useState(false);

  /*
   * Edicion a mano de la ficha del cliente.
   *
   * Cuando la IA deriva no siempre recopila bien la direccion o el RUT, y el
   * operador no tenia forma de arreglarlo desde aca: habia que volver a
   * preguntarle al cliente para que el dato llegara correcto al tecnico. El
   * borrador va aparte del ticket para que Cancelar no deje nada a medias.
   */
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [borradorCliente, setBorradorCliente] = useState<Record<string, string>>({});
  const [guardandoCliente, setGuardandoCliente] = useState(false);

  /*
   * El último mensaje completo, por conversación.
   *
   * `conversations.last_message_preview` viene cortado a 100 caracteres desde que
   * se graba, así que para la vista previa no sirve: mostraría el mismo recorte
   * que ya se lee en la fila. Se busca el mensaje real recién al abrir el globo
   * —una fila, con índice por conversación— y queda guardado para no repetirlo.
   */
  const [ultimosMensajes, setUltimosMensajes] = useState<Record<string, { texto: string; quien: string }>>({});

  // Tooltip flotante para notas en lista de chats
  const [tooltipConvId, setTooltipConvId] = useState<string | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Estado: selector de plantilla para ventana de 24h ───────────────────────
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [showVarForm, setShowVarForm] = useState(false);
  const [templateVars, setTemplateVars] = useState<TemplateVar[]>([]);
  const [templateVarValues, setTemplateVarValues] = useState<Record<string, string>>({});
  const [sendingTemplate, setSendingTemplate] = useState(false);

  // ── Estado: nueva conversación outbound ─────────────────────────────────────
  const [newConvOpen,        setNewConvOpen]        = useState(false);
  const [newConvCountryCode, setNewConvCountryCode] = useState('+56');
  const [newConvPhone,       setNewConvPhone]       = useState('');
  const [newConvTemplates,   setNewConvTemplates]   = useState<WhatsAppTemplate[]>([]);
  const [newConvLoadingTpls, setNewConvLoadingTpls] = useState(false);
  const [newConvTpl,         setNewConvTpl]         = useState<WhatsAppTemplate | null>(null);
  const [newConvVars,        setNewConvVars]        = useState<TemplateVar[]>([]);
  const [newConvVarValues,   setNewConvVarValues]   = useState<Record<string, string>>({});
  const [newConvSending,     setNewConvSending]     = useState(false);
  const [newConvSearch,      setNewConvSearch]      = useState('');

  const NEW_CONV_COUNTRY_CODES = [
    { code: '+56',  flag: '🇨🇱', name: 'Chile'           },
    { code: '+54',  flag: '🇦🇷', name: 'Argentina'       },
    { code: '+55',  flag: '🇧🇷', name: 'Brasil'          },
    { code: '+51',  flag: '🇵🇪', name: 'Perú'            },
    { code: '+57',  flag: '🇨🇴', name: 'Colombia'        },
    { code: '+591', flag: '🇧🇴', name: 'Bolivia'         },
    { code: '+598', flag: '🇺🇾', name: 'Uruguay'         },
    { code: '+595', flag: '🇵🇾', name: 'Paraguay'        },
    { code: '+593', flag: '🇪🇨', name: 'Ecuador'         },
    { code: '+58',  flag: '🇻🇪', name: 'Venezuela'       },
    { code: '+52',  flag: '🇲🇽', name: 'México'          },
    { code: '+1',   flag: '🇺🇸', name: 'EE.UU. / Canadá' },
    { code: '+34',  flag: '🇪🇸', name: 'España'          },
  ];

  const handleSubmitReport = async () => {
    if (!reportWrong.trim() || !reportExpected.trim()) {
      toast({ title: "Completa todos los campos", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("agent_feedback").insert({
      conversation_id: selectedConv?.id,
      company_id: selectedConv?.company_id,
      reported_by: userId,
      reported_by_name: userName,
      wrong_response: reportWrong,
      expected_response: reportExpected,
      error_type: reportType,
    });

    if (error) {
      toast({ title: "Error al enviar reporte", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "✅ Reporte enviado", description: "El administrador revisará el caso." });
    setReportModalOpen(false);
    setReportWrong("");
    setReportExpected("");
    setReportType("informacion_incorrecta");
  };

  // ── Webhook: actualizar info del cliente ──
  const handleInfoClient = async () => {
    const rutTrimmed = infoClientRut.trim();
    if (!rutTrimmed) {
      setInfoClientRutError("El RUT es obligatorio.");
      return;
    }
    if (!isRutValid(rutTrimmed)) {
      setInfoClientRutError("RUT inválido. Verifica los dígitos.");
      return;
    }
    setInfoClientRutError("");
    setInfoClientLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("refresh-ticket-client", {
        body: {
          company_id: companyId ?? null,
          rut: rutTrimmed,
          ticket_id: activeTicket?.id ?? null,
        },
      });

      if (error) {
        // Leer el cuerpo de la respuesta de error (404 no encontrado, 400, 403…)
        let msg = "";
        let status: number | undefined;
        try {
          const ctx = (error as any).context;
          status = ctx?.status;
          const body = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
          msg = body?.error || "";
        } catch { /* noop */ }
        const title =
          status === 404 ? "Cliente no encontrado" :
          status === 403 ? "Sin permiso" :
          "No se pudo actualizar";
        toast({ title, description: msg || "Verifica el RUT o inténtalo de nuevo.", variant: "destructive" });
        return;
      }

      if (data?.success) {
        const u = data.updated ?? {};
        toast({
          title: "✅ Datos actualizados",
          description: u.nombre ? `Información de ${u.nombre} actualizada.` : "La información del cliente se actualizó.",
        });
        // El ticket se refresca solo por Realtime; forzamos un refresco por si tarda.
        setTicketRefreshCounter(c => c + 1);
        setInfoClientModalOpen(false);
        setInfoClientRut("");
        setInfoClientRutError("");
      } else {
        toast({ title: "Cliente no encontrado", description: data?.error || "Verifica el RUT ingresado.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error de conexión", description: e?.message || "No se pudo conectar al servidor.", variant: "destructive" });
    } finally {
      setInfoClientLoading(false);
    }
  };
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const selectedConvRef = useRef<string | null>(null);
  const selectedWaIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const retryMapRef = useRef<Record<string, boolean>>({});

  // ── Notificaciones in-app ────────────────────────────────────────────────────
  const [inAppNotif, setInAppNotif] = useState<{
    convId: string;
    clientName: string;
    preview: string;
    label: string;
    labelColor: string;
  } | null>(null);
  const notifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevConvsRef = useRef<Conversation[]>([]);
  const initialLoadDoneRef = useRef(false);

  // Helper: insertar atajo reemplazando solo la parte "/query", conservando texto anterior y posterior
  const insertShortcut = useCallback((message: string) => {
    const ta = msgTextareaRef.current;
    if (!ta) return;
    const slashPos = slashStartRef.current;
    const cursorPos = ta.selectionStart ?? ta.value.length;
    const before = slashPos >= 0 ? ta.value.slice(0, slashPos) : "";
    const after = ta.value.slice(cursorPos);
    ta.value = before + message + after;
    setHasContent(ta.value.trim().length > 0);
    slashStartRef.current = -1;
  }, []);

  // Helper: resize textarea to fit content (called after programmatic message changes)
  const resizeTextarea = useCallback(() => {
    const el = msgTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, []);


  // Cerrar panel móvil al cambiar o cerrar conversación
  useEffect(() => {
    setShowMobilePanel(false);
  }, [selectedConv?.id]);

  /*
   * Borradores por conversacion.
   *
   * El compositor es un textarea NO controlado (`defaultValue=""` + ref). Eso daba
   * los dos sintomas opuestos que se reportaron, y los dos son el mismo origen:
   *
   *   - Cambiar de chat no limpiaba el campo, asi que un texto escrito para un
   *     cliente quedaba cargado sobre la conversacion de otro. Un enter distraido
   *     y sale a la persona equivocada.
   *   - Salir de la Bandeja desmonta el componente y el texto se perdia entero.
   *
   * Se guarda en sessionStorage y no en un ref, justamente para sobrevivir a ese
   * desmontaje. Es por pestana y no viaja a otro dispositivo, que es lo que uno
   * espera de un borrador a medio escribir.
   */
  const convAnteriorRef = useRef<string | null>(null);
  const claveBorrador = (id: string) => `borrador:${id}`;

  useEffect(() => {
    const ta = msgTextareaRef.current;
    const anterior = convAnteriorRef.current;
    const actual = selectedConv?.id ?? null;
    if (anterior === actual) return;

    // Guardar lo que quedo escrito en la conversacion que se deja.
    if (anterior && ta) {
      try {
        const texto = ta.value;
        if (texto.trim()) sessionStorage.setItem(claveBorrador(anterior), texto);
        else sessionStorage.removeItem(claveBorrador(anterior));
      } catch { /* modo privado o storage lleno: el borrador es una comodidad, no se insiste */ }
    }

    // Cargar el de la que se entra. Sin borrador, el campo arranca vacio: nunca
    // hereda el texto del chat anterior, que es la mitad peligrosa del bug.
    if (ta) {
      let texto = "";
      if (actual) {
        try { texto = sessionStorage.getItem(claveBorrador(actual)) || ""; } catch { texto = ""; }
      }
      ta.value = texto;
      ta.style.height = "48px";
      if (texto) {
        ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
      }
      setHasContent(texto.trim().length > 0);
    }

    convAnteriorRef.current = actual;
  }, [selectedConv?.id]);

  /*
   * Al desmontar —salir de la Bandeja— se guarda lo que haya. Sin esto el borrador
   * se pierde justo en el caso que mas molesta: ir a mirar un ticket y volver.
   */
  useEffect(() => {
    return () => {
      const ta = msgTextareaRef.current;
      const id = convAnteriorRef.current;
      if (!ta || !id) return;
      try {
        if (ta.value.trim()) sessionStorage.setItem(claveBorrador(id), ta.value);
        else sessionStorage.removeItem(claveBorrador(id));
      } catch { /* ver arriba */ }
    };
  }, []);

  // Debounced keyword search — relevancia progresiva:
  // cuantas más palabras escriba el usuario, más específicos son los resultados.
  useEffect(() => {
    const q = searchTerm.trim();

    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    // Mínimo 3 caracteres para activar la búsqueda
    if (q.length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    // Cada búsqueda tiene un número de generación; si llega un resultado de una
    // generación anterior (fetch viejo que tardó más) lo descartamos.
    const generation = ++searchGenerationRef.current;
    setSearching(true);

    // Debounce: 400ms — da tiempo a que el usuario termine de escribir
    const timer = setTimeout(async () => {
      const normalize = (rows: any[]) =>
        rows.map(r => ({ ...r, id: r.id ?? r.conversation_id }));

      // ── Estrategia de búsqueda progresiva ──────────────────────────────────
      // 1. Frase completa exacta (el RPC usa ILIKE — no tiene stopwords)
      const { data: phraseData, error: phraseError } = await (supabase as any).rpc(
        'search_conversations_by_keyword',
        { p_company_id: companyId, p_keyword: q }
      );

      if (generation !== searchGenerationRef.current) return;

      if (!phraseError && phraseData && (phraseData as any[]).length > 0) {
        setSearchResults(normalize(phraseData as any[]));
        setSearching(false);
        return;
      }

      // 2. Frase sin palabras muy cortas (≤2 chars): "si tiene conectado" → "tiene conectado"
      //    Útil como fallback mientras el backend no usa ILIKE puro.
      const significantWords = q.split(/\s+/).filter(t => t.length >= 3);
      if (significantWords.length === 0) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      const filteredPhrase = significantWords.join(' ');
      if (filteredPhrase.toLowerCase() !== q.toLowerCase()) {
        const { data: filteredData, error: filteredError } = await (supabase as any).rpc(
          'search_conversations_by_keyword',
          { p_company_id: companyId, p_keyword: filteredPhrase }
        );
        if (generation !== searchGenerationRef.current) return;
        if (!filteredError && filteredData && (filteredData as any[]).length > 0) {
          setSearchResults(normalize(filteredData as any[]));
          setSearching(false);
          return;
        }
      }

      // 3. Último recurso: intersección (AND) de palabras significativas (≥4 chars).
      //    "si tiene conectado" → busca "tiene" ∩ "conectado" → solo chats con ambas palabras.
      const longWords = q.split(/\s+/).filter(t => t.length >= 4);
      if (longWords.length === 0) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      const wordResults = await Promise.all(
        longWords.map(word =>
          (supabase as any).rpc('search_conversations_by_keyword', {
            p_company_id: companyId,
            p_keyword: word
          })
        )
      );

      if (generation !== searchGenerationRef.current) return;

      let intersection: any[] | null = null;
      for (const { data, error } of wordResults) {
        if (error || !data) continue;
        const normalized = normalize(data as any[]);
        if (intersection === null) {
          intersection = normalized;
        } else {
          const ids = new Set(normalized.map((r: any) => r.id));
          intersection = intersection.filter((r: any) => ids.has(r.id));
        }
      }

      setSearchResults(intersection ?? []);
      setSearching(false);
    }, 400);

    return () => { clearTimeout(timer); };
  }, [searchTerm, companyId]);

  // ── Sonido de notificación (Web Audio API, sin archivo externo) ─────────────
  const playNotifSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const master = ctx.createGain();
      master.connect(ctx.destination);

      const playNote = (freq: number, startAt: number, duration: number, vol: number) => {
        const osc  = ctx.createOscillator();
        const osc2 = ctx.createOscillator(); // armónico para dar cuerpo
        const g    = ctx.createGain();
        osc.type  = 'sine';
        osc2.type = 'sine';
        osc.frequency.setValueAtTime(freq, startAt);
        osc2.frequency.setValueAtTime(freq * 2, startAt);
        g.gain.setValueAtTime(0, startAt);
        g.gain.linearRampToValueAtTime(vol, startAt + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
        osc.connect(g); osc2.connect(g); g.connect(master);
        osc.start(startAt);  osc.stop(startAt + duration);
        osc2.start(startAt); osc2.stop(startAt + duration);
      };

      // Dos notas tipo notificación social: la segunda un poco más baja
      playNote(1046, ctx.currentTime,        0.22, 0.22); // C6
      playNote(880,  ctx.currentTime + 0.21, 0.22, 0.18); // A5
    } catch (_) {}
  }, []);

  // ── Detectar mensajes nuevos no leídos en conversaciones con etiqueta ───────
  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      if (conversations.length > 0) {
        prevConvsRef.current = conversations;
        initialLoadDoneRef.current = true;
      }
      return;
    }
    for (const conv of conversations) {
      const prev = prevConvsRef.current.find(c => c.id === conv.id);
      if (!prev) continue;
      if (
        conv.unread_count > (prev.unread_count || 0) &&
        conv.id !== selectedConvRef.current &&
        ticketStatusByConvId[conv.id]
      ) {
        const labelKey = ticketStatusByConvId[conv.id];
        const labelObj = ticketLabels.find(l => l.key === labelKey);
        const clientName = conv.profile_name || conv.wa_id;
        const preview = (conv.last_message_preview || '').slice(0, 50);
        playNotifSound();
        if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
        setInAppNotif({
          convId: conv.id,
          clientName,
          preview,
          label: labelObj?.name || labelKey,
          labelColor: labelObj?.color || '#888',
        });
        notifTimeoutRef.current = setTimeout(() => setInAppNotif(null), 5000);
        break; // Una notificación a la vez
      }
    }
    prevConvsRef.current = conversations;
  }, [conversations]);

  // Debounce realtime reloads: evita renders en cascada cuando llegan múltiples eventos seguidos
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedLoadConversations = useCallback(() => {
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => loadConversations(), 350);
  }, []);

  // Recarga solo los contadores del sidebar (1 RPC, sin recargar conversaciones)
  const filterCountsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const companyIdRef = useRef<string | null>(null);
  const debouncedLoadFilterCounts = useCallback(() => {
    if (filterCountsDebounceRef.current) clearTimeout(filterCountsDebounceRef.current);
    filterCountsDebounceRef.current = setTimeout(async () => {
      const cid = companyIdRef.current;
      if (!cid) return;
      const { data } = await (supabase as any).rpc('get_inbox_filter_counts', { p_company_id: cid });
      if (data && data.length > 0) setFilterCounts(data);
    }, 1200);
  }, []);

  // ── Monitor de reconexión WebSocket ──────────────────────────────────────────
  // Cuando el WebSocket cae (firewall, timeout nginx, etc.) los canales quedan
  // en estado "zombie": registrados pero sin recibir eventos. Este monitor
  // detecta la desconexión y forza reconexión + recarga de datos.
  useEffect(() => {
    if (!companyId) return;

    const checkAndReconnect = () => {
      const rt = supabase.realtime as any;
      // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
      const state = rt?.conn?.readyState;
      if (state === undefined || state === 3 /* CLOSED */) {
        supabase.realtime.connect();
        // Pequeño delay para que los canales se re-suscriban antes de recargar
        setTimeout(() => debouncedLoadConversations(), 1500);
      }
    };

    // Verificar cada 12 segundos
    const interval = setInterval(checkAndReconnect, 12_000);

    // También reconectar cuando el usuario vuelve a la pestaña
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkAndReconnect();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [companyId]);

  useEffect(() => {
    companyIdRef.current = companyId ?? null;
  }, [companyId]);

  useEffect(() => {
    loadConversations();
    const filter = companyId ? `company_id=eq.${companyId}` : undefined;
    const channel = supabase
      .channel(`conversations-realtime-${companyId || 'all'}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "conversations",
        ...(filter ? { filter } : {})
      }, (payload) => {
        const ev = payload.eventType;
        if (ev === "INSERT") {
          const raw = payload.new as any;
          const enriched = { ...raw, status: raw.is_agent_active ? "abierto" : "en_progreso" };
          setConversations(prev =>
            prev.find(c => c.id === enriched.id) ? prev : [enriched as any, ...prev]
          );
        } else if (ev === "UPDATE") {
          const raw = payload.new as any;
          if (raw.status === "cerrado") {
            setConversations(prev => prev.filter(c => c.id !== raw.id));
          } else {
            const enriched = { ...raw, status: raw.is_agent_active ? "abierto" : "en_progreso" };
            setConversations(prev => {
              const found = prev.find(c => c.id === enriched.id);
              if (!found) {
                // Conversación no está en la lista (ej: recién cerrada y bot reactivado)
                // fallback a recarga completa
                debouncedLoadConversations();
                return prev;
              }
              return prev.map(c => c.id === enriched.id ? { ...c, ...enriched } : c);
            });
            if (selectedConvRef.current === enriched.id) {
              setSelectedConv((prev: any) => prev ? { ...prev, ...enriched } : prev);
            }
          }
        } else if (ev === "DELETE") {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) setConversations(prev => prev.filter(c => c.id !== deletedId));
        }
        // Contadores del sidebar: refrescar en background con debounce
        debouncedLoadFilterCounts();
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "tickets",
      }, (payload) => {
        const ticket = payload.new as any;
        // Actualización quirúrgica del mapa convId→ticketStatus
        if (ticket?.conversation_id && ticket?.status) {
          setTicketStatusByConvId(prev => ({ ...prev, [ticket.conversation_id]: ticket.status }));
        }
        // Refrescar activeTicket si es la conversación activa
        const convId = ticket?.conversation_id;
        const ticketPhone = (ticket?.customer_phone ?? "").replace(/^\+/, "");
        const currentWaId = (selectedWaIdRef.current ?? "").replace(/^\+/, "");
        const matchesConv = convId && convId === selectedConvRef.current;
        const matchesPhone = ticketPhone && currentWaId && ticketPhone === currentWaId;
        if (matchesConv || matchesPhone) {
          setTicketRefreshCounter(c => c + 1);
        }
        // Contadores del sidebar
        debouncedLoadFilterCounts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, chatFilter, userRole, operatorRoles, userId]);

  // Handle chatFilter using RPC
  useEffect(() => {
    if (!chatFilter.startsWith('ticket:') || !companyId) { 
      setFilteredConvIds(null); 
      return; 
    }
    const status = chatFilter.replace('ticket:', '');
    (supabase as any).rpc('get_conversations_by_ticket_status', {
      p_company_id: companyId, p_status: status
    }).then(({ data }: any) => {
      setFilteredConvIds(new Set((data || []).map((r: any) => r.conversation_id).filter(Boolean)));
    });
  }, [chatFilter, companyId]);

  // Handle initialConversationId
  useEffect(() => {
    if (initialConversationId && conversations.length > 0) {
      const target = conversations.find(c => c.id === initialConversationId);
      if (target) {
        handleConvSelect(target);
        setChatFilter('all');
        onConversationOpened?.();
      }
    }
  }, [initialConversationId, conversations]);

  /**
   * Abre una conversación por id (viene de una notificación de la campana).
   *
   * Si no está en la lista cargada —un caso que te transfirieron mientras la
   * bandeja estaba filtrada, por ejemplo— se busca la fila puntual en vez de
   * dejar el aviso sin ir a ninguna parte.
   */
  // Notificar al padre el chat seleccionado, para reflejarlo en la URL (?conv=)
  // y que el botón atrás del navegador restaure el chat. Se salta el primer render
  // para no limpiar el ?conv= con el que se entra.
  const convSelectSyncedRef = useRef(false);
  useEffect(() => {
    if (!convSelectSyncedRef.current) { convSelectSyncedRef.current = true; return; }
    onConversationSelect?.(selectedConv?.id ?? null);
  }, [selectedConv?.id]);

  // Handle initialPhone — navegar al chat del técnico por número
  useEffect(() => {
    if (!initialPhone || conversations.length === 0) return;
    const cleanPhone = initialPhone.replace(/^\+/, '');
    const target = conversations.find(c => {
      const convPhone = c.wa_id.replace(/^\+/, '');
      return convPhone === cleanPhone;
    });
    if (target) {
      // Conversación existente → abrirla y pre-llenar el mensaje
      handleConvSelect(target);
      setChatFilter('all');
      if (initialMessage) {
        setTimeout(() => {
          const ta = msgTextareaRef.current;
          if (ta) {
            ta.value = initialMessage;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            setHasContent(true);
            ta.focus();
          }
        }, 300);
      }
    } else {
      // Conversación no existe → abrir modal de nueva conversación con el teléfono pre-llenado
      openNewConvModal(initialPhone);
    }
    onConversationOpened?.();
  }, [initialPhone, conversations.length]);

  useEffect(() => {
    if (!selectedConv) return;
    const convId = selectedConv.id;

    // Reset unread_count
    const resetUnread = async () => {
      await supabase.from('conversations')
        .update({ unread_count: 0 })
        .eq('id', convId);
    };
    resetUnread();

    // FIX RACE CONDITION: suscribirse PRIMERO y luego cargar mensajes.
    // Antes se cargaban los mensajes y luego se suscribía → si llegaba un mensaje
    // en ese intervalo, se perdía y nunca aparecía en pantalla aunque estuviera en la DB.
    let latestLoadedAt: string | null = null;

    const channel = supabase
      .channel(`messages-${convId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${convId}`,
      }, async (payload) => {
        // Fetch completo para traer quoted_content, context_message_id y demás campos nuevos
        const { data: fullMsg } = await supabase
          .from("messages").select("*").eq("id", payload.new.id).single();
        const msg = (fullMsg || payload.new) as Message;

        setMessages((prev) => {
          if (prev.find(m => m.id === msg.id)) return prev;
          const withoutOptimistic = prev.filter(m => {
            if (!m.id.startsWith('opt-')) return true;
            const sameContent = m.content === msg.content;
            const sameDirection = m.direction === msg.direction;
            const closeInTime = Math.abs(
              new Date(m.created_at).getTime() - new Date(msg.created_at).getTime()
            ) < 15_000;
            return !(sameContent && sameDirection && closeInTime);
          });
          return [...withoutOptimistic, msg];
        });

        setConversations(prev => prev.map(c =>
          c.id === msg.conversation_id
            ? { ...c, last_message_preview: msg.content, last_message_at: msg.created_at }
            : c
        ));
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "messages",
        filter: `conversation_id=eq.${convId}`,
      }, (payload) => {
        // Actualiza status (read/delivered) en tiempo real sin recargar
        setMessages((prev) => prev.map(m =>
          m.id === payload.new.id ? { ...m, status: payload.new.status } : m
        ));
      })
      .subscribe((status) => {
        // Una vez confirmada la suscripción, cargar mensajes.
        // Así no hay ventana de tiempo donde un mensaje pueda escaparse.
        if (status === "SUBSCRIBED") {
          loadMessages(convId).then((msgs: any) => {
            if (msgs) latestLoadedAt = msgs[msgs.length - 1]?.created_at || null;
          });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [selectedConv?.id]);

  useEffect(() => {
    if (!selectedConv || loading) return;
    const convId = selectedConv.id;
    if (retryMapRef.current[convId]) return;

    const timer = setTimeout(() => {
      setMessages((currentMessages) => {
        if (currentMessages.length === 0) {
          retryMapRef.current[convId] = true;
          loadMessages(convId);
        }
        return currentMessages;
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [selectedConv?.id, loading]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const wrapper = messagesContainerRef.current;
      if (!wrapper) return;
      const viewport = wrapper.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [messages, selectedConv?.id]);

  useEffect(() => {
    selectedConvRef.current = selectedConv ? selectedConv.id : null;
    selectedWaIdRef.current = selectedConv ? selectedConv.wa_id : null;
    if (selectedConv) {
      (async () => {
        const fetchFallbacks = async () => {
          const finalStatuses = getFinalStatuses(ticketLabels);

          // 1. Fallback primario: buscar por conversation_id
          const { data: byConv } = await supabase
            .from("tickets")
            .select("id, customer_rut, customer_name, customer_email, customer_address, customer_type, customer_plan, customer_tv_count, description, category, assigned_to, status, onu_external_id, ia_review")
            .eq("conversation_id", selectedConv.id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(10);
            
          const activeByConv = byConv?.find(t => !finalStatuses.has(t.status)) || null;
          if (activeByConv) {
            setActiveTicket(activeByConv);
            return;
          }

          // 2. Fallback secundario: buscar por teléfono
          const cleanPhone = selectedConv.wa_id.replace(/^\+/, '');
          const { data: byPhone } = await supabase
            .from("tickets")
            .select("id, customer_rut, customer_name, customer_email, customer_address, customer_type, customer_plan, customer_tv_count, description, category, assigned_to, status, onu_external_id, ia_review")
            .or(`customer_phone.eq.${cleanPhone},customer_phone.eq.+${cleanPhone}`)
            .is("conversation_id", null)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(10);
            
          const activeByPhone = byPhone?.find(t => !finalStatuses.has(t.status)) || null;
          setActiveTicket(activeByPhone);
        };

        try {
          const { data, error } = await supabase.functions.invoke('check-ticket', {
            body: {
              conversation_id: selectedConv.id,
              company_id: companyId,
              wa_id: selectedConv.wa_id,
            }
          });

          if (!error && data?.tiene_ticket) {
            const { data: ticketDetails } = await supabase
              .from("tickets")
              .select("id, customer_rut, customer_name, customer_email, customer_address, customer_type, customer_plan, customer_tv_count, description, category, assigned_to, status, onu_external_id, ia_review")
              .eq("id", data.ticket_id)
              .single();

            if (ticketDetails) {
              setActiveTicket(ticketDetails);
              return;
            }
          }
        } catch (e) {
          console.warn("[check-ticket] Failed, using fallback", e);
        }

        // Siempre caer en los fallbacks manuales si la función falló o retornó false
        await fetchFallbacks();
      })();
    } else {
      setActiveTicket(null);
    }
  }, [selectedConv?.id, ticketRefreshCounter]);

  // Cerrar el panel de señal de red al cambiar de conversación (useOnuSignal ya recarga los datos).
  useEffect(() => { setNetworkPanelOpen(false); }, [selectedConv?.id]);

  // ── Resetear secciones colapsables al cambiar de conversación ────────────────
  useEffect(() => {
    setClientInfoOpen(true);
    setTicketStatusOpen(false);
    setDerivedCaseOpen(false);
    setQuickActionsOpen(false);
    setTicketSearchOpen(false);
    setMotivoExpanded(false);
    setEditandoCliente(false);
    setRightPanelTab('caso');
  }, [selectedConv?.id]);

  // ── Cargar config de empresa (nocodb_enabled, outbound_enabled, bandeja_template_id) ──
  useEffect(() => {
    if (!companyId) return;
    (supabase as any).from('company_config')
      .select('nocodb_enabled, outbound_enabled, bandeja_template_id, outbound_template_id')
      .eq('id', companyId)
      .maybeSingle()
      .then(({ data }: any) => {
        setNocodbEnabled(!!data?.nocodb_enabled);
        setOutboundEnabled(data?.outbound_enabled ?? true);
        setBandejaTemplateId(data?.bandeja_template_id || null);
        setOutboundTemplateId(data?.outbound_template_id || null);
      });
  }, [companyId]);

  /*
   * ── Qué canales tiene configurados la empresa dueña de la conversación ────
   *
   * Se leen columnas sueltas y ninguna sensible. La `ycloud_api_key` se consulta
   * con un conteo (`head`), que devuelve sólo el número de filas: así la UI sabe
   * si hay key sin que el valor viaje al navegador.
   *
   * Si RLS no deja leer la fila, queda `null` y la UI cae al estado que ya conoce
   * por `evolution_estado` (contratado / sesión arriba), sin inventar nada.
   */
  useEffect(() => {
    const cid = selectedConv?.company_id || companyId;
    if (!cid) { setCfgCanales(null); return; }
    let cancelado = false;
    (async () => {
      const [{ data }, { count }] = await Promise.all([
        (supabase as any).from('company_config')
          .select('evolution_enabled, evolution_instance, ycloud_phone, default_provider, costo_mensaje_oficial')
          .eq('id', cid)
          .maybeSingle(),
        (supabase as any).from('company_config')
          .select('id', { count: 'exact', head: true })
          .eq('id', cid)
          .not('ycloud_api_key', 'is', null)
          .neq('ycloud_api_key', ''),
      ]);
      if (cancelado) return;
      setCfgCanales(data ? {
        evolution_enabled: !!data.evolution_enabled,
        evolution_instance: data.evolution_instance || null,
        ycloud_phone: data.ycloud_phone || null,
        default_provider: data.default_provider || null,
        costo_mensaje_oficial: data.costo_mensaje_oficial == null ? null : Number(data.costo_mensaje_oficial),
        tiene_ycloud_key: (count ?? 0) > 0,
      } : null);
    })();
    return () => { cancelado = true; };
  }, [selectedConv?.company_id, companyId]);

  // ── Auto-seleccionar plantilla de bandeja cuando está configurada ──────────
  useEffect(() => {
    if (!bandejaTemplateId || !outboundEnabled) return;
    // Si ya hay una plantilla seleccionada del mismo nombre, no sobreescribir
    if (selectedTemplate?.name === bandejaTemplateId) return;
    // Buscar en templates ya cargados
    const found = templates.find(t => t.name === bandejaTemplateId);
    if (found) {
      setSelectedTemplate(found);
    } else {
      // Marcar que necesitamos cargar — se hará lazy cuando el usuario clicke el botón
      setSelectedTemplate(null);
    }
  }, [bandejaTemplateId, templates, outboundEnabled]);

  // ── Cargar todas las notas de la empresa + Realtime para toda la lista ───────
  useEffect(() => {
    if (!companyId) return;

    // Carga inicial
    supabase.from('conversation_notes')
      .select('conversation_id, content')
      .eq('company_id', companyId)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach(n => { if (n.content?.trim()) map[n.conversation_id] = n.content; });
        setConvNotes(map);
      });

    // Realtime: cualquier cambio de nota en la empresa actualiza el mapa de tooltips
    const channel = supabase.channel(`company-notes-${companyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversation_notes',
        filter: `company_id=eq.${companyId}`,
      }, (payload) => {
        const convId = (payload.new as any)?.conversation_id || (payload.old as any)?.conversation_id;
        const content = (payload.new as any)?.content || '';
        if (!convId) return;
        setConvNotes(prev => {
          if (!content.trim()) {
            const next = { ...prev };
            delete next[convId];
            return next;
          }
          return { ...prev, [convId]: content };
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  // ── Cargar nota de la conversación activa + Realtime ─────────────────────
  useEffect(() => {
    if (!selectedConv) { setNoteInput(''); return; }
    const convId = selectedConv.id;

    // Cargar nota actual
    supabase.from('conversation_notes')
      .select('content')
      .eq('conversation_id', convId)
      .maybeSingle()
      .then(({ data }) => setNoteInput(data?.content || ''));

    // Suscripción Realtime: si otro agente guarda/edita la nota, la vemos al instante
    const channel = supabase.channel(`conv-note-${convId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversation_notes',
        filter: `conversation_id=eq.${convId}`,
      }, (payload) => {
        const content = (payload.new as any)?.content || '';
        setNoteInput(content);
        setConvNotes(prev => ({ ...prev, [convId]: content }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConv?.id]);

  // ── Reset inmediato al cambiar de conversación (evita mostrar datos del chat anterior) ──
  useEffect(() => {
    setActiveTicket(null);
    setClientAddress(null);
    setClientEmail(null);
    setClientNextAppt(null);
  }, [selectedConv?.id]);

  // ── Presencia en tiempo real: quién está viendo este chat ahora ───────────────
  // Se actualiza al seleccionar / deseleccionar una conversación.
  // El canal se destruye al salir — Supabase lo limpia automáticamente.
  useEffect(() => {
    // Limpiar canal anterior si existe
    if (presenceChannelRef.current) {
      presenceChannelRef.current.untrack().catch(() => {});
      supabase.removeChannel(presenceChannelRef.current);
      presenceChannelRef.current = null;
    }
    setActiveViewers([]);

    if (!selectedConv?.id || !userId) return;

    const displayName = userName || "Agente";
    const channel = supabase.channel(`presence:conv:${selectedConv.id}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ user_id: string; user_name: string; initials: string; color: string }>();
        const viewers: Viewer[] = Object.values(state)
          .flat()
          .filter((v) => v.user_id !== userId); // no mostrarse a uno mismo
        setActiveViewers(viewers);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            user_name: displayName,
            initials: getAgentInitials(displayName),
            color: stringToColor(userId),
          });
        }
      });

    presenceChannelRef.current = channel;

    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
      setActiveViewers([]);
    };
  }, [selectedConv?.id, userId]);

  // ── Cargar dirección y correo desde clientes (siempre al cambiar conv) ──────
  useEffect(() => {
    if (!selectedConv || !companyId) return;

    const convId = selectedConv.id;
    const phone = selectedConv.wa_id.replace(/^\+/, '');
    supabase.from('clientes')
      .select('rut, nombre, direccion, email')
      .eq('company_id', companyId)
      .eq('numero', phone)
      .maybeSingle()
      .then(({ data, error }) => {
        // Ignorar si el usuario ya cambió de conversación
        if (error || convId !== selectedConvRef.current) return;
        setClientAddress((data as any)?.direccion || null);
        setClientEmail((data as any)?.email || null);
      });
  }, [selectedConv?.id, companyId]);

  // ── Cargar próxima cita del cliente activo ──────────────────────────────────
  useEffect(() => {
    if (!selectedConv || !companyId) return;
    const convId = selectedConv.id;
    const phone  = selectedConv.wa_id;
    ;(supabase as any)
      .from('appointments')
      .select('id, service_type, start_datetime, status, technician:technician_id(name, color)')
      .eq('company_id', companyId)
      .eq('client_phone', phone)
      .neq('status', 'cancelado')
      .neq('status', 'completado')
      .order('start_datetime')
      .limit(1)
      .maybeSingle()
      .then(({ data }: any) => {
        if (convId !== selectedConvRef.current) return;
        setClientNextAppt(data || null);
      });
  }, [selectedConv?.id, companyId]);

  // ── Cargar plantilla guardada (localStorage) cuando cambia la empresa ───────
  useEffect(() => {
    if (!companyId) return;
    try {
      const saved = localStorage.getItem(`defaultTemplate_${companyId}`);
      if (saved) setSelectedTemplate(JSON.parse(saved));
      else setSelectedTemplate(null);
    } catch { setSelectedTemplate(null); }
  }, [companyId]);

  // ── Funciones de plantillas ──────────────────────────────────────────────────
  const fetchTemplates = async () => {
    if (!selectedConv || loadingTemplates) return;
    setLoadingTemplates(true);
    try {
      const { data, error } = await supabase.functions.invoke("ycloud-get-templates", {
        body: { conversationId: selectedConv.id },
      });
      if (error) throw error;
      setTemplates(data?.templates || []);
    } catch (err: any) {
      toast({ title: "Error cargando plantillas", description: err.message, variant: "destructive" });
    } finally {
      setLoadingTemplates(false);
    }
  };

  const extractTemplateVars = (tpl: WhatsAppTemplate): TemplateVar[] => {
    const vars: TemplateVar[] = [];
    for (const comp of (tpl.components || [])) {
      const type = (comp.type || "").toLowerCase();
      if (!["header", "body"].includes(type)) continue;
      const text = comp.text || "";
      if (!text) continue;
      // Detecta {{1}}, {{motivo}}, {{nombre_cliente}}, etc.
      const matches = [...text.matchAll(/\{\{(\w+)\}\}/g)];
      let positionInComp = 0;
      for (const m of matches) {
        const varName = m[1]; // "1", "motivo", "nombre", etc.
        positionInComp++;
        const key = `${type}_${varName}`;
        if (!vars.find(v => v.componentType === type && v.varName === varName)) {
          vars.push({
            componentType: type,
            varIndex: positionInComp,
            varName,
            contextText: text,
          });
        }
      }
    }
    return vars.sort((a, b) => a.componentType.localeCompare(b.componentType) || a.varIndex - b.varIndex);
  };

  const handleSelectTemplate = (tpl: WhatsAppTemplate) => {
    setSelectedTemplate(tpl);
    // Guardar usando conversationId de la conv activa como fallback si companyId no está
    const storageKey = `defaultTemplate_${companyId || selectedConv?.company_id}`;
    localStorage.setItem(storageKey, JSON.stringify(tpl));
    setShowTemplateSelector(false);
    setTemplateSearch("");
  };

  // ── Activar plantilla IA configurada por el admin (bandeja 24h) ─────────────
  const handleActivarIA = async () => {
    // Si ya está la plantilla correcta cargada, disparar directamente
    if (selectedTemplate && selectedTemplate.name === bandejaTemplateId) {
      handleClickSendTemplate();
      return;
    }
    setLoadingTemplates(true);
    try {
      let allTpls: WhatsAppTemplate[] = [];

      if (isSimulating) {
        // admin_isp simulando empresa: usa service key (no es miembro de la empresa simulada)
        const { data: keyData } = await supabase.functions.invoke("get-service-key");
        const serviceKey = keyData?.service_key || "";
        const baseUrl = import.meta.env.VITE_SUPABASE_URL || "https://supabase.artoria.cl";
        const resp = await fetch(`${baseUrl}/functions/v1/ycloud-get-templates-company`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ company_id: companyId }),
        });
        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          throw new Error(errBody?.error || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        allTpls = data?.templates || [];
      } else {
        // Usuario de la empresa (administrador u operador): el backend valida pertenencia con el JWT
        const { data, error } = await supabase.functions.invoke("ycloud-get-templates-company", {
          body: { company_id: companyId },
        });
        if (error) throw error;
        allTpls = data?.templates || [];
      }

      setTemplates(allTpls);
      const found = allTpls.find(t => t.name === bandejaTemplateId);
      if (!found) {
        toast({ title: "Plantilla no encontrada", description: `La plantilla "${bandejaTemplateId}" no existe. Contacta al administrador.`, variant: "destructive" });
        return;
      }
      setSelectedTemplate(found);
      const vars = extractTemplateVars(found);
      setTemplateVars(vars);
      setTemplateVarValues({});
      if (vars.length > 0) {
        setShowVarForm(true);
      } else {
        doSendTemplate({}, vars);
      }
    } catch (err: any) {
      toast({ title: "Error al cargar plantillas", description: err.message, variant: "destructive" });
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleClickSendTemplate = () => {
    if (!selectedTemplate) return;
    const vars = extractTemplateVars(selectedTemplate);
    // Siempre sincronizar el estado de vars antes de abrir form o enviar
    setTemplateVars(vars);
    setTemplateVarValues({});
    if (vars.length > 0) {
      setShowVarForm(true);
    } else {
      // Sin variables: enviar directo pasando vars explícitamente (no depender del estado)
      doSendTemplate({}, vars);
    }
  };

  // vars es opcional: si se pasa, se usa en vez del estado (evita el problema de estado stale)
  const doSendTemplate = async (varValues: Record<string, string>, varsOverride?: TemplateVar[]) => {
    if (!selectedTemplate || !selectedConv) return;
    setSendingTemplate(true);
    try {
      const activeVars = varsOverride ?? templateVars;

      // Agrupar variables por componentType en orden de varIndex
      // Se evitan arrays dispersos agrupando primero y luego ordenando
      const byType: Record<string, { varIndex: number; value: string }[]> = {};
      for (const v of activeVars) {
        const value = varValues[`${v.componentType}_${v.varName}`] ?? "";
        if (!byType[v.componentType]) byType[v.componentType] = [];
        byType[v.componentType].push({ varIndex: v.varIndex, value });
      }

      const components = Object.entries(byType).map(([type, items]) => {
        const sorted = [...items].sort((a, b) => a.varIndex - b.varIndex);
        return {
          type,
          parameters: sorted.map(({ value }) => ({ type: "text", text: value })),
        };
      });

      // Construir el texto renderizado sustituyendo las variables en el BODY
      // para que el portal muestre el contenido real en vez de "📋 Plantilla: inicio"
      const bodyComp = selectedTemplate.components.find(c => c.type.toUpperCase() === "BODY");
      let renderedContent = bodyComp?.text || `📋 Plantilla: ${selectedTemplate.name}`;
      for (const v of activeVars) {
        const value = varValues[`${v.componentType}_${v.varName}`] ?? "";
        renderedContent = renderedContent.replace(
          new RegExp(`\\{\\{${v.varName}\\}\\}`, "g"),
          value
        );
      }

      // Las plantillas van SIEMPRE por el canal oficial, esté donde esté el toggle:
      // Baileys no las soporta y `evolution-send` las rechaza con un 500.
      const { error } = await supabase.functions.invoke("ycloud-send", {
        body: {
          to: selectedConv.wa_id,
          conversationId: selectedConv.id,
          templateName: selectedTemplate.name,
          templateLanguage: selectedTemplate.language || "es",
          templateComponents: components,
          templateContent: renderedContent,
          senderName: effectiveSenderName,
        },
      });
      if (error) throw error;
      setShowVarForm(false);
      toast({ title: "✅ Plantilla enviada", description: `"${selectedTemplate.name}" entregada al cliente.` });
    } catch (err: any) {
      console.error("[TEMPLATE SEND] Error:", err);
      toast({ title: "Error al enviar plantilla", description: err.message, variant: "destructive" });
    } finally {
      setSendingTemplate(false);
    }
  };

  // Vista previa del cuerpo de la plantilla (primeros 120 chars del BODY)
  const getTemplatePreview = (tpl: WhatsAppTemplate) => {
    const body = tpl.components.find(c => c.type.toUpperCase() === "BODY");
    return body?.text?.substring(0, 120) || "";
  };

  // Prefijos de países soportados (orden: más largos primero para match correcto)
  const KNOWN_PREFIXES = ['+56','+54','+51','+57','+52','+55','+34','+1'];

  const openNewConvModal = async (prefilledPhone?: string) => {
    // Parsear teléfono pre-llenado: separar prefijo de país del número
    let parsedCode = '+56';
    let parsedNumber = '';
    if (prefilledPhone) {
      const normalized = prefilledPhone.startsWith('+') ? prefilledPhone : `+${prefilledPhone}`;
      const prefix = KNOWN_PREFIXES.find(p => normalized.startsWith(p));
      if (prefix) {
        parsedCode = prefix;
        parsedNumber = normalized.slice(prefix.length);
      } else {
        parsedNumber = normalized.replace(/^\+/, '');
      }
    }

    setNewConvPhone(parsedNumber);
    setNewConvCountryCode(parsedCode);
    setNewConvTpl(null);
    setNewConvVars([]);
    setNewConvVarValues({});
    setNewConvSearch('');
    setNewConvOpen(true);

    let loadedTemplates = newConvTemplates;
    if (loadedTemplates.length === 0) {
      setNewConvLoadingTpls(true);
      try {
        const anyConvId = conversations.find(c => c.company_id === companyId)?.id
          || selectedConv?.id;
        const { data, error } = await supabase.functions.invoke("ycloud-get-templates", {
          body: { conversationId: anyConvId, companyId },
        });
        if (!error) {
          loadedTemplates = data?.templates || [];
          setNewConvTemplates(loadedTemplates);
        }
      } finally {
        setNewConvLoadingTpls(false);
      }
    }

    // Si el admin configuró una plantilla outbound, pre-seleccionarla
    if (outboundTemplateId && loadedTemplates.length > 0) {
      const found = loadedTemplates.find((t: WhatsAppTemplate) => t.name === outboundTemplateId);
      if (found) selectNewConvTemplate(found);
    }
  };

  const selectNewConvTemplate = (tpl: WhatsAppTemplate) => {
    setNewConvTpl(tpl);
    setNewConvVars(extractTemplateVars(tpl));
    setNewConvVarValues({});
  };

  const doSendNewConv = async () => {
    if (!newConvTpl || !newConvPhone.trim()) return;
    setNewConvSending(true);
    try {
      const activeVars = newConvVars;
      const byType: Record<string, { varIndex: number; value: string }[]> = {};
      for (const v of activeVars) {
        const key   = `${v.componentType}_${v.varName}`;
        const value = newConvVarValues[key] ?? "";
        if (!byType[v.componentType]) byType[v.componentType] = [];
        byType[v.componentType].push({ varIndex: v.varIndex, value });
      }
      const components: any[] = [];
      for (const [ctype, vals] of Object.entries(byType)) {
        vals.sort((a, b) => a.varIndex - b.varIndex);
        components.push({
          type:       ctype.toUpperCase(),
          parameters: vals.map(v => ({ type: "text", text: v.value })),
        });
      }
      const bodyComp = newConvTpl.components.find(c => c.type.toUpperCase() === "BODY");
      let rendered = bodyComp?.text || `📋 Plantilla: ${newConvTpl.name}`;
      for (const v of activeVars) {
        const key   = `${v.componentType}_${v.varName}`;
        const value = newConvVarValues[key] ?? "";
        rendered = rendered.replace(new RegExp(`\\{\\{${v.varName}\\}\\}`, "g"), value);
      }
      const { data, error } = await supabase.functions.invoke("ycloud-send-outbound", {
        body: {
          company_id:         companyId,
          to:                 `${newConvCountryCode}${newConvPhone.trim().replace(/\s/g, '')}`,
          templateName:       newConvTpl.name,
          templateLanguage:   newConvTpl.language || "es",
          templateComponents: components,
          templateContent:    rendered,
        },
      });
      if (error) throw error;
      toast({ title: "✅ Conversación iniciada", description: `Plantilla enviada a ${newConvCountryCode}${newConvPhone.trim()}` });
      setNewConvOpen(false);
      // Recargar bandeja para mostrar la conversación nueva/reutilizada
      setTimeout(() => loadConversations(), 800);
    } catch (err: any) {
      toast({ title: "Error al enviar", description: err.message, variant: "destructive" });
    } finally {
      setNewConvSending(false);
    }
  };

  const loadConversations = async () => {
    let query: any = supabase.from("conversations").select("*");
    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    // Siempre excluir cerrados
    query = query.neq("status", "cerrado");
    if (userRole === "operador" && userId) {
      let orConditions = [`taken_by.eq.${userId}`];
      if (operatorRoles && operatorRoles.length > 0) {
        orConditions.push(`and(assigned_role.in.(${operatorRoles.join(',')}),taken_by.is.null)`);
      }
      query = query.or(orConditions.join(','));
    }

    // Lanzar conversaciones y RPC de etiquetas en paralelo para que ticketLabels
    // esté disponible antes de construir el mapa de tickets.
    const [{ data }, rpcResult] = await Promise.all([
      query,
      companyId
        ? (supabase as any).rpc('get_inbox_filter_counts', { p_company_id: companyId })
        : Promise.resolve({ data: null }),
    ]);

    // Actualizar etiquetas primero (necesarias para finalStatuses)
    let freshFinalStatuses = new Set<string>(['cerrado']);
    if (rpcResult?.data && rpcResult.data.length > 0) {
      setFilterCounts(rpcResult.data);
      const freshLabels = rpcResult.data.map((r: any) => ({
        key: r.key,
        name: r.label,
        color: r.color,
        is_initial: r.is_initial,
        is_final: r.is_final,
      }));
      // Los clientes de técnicos dejan el ticket en 'en_espera' al cerrar un
      // retiro, esperando que un operador confirme la recepción del equipo. Si
      // la empresa no tiene esa etiqueta configurada la agregamos igual: los
      // contadores del chip se calculan acá (ver badgeCounts), no en la RPC,
      // así que el filtro funciona aunque falte la fila en ticket_labels.
      if (!freshLabels.some((l: any) => l.key === 'en_espera')) {
        freshLabels.push({ key: 'en_espera', name: 'Retiro por confirmar', color: '#8b5cf6' });
      }
      setTicketLabels(freshLabels);
      freshLabels.filter((l: any) => l.is_final).forEach((l: any) => freshFinalStatuses.add(l.key));
    }

    if (data) {
      const enriched = data.map((c: any) => ({
        ...c,
        status: c.is_agent_active ? 'abierto' : 'en_progreso'
      }));
      setConversations(enriched as unknown as Conversation[]);
      if (selectedConvRef.current) {
        const updated = enriched.find((c: any) => c.id === selectedConvRef.current);
        if (updated) setSelectedConv(updated as unknown as Conversation);
      }

      // Construir mapa convId → ticketStatus usando finalStatuses ya actualizados
      if (companyId) {
        const { data: ticketData } = await supabase
          .from("tickets")
          .select("conversation_id, status, customer_phone")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .neq("status", "cerrado")
          .order("created_at", { ascending: false });

        const map: Record<string, string> = {};
        if (ticketData) {
          for (const t of ticketData) {
            if (freshFinalStatuses.has(t.status)) continue;

            if (t.conversation_id && !map[t.conversation_id]) {
              map[t.conversation_id] = t.status;
            } else if (!t.conversation_id) {
              const phone = t.customer_phone?.replace(/^\+/, '') || '';
              const matchedConv = enriched.find((c: any) => c.wa_id.replace(/^\+/, '') === phone);
              if (matchedConv && !map[matchedConv.id]) {
                map[matchedConv.id] = t.status;
              }
            }
          }
        }
        setTicketStatusByConvId(map);
      }
    }
    setLoading(false);
  };

  const loadMessages = async (convId: string) => {
    const { data, error } = await supabase.from("messages").select("*").eq("conversation_id", convId).order("created_at", { ascending: true });

    if (data) {
      setMessages(data as unknown as Message[]);
    }
    return data;
  };

  const sendMessage = async () => {
    const text = msgTextareaRef.current?.value.trim() ?? "";
    if (!text || !selectedConv || sending) return;
    if (!puedeEnviar) {
      toast({ title: "Envío Bloqueado", description: "Han pasado más de 24 horas desde el último mensaje del cliente.", variant: "destructive" });
      return;
    }
    await tomarCasoAlResponder();
    setSending(true);
    // ── Update optimista ANTES del invoke ─────────────────────────────────────
    // Si se agrega DESPUÉS, el evento Realtime INSERT puede llegar primero
    // (mientras await espera) y agregar el mensaje real, causando el duplicado visual.
    const optimisticId = `opt-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      conversation_id: selectedConv.id,
      wa_message_id: null,
      direction: 'outbound',
      content: text,
      message_type: 'text',
      status: 'sent',
      sender_name: effectiveSenderName,
      sender_type: 'human',
      media_url: null,
      media_type: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);

    // Limpiar textarea sin re-render
    if (msgTextareaRef.current) {
      msgTextareaRef.current.value = "";
      msgTextareaRef.current.style.height = "48px";
    }
    setHasContent(false);
    // El mensaje se fue: el borrador de ESTA conversacion ya no existe. Los de las
    // demas quedan intactos.
    if (selectedConv?.id) {
      try { sessionStorage.removeItem(`borrador:${selectedConv.id}`); } catch { /* ignorar */ }
    }

    try {
      const convSnap = selectedConv;

      if (convSnap.is_agent_active) {
        // Optimistic UI inmediato
        const interventionConv = {
          ...convSnap,
          is_agent_active: false,
          status: 'en_progreso' as any,
          assigned_user_id: userId || convSnap.assigned_user_id,
        };
        setSelectedConv(interventionConv);
        setConversations(prev => prev.map(c => c.id === convSnap.id ? interventionConv : c));
        toast({ title: "¡Interviniendo!", description: "Tomando control de la conversación." });

        // Todo en background — no bloquea el envío del mensaje
        supabase.from("conversations").update({
          is_agent_active: false,
          assigned_user_id: userId,
        }).eq("id", convSnap.id).then(() => {
          supabase.functions.invoke("ycloud-toggle-bot", {
            body: { conversationId: convSnap.id, action: "deactivate_bot" },
          }).catch((e: any) => console.warn("[ycloud-toggle-bot]", e));
        });

        if (!activeTicket) {
          supabase.functions.invoke("create-ticket", {
            body: {
              company_id: convSnap.company_id || companyId,
              conversation_id: convSnap.id,
              wa_id: convSnap.wa_id,
              customer_name: convSnap.profile_name || null,
              rut: null,
              reason: "Intervenido por especialista",
              category: "soporte_tecnico",
              skip_nocodb: !nocodbEnabled,
            },
          }).then(({ data: newTicket }: any) => {
            if (newTicket?.ticket) setActiveTicket(newTicket.ticket);
          }).catch((e: any) => console.warn("[create-ticket]", e));
        }
      }

      // Enviar mensaje también en background — input se libera al instante
      setSending(false);
      const cuerpo: CuerpoEnvio = {
        to: convSnap.wa_id,
        message: text,
        conversationId: convSnap.id,
        senderName: effectiveSenderName,
      };
      const canalUsado = canalDeLaConversacion;
      const { r, fallback } = await enviarConFallback(cuerpo, canalUsado);

      if (!r.ok) {
        // Se haya caído la sesión o no, lo que escribió el operador no se pierde.
        revertirEnvio(optimisticId, text);
        toast({
          title: r.red
            ? "Envío sin confirmar"
            : fallback ? "Tampoco salió por la API oficial" : "Error al enviar",
          description: mensajeDeEnvio(r, fallback ? 'ycloud' : canalUsado),
          variant: "destructive",
        });
        return;
      }
      if (fallback) {
        toast({
          title: "Salió por la API oficial",
          description: "La API no oficial está caída. El mensaje salió por la API oficial (con costo).",
        });
      }
      return; // el finally no debe volver a setSending(false)
    } catch (err: any) {
      // Revertir el mensaje optimista si el envío falló
      revertirEnvio(optimisticId, text);
      toast({ title: "Error al enviar", description: err?.message || "Intenta de nuevo", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleToggleBot = async (activate: boolean) => {
    if (!selectedConv) return;
    try {
      const action = activate ? 'activate_bot' : 'deactivate_bot';

      // Optimistic UI: actualizar estado local inmediatamente antes de cualquier await
      const newStatus = activate ? 'abierto' : 'en_progreso';
      const updatedConv = {
        ...selectedConv,
        is_agent_active: activate,
        status: newStatus as any,
        assigned_user_id: activate ? null : (userId || selectedConv.assigned_user_id)
      };
      setSelectedConv(updatedConv);
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? updatedConv : c));

      // Actualizar BD en paralelo con el resto del flujo
      await supabase.from("conversations").update({
        is_agent_active: activate,
        assigned_user_id: activate ? null : userId
      }).eq("id", selectedConv.id);

      // Sincronizar con YCloud (apaga/enciende el bot en el contacto)
      const { error: toggleErr } = await supabase.functions.invoke("ycloud-toggle-bot", {
        body: { conversationId: selectedConv.id, action },
      });
      if (toggleErr) console.warn("[ycloud-toggle-bot] Error:", toggleErr);

      // Al intervenir: si no hay ticket activo, crear uno automáticamente
      if (!activate && !activeTicket) {
        try {
          const { data: newTicket, error: ticketErr } = await supabase.functions.invoke("create-ticket", {
            body: {
              company_id: selectedConv.company_id || companyId,
              conversation_id: selectedConv.id,
              wa_id: selectedConv.wa_id,
              customer_name: selectedConv.profile_name || null,
              rut: null,
              reason: "Intervenido por especialista",
              category: "soporte_tecnico",
              skip_nocodb: !nocodbEnabled,
            },
          });
          if (ticketErr) console.warn("[intervenir] No se pudo crear ticket:", ticketErr);
          else if (newTicket?.ticket) setActiveTicket(newTicket.ticket);
        } catch (e) {
          console.warn("[intervenir] Error al crear ticket automático:", e);
        }
      }

      toast({ title: activate ? "¡IA Activada!" : "¡Interviniendo!", description: "El estado se ha actualizado con éxito." });
    } catch (err: any) {
      toast({ title: "Error al cambiar estado", description: err.message || "Revisa la consola web para más detalles", variant: "destructive" });
    }
  };

  /** Carga la ficha actual en el borrador y entra en modo edicion. */
  const abrirEdicionCliente = () => {
    const t = activeTicket as any;
    setBorradorCliente({
      customer_name:     t?.customer_name ?? '',
      customer_rut:      t?.customer_rut ?? '',
      // La direccion puede venir del ticket o de la ficha del cliente; se
      // guarda igual en el ticket, que es lo que lee el tecnico.
      customer_address:  t?.customer_address ?? clientAddress ?? '',
      customer_plan:     t?.customer_plan ?? '',
      customer_email:    t?.customer_email ?? '',
      customer_tv_count: t?.customer_tv_count != null ? String(t.customer_tv_count) : '',
      category:          t?.category ?? '',
      description:       t?.description ?? '',
    });
    setEditandoCliente(true);
  };

  /**
   * Guarda la ficha corregida a mano sobre el ticket abierto.
   *
   * Un campo que se deja vacio queda en null y no en cadena vacia: asi la ficha
   * muestra el guion de "falta el dato" en vez de un hueco que se lee como que
   * algo no cargo.
   */
  const guardarDatosCliente = async () => {
    if (!activeTicket || !companyId) return;
    setGuardandoCliente(true);
    const limpio = (v?: string) => {
      const texto = (v ?? '').trim();
      return texto === '' ? null : texto;
    };
    const tvCrudo = (borradorCliente.customer_tv_count ?? '').trim();
    const tv = tvCrudo === '' ? null : Number(tvCrudo);
    if (tv != null && !Number.isFinite(tv)) {
      setGuardandoCliente(false);
      toast({ title: 'N de TV invalido', description: 'Tiene que ser un numero.', variant: 'destructive' });
      return;
    }
    const campos: Record<string, any> = {
      customer_name:     limpio(borradorCliente.customer_name),
      customer_rut:      limpio(borradorCliente.customer_rut),
      customer_address:  limpio(borradorCliente.customer_address),
      customer_plan:     limpio(borradorCliente.customer_plan),
      customer_email:    limpio(borradorCliente.customer_email),
      customer_tv_count: tv,
      category:          limpio(borradorCliente.category),
      description:       limpio(borradorCliente.description),
    };
    // El filtro por empresa ademas del id: una id adivinada de otra empresa no
    // alcanza para escribir en su ticket.
    const { error } = await supabase
      .from('tickets')
      .update(campos as any)
      .eq('id', activeTicket.id)
      .eq('company_id', companyId);
    setGuardandoCliente(false);
    if (error) {
      toast({ title: 'No se pudieron guardar los datos', description: error.message, variant: 'destructive' });
      return;
    }
    setActiveTicket((prev: any) => prev ? { ...prev, ...campos } : prev);
    // La direccion corregida manda sobre la que venia de la ficha del cliente.
    if (campos.customer_address) setClientAddress(campos.customer_address);
    setEditandoCliente(false);
    toast({ title: 'Datos actualizados', description: 'El tecnico vera la ficha corregida.' });
  };

  const saveNote = async () => {
    if (!selectedConv || !companyId) return;
    setSavingNote(true);
    try {
      const content = noteInput.trim();
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('conversation_notes').upsert({
        conversation_id: selectedConv.id,
        company_id: companyId,
        content,
        author_name: user?.user_metadata?.full_name || user?.email || 'Agente',
        author_id: user?.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id' });
      // Actualizar mapa local de tooltips
      setConvNotes(prev => {
        const updated = { ...prev };
        if (content) updated[selectedConv.id] = content;
        else delete updated[selectedConv.id];
        return updated;
      });
      toast({ title: content ? '✅ Nota guardada' : 'Nota eliminada' });
    } catch (err: any) {
      toast({ title: 'Error al guardar nota', description: err.message, variant: 'destructive' });
    } finally {
      setSavingNote(false);
    }
  };

  const handleToggleHighPriority = async (checked: boolean) => {
    if (!selectedConv) return;
    const newPriority = checked ? 'alta' : null;
    const { error } = await supabase.from('conversations')
      .update({ priority: newPriority } as any)
      .eq('id', selectedConv.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    if (activeTicket) {
      await supabase.from('tickets').update({ priority: checked ? 'alta' : 'baja' }).eq('id', activeTicket.id);
    }
    const updPriority = newPriority as 'alta' | 'media' | 'baja' | null;
    setSelectedConv(prev => prev ? { ...prev, priority: updPriority } : null);
    setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, priority: updPriority } : c));
    toast({ title: checked ? '🔴 Alta prioridad activada' : 'Prioridad restablecida' });
  };

  const handleUpdatePriority = async (newPriority: string) => {
    if (!selectedConv) return;
    const { error } = await supabase
      .from("conversations")
      .update({ priority: newPriority === 'ninguna' ? null : newPriority } as any)
      .eq("id", selectedConv.id);
    
    if (!error) {
      toast({ title: "Prioridad actualizada" });
      const updatedPriority = newPriority === 'ninguna' ? null : newPriority as 'alta' | 'media' | 'baja';
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, priority: updatedPriority } : c));
      setSelectedConv(prev => prev ? { ...prev, priority: updatedPriority } : null);
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  /** Refleja en la lista y en el chat abierto el dueño que devolvió la RPC. */
  const aplicarPropiedad = (convId: string, dueno: string | null, tomadoEn: string | null) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, taken_by: dueno, taken_at: tomadoEn } : c));
    setSelectedConv(prev => prev && prev.id === convId ? { ...prev, taken_by: dueno, taken_at: tomadoEn } : prev);
  };

  /**
   * Toma el caso vía RPC. `forzar` se lo quita al dueño actual, que recibe aviso.
   * Devuelve el resultado para que quien llame decida qué hacer con la colisión.
   */
  const tomarCaso = async (convId: string, forzar = false): Promise<CasoResultado> => {
    setCasoOcupado(true);
    const r = await casoTomar(convId, forzar);
    setCasoOcupado(false);
    if (r.ok) {
      aplicarPropiedad(convId, r.tomado_por ?? userId ?? null, r.tomado_en ?? new Date().toISOString());
    }
    return r;
  };

  /**
   * Toma el caso al responder, sin que nadie apriete nada.
   *
   * El origen real de la confusión es el operador que contesta sin tomar el caso:
   * deducirlo del acto de responder saca la disciplina de la ecuación. Nunca
   * bloquea el envío — si falla, el mensaje sale igual.
   *
   * Se salta durante la simulación: ahí `auth.uid()` sigue siendo el del
   * administrador, así que el caso quedaría a su nombre sin que nadie lo note.
   * Los botones manuales sí funcionan simulando, con su aviso a la vista.
   */
  const tomarCasoAlResponder = async () => {
    if (!selectedConv || selectedConv.taken_by || isSimulating) return;
    const convId = selectedConv.id;
    const r = await casoTomar(convId);
    if (r.ok) {
      aplicarPropiedad(convId, r.tomado_por ?? userId ?? null, r.tomado_en ?? new Date().toISOString());
      toast({ title: "Tomaste este caso", description: "Se asignó a tu nombre al responder." });
    }
  };

  /**
   * Reenvía por el canal oficial lo que no salió porque la sesión sin costo estaba
   * caída. No se manda solo: cuesta plata y esa decisión es del operador.
   */
  const confirmarReenvioOficial = async () => {
    const cuerpo = reenvioOficial;
    if (!cuerpo) return;
    setReenvioOficial(null);
    const r = await enviarPorCanal("ycloud", cuerpo);
    if (!r.ok) {
      toast({ title: "Tampoco salió por el oficial", description: r.mensaje, variant: "destructive" });
      return;
    }
    // El texto seguía en el campo por si cancelaba; ya se fue, se limpia.
    if (cuerpo.message && msgTextareaRef.current?.value === cuerpo.message) {
      msgTextareaRef.current.value = "";
      msgTextareaRef.current.style.height = "48px";
      setHasContent(false);
    }
    toast({ title: "Enviado por el canal oficial" });
  };

  /* ── Editar / borrar un mensaje ya enviado ──────────────────────────────────
   *
   * Sólo el canal sin costo permite tocar un mensaje entregado (la API oficial no
   * expone editar ni borrar). El servidor es el que manda: valida empresa, sesión
   * y la ventana real —15 minutos para editar, 48 h para borrar—, así que acá sólo
   * se decide qué se puede ofrecer y cómo se lee la respuesta.
   */

  /** Texto plano sin adjunto: lo único que WhatsApp deja editar. */
  const esTextoEditable = (m: Message) =>
    !m.media_url && ['conversation', 'extendedTextMessage', 'text'].includes(m.message_type);

  /**
   * Las burbujas optimistas (`opt-…`) todavía no tienen fila en la base, así que el
   * servidor no puede resolverlas por id: hasta que llega el INSERT por Realtime no
   * hay nada que editar ni borrar.
   */
  const tieneAccionesDeMensaje = (m: Message) =>
    m.direction === 'outbound'
    && m.provider === 'evolution'
    && m.status !== 'deleted'
    && !m.id.startsWith('opt-');

  const abrirEdicion = (m: Message) => {
    setTextoEdicion(m.content ?? "");
    setMensajeEditando(m);
  };

  const guardarEdicion = async () => {
    const msg = mensajeEditando;
    if (!msg || guardandoEdicion) return;
    const nuevo = textoEdicion.trim();
    if (!nuevo) {
      toast({ title: "El mensaje no puede quedar vacío", variant: "destructive" });
      return;
    }
    if (nuevo === (msg.content ?? "").trim()) {
      setMensajeEditando(null);
      return;
    }

    setGuardandoEdicion(true);
    const r = await editarMensajeEvolution(msg.id, nuevo);
    setGuardandoEdicion(false);

    if (r.ok) {
      const texto = r.content ?? nuevo;
      const esUltimo = messages[messages.length - 1]?.id === msg.id;
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: texto } : m));
      if (esUltimo) {
        setConversations(prev => prev.map(c =>
          c.id === msg.conversation_id ? { ...c, last_message_preview: texto } : c));
      }
      setMensajeEditando(null);
      toast({ title: "Mensaje editado", description: "El cliente ve el texto corregido en WhatsApp." });
      return;
    }

    if (r.fueraDeVentana) {
      setMensajeEditando(null);
      toast({
        title: "Ya no se puede editar",
        description: r.mensaje || "Pasaron más de 15 minutos desde el envío: WhatsApp no permite editar el mensaje.",
        variant: "destructive",
      });
      return;
    }

    if (r.sesionCaida) {
      // Mismo criterio que el envío: no es un error del mensaje, lo que se quería
      // decir puede salir por el canal oficial. Se deja el texto en el campo para
      // que el operador lo reenvíe desde ahí si acepta el costo.
      refrescarCanal();
      const conv = selectedConv;
      if (conv?.wa_id) {
        if (msgTextareaRef.current) {
          msgTextareaRef.current.value = nuevo;
          msgTextareaRef.current.style.height = "auto";
        }
        setHasContent(true);
        setReenvioOficial({
          to: conv.wa_id,
          message: nuevo,
          conversationId: msg.conversation_id,
          senderName: effectiveSenderName,
        });
      }
      setMensajeEditando(null);
      toast({
        title: "La sesión de WhatsApp no está conectada",
        description: "El mensaje quedó como estaba. Reconectá el canal sin costo o envía el texto corregido por el oficial.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "No se pudo editar el mensaje",
      description: r.mensaje || "Intenta de nuevo.",
      variant: "destructive",
    });
  };

  const confirmarBorrado = async () => {
    const msg = mensajeABorrar;
    if (!msg || borrando) return;
    setBorrando(true);
    const r = await borrarMensajeEvolution(msg.id);
    setBorrando(false);
    setMensajeABorrar(null);

    if (r.ok || r.yaBorrado) {
      // La fila no desaparece: queda con status 'deleted' y el contenido se
      // conserva para auditoría. El operador tiene que ver que ahí hubo algo.
      const esUltimo = messages[messages.length - 1]?.id === msg.id;
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'deleted' } : m));
      if (esUltimo) {
        setConversations(prev => prev.map(c =>
          c.id === msg.conversation_id ? { ...c, last_message_preview: '🚫 Mensaje eliminado' } : c));
      }
      toast({
        title: "Mensaje eliminado",
        description: r.yaBorrado ? "Ya estaba eliminado en WhatsApp." : "Se borró para el cliente. En el portal queda registrado.",
      });
      return;
    }

    if (r.sesionCaida) {
      refrescarCanal();
      toast({
        title: "La sesión de WhatsApp no está conectada",
        description: "No se pudo borrar el mensaje. Reconectá el canal sin costo e intenta de nuevo.",
        variant: "destructive",
      });
      return;
    }

    if (r.fueraDeVentana) {
      toast({
        title: "Ya no se puede eliminar",
        description: r.mensaje || "Pasaron más de 48 horas desde el envío: WhatsApp no permite borrar el mensaje.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "No se pudo eliminar el mensaje",
      description: r.mensaje || "Intenta de nuevo.",
      variant: "destructive",
    });
  };

  const handleTakeCase = async () => {
    if (!selectedConv) return;
    const convId = selectedConv.id;
    const r = await tomarCaso(convId);

    if (r.ok) {
      toast({
        title: r.ya_era_mio ? "Ya era tuyo" : "Caso tomado",
        description: r.ya_era_mio ? "Este caso ya estaba a tu nombre." : "Ahora eres el responsable de esta conversación.",
      });
      return;
    }
    if (r.error === "ya_tomado") {
      // Otro operador ganó la carrera. No se bloquea: se ofrece tomarlo igual.
      setArrebatoPendiente({ convId, nombre: r.dueno_nombre ?? "otro operador" });
      return;
    }
    toast({
      title: r.error === "sin_permiso" ? "No puedes tomar este caso" : "No se pudo tomar el caso",
      description: r.mensaje ?? "Intenta de nuevo en unos segundos.",
      variant: "destructive",
    });
  };

  const confirmarArrebato = async () => {
    const pendiente = arrebatoPendiente;
    if (!pendiente) return;
    setArrebatoPendiente(null);
    const r = await tomarCaso(pendiente.convId, true);
    toast({
      title: r.ok ? "Caso tomado" : "No se pudo tomar el caso",
      description: r.ok
        ? `Se le avisó a ${pendiente.nombre} que ahora lo llevas tú.`
        : (r as any).mensaje ?? "Intenta de nuevo en unos segundos.",
      variant: r.ok ? undefined : "destructive",
    });
  };

  const handleLiberarCaso = async () => {
    if (!selectedConv) return;
    const convId = selectedConv.id;
    setCasoOcupado(true);
    const r = await casoLiberar(convId);
    setCasoOcupado(false);
    if (r.ok) {
      aplicarPropiedad(convId, null, null);
      toast({ title: "Caso liberado", description: "Queda disponible para cualquier operador." });
    } else {
      toast({ title: "No se pudo liberar", description: r.mensaje ?? "Intenta de nuevo.", variant: "destructive" });
    }
  };

  /** Transferencia a una persona concreta (la RPC avisa al destinatario). */
  const handleTransferirAPersona = async () => {
    if (!selectedConv || !transferPersonaId) return;
    const convId = selectedConv.id;
    setCasoOcupado(true);
    const r = await casoTransferir(convId, transferPersonaId, transferPersonaNota);
    setCasoOcupado(false);
    if (r.ok) {
      const destino = porOperador[transferPersonaId]?.nombre ?? "el operador elegido";
      aplicarPropiedad(convId, transferPersonaId, new Date().toISOString());
      setTransferPersonaOpen(false);
      setTransferPersonaId("");
      setTransferPersonaNota("");
      toast({ title: "Caso transferido", description: `Ahora lo lleva ${destino}.` });
    } else {
      toast({
        title: r.error === "destino_invalido" ? "Ese operador no es de esta empresa" : "No se pudo transferir",
        description: r.mensaje ?? "Elige otro destinatario e intenta de nuevo.",
        variant: "destructive",
      });
    }
  };

  /**
   * Transferencia a un DEPARTAMENTO (distinta de la anterior, que es a una persona).
   *
   * El caso se libera con la RPC en vez de poner `taken_by: null` a mano: así queda
   * en `casos_historial` y no se pisa una toma que ocurra en el mismo instante.
   */
  const handleTransferChat = async () => {
    if (!selectedConv) return;
    const convId = selectedConv.id;

    if (selectedConv.taken_by) {
      const liberado = await casoLiberar(convId);
      if (!liberado.ok) {
        toast({
          title: "No se pudo transferir",
          description: liberado.mensaje ?? "El caso sigue asignado a alguien.",
          variant: "destructive",
        });
        return;
      }
    }

    const { error } = await supabase
      .from("conversations")
      .update({ assigned_role: transferRole } as any)
      .eq("id", convId);
    if (!error) {
      toast({ title: "Caso transferido", description: `Enviado al departamento: ${transferRole}` });
      setIsTransferModalOpen(false);
      setConversations(prev => prev.filter(c => c.id !== convId));
      setSelectedConv(null);
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleRebootOnu = async () => {
    if (!activeTicket?.onu_external_id || !companyId) return;
    setRebootingOnu(true);
    try {
      const { data, error } = await supabase.functions.invoke("reboot-onu", {
        body: {
          company_id: companyId,
          onu_external_id: activeTicket.onu_external_id,
          ticket_id: activeTicket.id,
        },
      });
      if (error || data?.error) {
        toast({
          title: "No se pudo reiniciar la ONU",
          description: data?.error || error?.message || "Intenta de nuevo en unos segundos.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "✅ ONU reiniciada", description: data?.message || "El equipo del cliente se está reiniciando." });
    } catch (e: any) {
      toast({ title: "No se pudo reiniciar la ONU", description: e?.message || "Error de conexión.", variant: "destructive" });
    } finally {
      setRebootingOnu(false);
      setRebootConfirmOpen(false);
    }
  };

  /**
   * La sesión analizada de esta conversación que hay que dictaminar.
   *
   * Es la más reciente con nota baja, que es la que la mandó a revisión. Si no
   * hay ninguna, no se bloquea el cierre: no habría nada que dictaminar.
   */
  const buscarSesionARevisar = async (convId: string): Promise<{ id: string; nota: number | null } | null> => {
    const { data } = await (supabase as any)
      .from("conversation_analysis")
      .select("id, session_start, nota_efectiva")
      .eq("conversation_id", convId)
      .lt("nota_efectiva", 6)
      .order("session_start", { ascending: false })
      .limit(1);
    const fila = Array.isArray(data) ? data[0] : null;
    // La nota viaja para que la pregunta pueda decir de cuánto se está hablando.
    return fila?.id ? { id: fila.id, nota: fila.nota_efectiva ?? null } : null;
  };

  /**
   * Guarda el veredicto y, si salió bien, sigue con el cierre.
   *
   * Si falla, el ticket queda abierto a propósito: cerrarlo igual dejaría la
   * sesión sin dictaminar, que es justo lo que esta pantalla vino a evitar.
   */
  const guardarVeredictoYCerrar = async (
    veredicto: "error_real" | "falso_positivo",
    nota: number | null,
    comentario: string,
  ) => {
    if (!veredictoPendiente) return;
    setGuardandoVeredicto(true);
    const { data: sesion } = await supabase.auth.getUser();
    const { error } = await (supabase as any).rpc("revisar_analisis", {
      p_analysis_id: veredictoPendiente.analysisId,
      p_veredicto: veredicto,
      ...(veredicto === "falso_positivo" ? { p_nota: nota } : {}),
      ...(comentario.trim() ? { p_comentario: comentario.trim() } : {}),
      ...(sesion?.user?.id ? { p_revisor: sesion.user.id } : {}),
    });
    setGuardandoVeredicto(false);
    if (error) {
      toast({ title: "No se pudo guardar la revisión", description: error.message, variant: "destructive" });
      return;
    }
    const seguir = veredictoPendiente.cierreStatus;
    setVeredictoPendiente(null);
    toast({
      title: veredicto === "error_real" ? "Marcada como error real" : `Corregida a nota ${nota}`,
      description: "Ahora se finaliza el ticket.",
    });
    // El `null` del estado ya se aplicó, así que esta vuelta no vuelve a preguntar.
    handleCloseChat(seguir);
  };

  const handleCloseChat = async (statusOverride?: string) => {
    if (!selectedConv) return;

    /*
     * El disparador es finalizar, no cambiar de estado: un operador puede mover el
     * ticket varias veces y la pregunta tiene que aparecer una sola vez, al final.
     */
    if (activeTicket?.ia_review && !veredictoPendiente) {
      const sesionARevisar = await buscarSesionARevisar(selectedConv.id);
      if (sesionARevisar) {
        setVeredictoPendiente({
          analysisId: sesionARevisar.id, nota: sesionARevisar.nota, cierreStatus: statusOverride,
        });
        return;
      }
    }

    setPendingCloseStatus(statusOverride || null);

    // Flujo para finalizar ticket + cerrar conversación
    setIsCloseModalOpen(true);
    setIsGeneratingSummary(true);
    setCloseSummaryData({ 
      customer_name: activeTicket?.customer_name || selectedConv.profile_name || 'Cliente sin nombre', 
      rut: activeTicket?.customer_rut || 'Sin RUT', 
      summary: '', 
      ticket_id: activeTicket?.id 
    });
    setCloseSummaryText("");

    try {
      const fetchPromise = supabase.functions.invoke("generate-case-summary", {
        body: { conversation_id: selectedConv.id }
      });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 60000));
      
      const res = await Promise.race([fetchPromise, timeoutPromise]) as any;

      if (res.error) throw res.error;
      const data = res.data;
      
      let parsed = data;
      try {
        if (typeof data === "string") {
          parsed = JSON.parse(data);
        }
      } catch (e) {
        console.error("Error parsing JSON string:", e);
      }
      
      if (parsed && !parsed.error) {
        const summaryText = parsed.summary || parsed.data?.summary || "";
        const cName = parsed.customer_name || parsed.data?.customer_name || activeTicket?.customer_name || selectedConv.profile_name || 'Cliente sin nombre';
        const rutVal = parsed.rut || parsed.data?.rut || activeTicket?.customer_rut || 'Sin RUT';
        const tId = parsed.ticket_id || parsed.data?.ticket_id || activeTicket?.id;

        setCloseSummaryData({
          customer_name: cName,
          rut: rutVal,
          summary: summaryText,
          ticket_id: tId
        });
        setCloseSummaryText(summaryText);
        setCloseSummaryKey(k => k + 1);
      } else {
        throw new Error(parsed?.error || "Error generating summary");
      }
    } catch (err) {
      console.error("Error generating summary:", err);
      toast({ title: "Automático fallido", description: "No se pudo generar el resumen automáticamente — escribe uno manualmente.", variant: "destructive" });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleConfirmClose = async () => {
    if (!selectedConv) return;
    const now = new Date().toISOString();
    setSending(true);

    try {
      const tId = closeSummaryData?.ticket_id || activeTicket?.id;
      const summaryValue = closeSummaryRef.current?.value ?? closeSummaryText;

      if (tId && summaryValue.trim()) {
        const { error: noteError } = await supabase.from("ticket_notes").insert({
          ticket_id: tId,
          content: summaryValue,
          author_id: userId,
          is_internal: false
        });

        if (noteError) {
          console.error("[ERROR ticket_notes]", noteError);
        }
      }

      // Finalizar TICKET via close-ticket edge function (incluye NocoDB sync)
      if (tId) {
        const finalKey = pendingCloseStatus || ticketLabels.find(l => l.is_final)?.key || 'resuelto';
        const { error: closeErr } = await supabase.functions.invoke("close-ticket", {
          body: { ticket_id: tId, status: finalKey },
        });
        if (closeErr) console.error('[handleConfirmClose] close-ticket error:', closeErr);

        // Limpiar nota del equipo al cerrar ticket (próxima derivación empieza en blanco)
        /*
         * La nota se borra, no se vacia.
         *
         * Antes esto hacia un upsert con content: '' y el error nunca se miraba.
         * Si la fila no pasaba —por una columna que no acepta vacio, por RLS— el
         * operador igual veia la caja limpia, porque el estado local se reseteaba
         * dentro del .then() pasara lo que pasara. En la base la nota seguia ahi y
         * reaparecia en el ticket siguiente del mismo cliente. Borrar la fila no
         * depende de que columnas acepten vacio, y ahora el error se avisa.
         */
        supabase.from('conversation_notes')
          .delete()
          .eq('conversation_id', selectedConv.id)
          .eq('company_id', companyId)
          .then(({ error: errNota }: any) => {
            if (errNota) {
              console.error('[cierre] No se pudo limpiar la nota del caso:', errNota);
              toast({
                title: 'La nota del caso quedo sin borrar',
                description: 'Borrala a mano: si no, aparece en la proxima derivacion de este cliente.',
                variant: 'destructive',
              });
              return;
            }
            setNoteInput('');
            setConvNotes(prev => { const n = { ...prev }; delete n[selectedConv.id]; return n; });
          });

        // Sincronizar memoria del agente en background
        (supabase as any).rpc('sync_ticket_memory', {
          p_conversation_id: selectedConv.id,
          p_ticket_id: tId
        }).then(({ data: d, error: rpcError }: any) => {
          if (rpcError) console.error('[SyncMemory] Error:', rpcError);
        }).catch(console.error);
      }

      // Conversación queda ACTIVA con bot ON
      const { error } = await supabase
        .from("conversations")
        .update({ is_agent_active: true } as any)
        .eq("id", selectedConv.id);

      if (error) throw error;

      const finalKeyLabel = pendingCloseStatus || ticketLabels.find(l => l.is_final)?.key;
      const finalLabelName = ticketLabels.find(l => l.key === finalKeyLabel)?.name || 'Finalizado';
      toast({ title: `✅ ${finalLabelName}`, description: "El agente IA ha sido reactivado." });
      setIsCloseModalOpen(false);
      setPendingCloseStatus(null);
      setActiveTicket(null);
      setTicketStatusByConvId(prev => { const n = { ...prev }; delete n[selectedConv.id]; return n; });
      setSelectedConv(null);
      setConversations(prev => prev.filter(c => c.id !== selectedConv.id));
    } catch (err: any) {
      toast({ title: "Error al cerrar", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleConvSelect = async (conv: Conversation) => {
    setSelectedConv(conv);
    if (conv.unread_count > 0) {
      // Clear unread count locally and db
      const updatedList = conversations.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c);
      setConversations(updatedList as unknown as Conversation[]);
      setSelectedConv({ ...conv, unread_count: 0 });
      await supabase.from("conversations").update({ unread_count: 0 } as any).eq("id", conv.id);
    }
  };

  const handleDeleteChat = async () => {
    if (!selectedConv) return;
    if (!confirm("Esto eliminará la conversación y sus mensajes. ¿Continuar?")) return;
    try {
      await supabase.from("messages").delete().eq("conversation_id", selectedConv.id);
      await supabase.from("conversations").delete().eq("id", selectedConv.id);
      setSelectedConv(null);
      setConversations(prev => prev.filter(c => c.id !== selectedConv.id));
      toast({ title: "Chat eliminado", description: "Se borró el historial y la conversación." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Filter conversations — memoizado para no recalcular en cada render no relacionado
  const filtered = useMemo(() => {
    let base = [...conversations];
    if (searchTerm.trim() && searchResults.length > 0) {
      searchResults.forEach(sr => {
        if (!base.find(c => c.id === sr.id)) {
          base.push({
            ...sr,
            status: sr.status || (sr.is_agent_active ? 'abierto' : 'en_progreso')
          } as Conversation);
        }
      });
    }

    const withHits = base.map(c => {
      const hit = searchResults.find(sr => sr.id === c.id);
      return hit ? { ...c, match_content: hit.match_content } : c;
    });

    const q = searchTerm.toLowerCase();
    const words = q ? q.split(/\s+/).filter(t => t.length >= 4) : [];
    const ticketStatus = chatFilter.startsWith('ticket:') ? chatFilter.replace('ticket:', '') : null;
    const soloTecnicos = chatFilter === 'tecnicos';

    return withHits.filter(c => {
      const matchesName = !searchTerm
        || c.profile_name?.toLowerCase().includes(q)
        || c.wa_id.includes(q)
        || words.some(t => c.profile_name?.toLowerCase().includes(t) || c.wa_id.includes(t));
      const matchesContent = !!c.match_content;

      if (!matchesName && !matchesContent) return false;
      if (searchTerm.trim() && matchesContent) return true;
      if (c.status === 'cerrado') return false;
      if (soloTecnicos) {
        /*
         * Por número de la agenda, o por la etiqueta vieja.
         *
         * Lo segundo es para no perder de vista ningún chat que hoy aparece acá:
         * si un técnico quedó marcado con la etiqueta pero su número todavía no
         * está cargado en la agenda, igual sigue saliendo.
         */
        return !!buscarTecnico(c.wa_id)
          || (!!claveEtiquetaTecnicos && ticketStatusByConvId[c.id] === claveEtiquetaTecnicos);
      }
      if (ticketStatus) return ticketStatusByConvId[c.id] === ticketStatus;
      return true;
    }).sort((a, b) =>
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );
  }, [conversations, searchTerm, searchResults, ticketStatusByConvId, chatFilter, userId, buscarTecnico, claveEtiquetaTecnicos]);

  /** Cuántos chats caen hoy bajo el filtro de técnicos, para el número del chip. */
  const chatsTecnicos = useMemo(
    () => conversations.filter(c =>
      c.status !== 'cerrado'
      && (!!buscarTecnico(c.wa_id)
        || (!!claveEtiquetaTecnicos && ticketStatusByConvId[c.id] === claveEtiquetaTecnicos)),
    ),
    [conversations, buscarTecnico, claveEtiquetaTecnicos, ticketStatusByConvId],
  );
  const cuentaTecnicos = chatsTecnicos.length;
  /** Chats de técnicos con mensajes sin leer: el globo rojo del chip, igual que el de las demás etiquetas. */
  const unreadTecnicos = useMemo(() => chatsTecnicos.filter(c => c.unread_count > 0).length, [chatsTecnicos]);

  const convVisible = filtered.slice(0, convVisibleCount);

  // Reiniciar el bloque visible al cambiar filtro o búsqueda.
  useEffect(() => { setConvVisibleCount(CONV_PAGE); }, [chatFilter, searchTerm]);

  // Scroll infinito determinístico: auto-rellena hasta que haya barra de scroll y
  // carga el siguiente bloque al acercarse al final. (Mismo enfoque que el centro de tickets.)
  useEffect(() => {
    const el = convSentinelRef.current;
    const vp = el?.closest("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    if (!vp) return;
    const total = filtered.length;
    const grow = () => setConvVisibleCount(c => (c < total ? Math.min(c + CONV_PAGE, total) : c));
    const maybeLoad = () => {
      if (convVisibleCount >= total) return;
      const hasScrollbar = vp.scrollHeight > vp.clientHeight + 1;
      // Auto-rellenar solo hasta tener barra de scroll (tope de seguridad por si el
      // contenedor no recortara, para no cascadear a miles).
      const needFill = !hasScrollbar && convVisibleCount < 160;
      const nearBottom = hasScrollbar && vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 300;
      if (needFill || nearBottom) grow();
    };
    vp.addEventListener("scroll", maybeLoad, { passive: true });
    // Medir el relleno inicial tras el layout (si no, scrollHeight/clientHeight
    // vienen sin asentar y se auto-rellena de más).
    const raf = requestAnimationFrame(maybeLoad);
    return () => { cancelAnimationFrame(raf); vp.removeEventListener("scroll", maybeLoad); };
  }, [filtered.length, convVisibleCount]);

  /*
   * Las iniciales salen del telefono, no del nombre.
   *
   * La lista muestra el numero, asi que sacar las letras del nombre dejaria
   * avatares que no corresponden a lo que se lee al lado. Y los dos primeros
   * digitos tampoco sirven: en Chile todos empiezan en 56, quedarian todos
   * iguales. Los dos ultimos si distinguen.
   */
  const getInitials = (_name: string | null, waId: string) =>
    waId.replace(/\D/g, "").slice(-2) || "--";

  // Helpers para presencia en tiempo real
  const getAgentInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };
  const stringToColor = (str: string) => {
    // Genera un color HSL consistente a partir del user_id — mismo usuario = mismo color siempre
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 65%, 50%)`;
  };

  // Group messages by date — memoizado para no reagrupar en renders no relacionados
  const grouped = useMemo(() => {
    const result: { date: string; msgs: Message[] }[] = [];
    let curDate = "";
    messages.forEach(msg => {
      const d = new Date(msg.created_at);
      const key = isToday(d) ? "Hoy" : isYesterday(d) ? "Ayer" : format(d, "dd MMMM yyyy", { locale: es });
      if (key !== curDate) { curDate = key; result.push({ date: key, msgs: [] }); }
      result[result.length - 1].msgs.push(msg);
    });
    return result;
  }, [messages]);

  // 24h window validation
  const lastInbound = useMemo(() => messages.filter(m => m.direction === 'inbound').pop(), [messages]);
  const horasDesdeUltimoMensaje = lastInbound
    ? (Date.now() - new Date(lastInbound.created_at).getTime()) / (1000 * 60 * 60)
    : Infinity;
  const dentroDeVentana = horasDesdeUltimoMensaje <= 24;
  const horasRestantes = Math.max(0, 24 - horasDesdeUltimoMensaje);

  /*
   * ── Por dónde sale la respuesta ───────────────────────────────────────────
   *
   * Dos canales, nombrados por lo que cuestan: la API oficial de Meta se factura
   * por mensaje, la no oficial es una sesión de WhatsApp Web (Baileys) y no
   * cuesta. El chat web salió de acá: se guardaba en la base y el cliente no lo
   * veía salvo que tuviera el widget abierto, así que el operador creía haber
   * contestado sin haber contestado.
   *
   * Disponibilidad según lo que la empresa tiene configurado, y la selección
   * inicial es la que diga `company_config.default_provider`.
   */
  const noOficialConfigurada = cfgCanales
    ? (cfgCanales.evolution_enabled && !!cfgCanales.evolution_instance)
    // Sin fila legible: lo que ya sabe `evolution_estado`. Es más honesto que
    // esconder el canal por un problema de permisos.
    : evolutionHabilitado;
  const oficialConfigurada = cfgCanales
    ? (!!cfgCanales.ycloud_phone && cfgCanales.tiene_ycloud_key)
    // El oficial es el canal histórico: si no se pudo leer la config, no se bloquea.
    : true;
  const canalPorDefecto: Proveedor = cfgCanales?.default_provider === 'evolution' ? 'evolution' : 'ycloud';

  const estaDisponible = (p: Proveedor) => p === 'evolution' ? noOficialConfigurada : oficialConfigurada;

  /**
   * La sesión sin costo se cayó y ya lo sabemos (`null` = todavía no se consultó).
   * Mientras no se sepa, no se mueve nada: saltar de canal al abrir el chat sería
   * peor que esperar la respuesta.
   */
  const sesionNoOficialCaida = evolutionEstadoSesion !== null && !evolutionUsable;

  /** Lo elegido para esta conversación, o el default de la empresa si no eligió nada. */
  const canalDeLaConversacion: Proveedor = (() => {
    const candidato = (selectedConv && canalPorConversacion[selectedConv.id]) || canalPorDefecto;
    let canal = candidato;
    if (!estaDisponible(canal)) {
      const otro: Proveedor = candidato === 'evolution' ? 'ycloud' : 'evolution';
      if (estaDisponible(otro)) canal = otro;
    }
    // Si la no oficial está caída, por ahí no va a salir nada: el selector se mueve
    // solo a la oficial. El fallback del envío sigue existiendo para el caso en que
    // se caiga entre esta consulta y el mensaje.
    if (canal === 'evolution' && sesionNoOficialCaida && oficialConfigurada) canal = 'ycloud';
    return canal;
  })();

  const elegirCanal = (p: Proveedor) => {
    if (!selectedConv) return;
    setCanalPorConversacion(prev => ({ ...prev, [selectedConv.id]: p }));
  };

  /**
   * "Con costo (~$17,66 CLP por mensaje)" o, sin precio cargado, sólo "con costo".
   * El valor de `costo_mensaje_oficial` está en pesos chilenos —17,66 CLP son los
   * ~0,02 USD de una plantilla—, así que se dice CLP para que nadie lo lea en dólares.
   */
  const costoMensajeOficial = (() => {
    const n = cfgCanales?.costo_mensaje_oficial;
    if (!n || !Number.isFinite(n)) return null;
    return `$${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })} CLP`;
  })();

  /**
   * La ventana de 24 h es una regla comercial de Meta sobre su API de negocio: no
   * es del protocolo. La sesión sin costo escribe como una persona desde su
   * teléfono y ahí no rige.
   */
  const sinVentana = canalDeLaConversacion === 'evolution';
  const puedeEnviar = dentroDeVentana || sinVentana;
  /** Fuera de ventana con la no oficial disponible y sin usar todavía. */
  const ofrecerSinCosto = !dentroDeVentana && noOficialConfigurada && !sinVentana;

  /** Traduce el rechazo del proveedor a algo que el operador pueda accionar. */
  const mensajeDeEnvio = (r: ResultadoEnvio, canal: Proveedor): string => {
    const crudo = r.mensaje || '';
    if (canal === 'ycloud' && /ventana|24\s*h|window|re-?engagement|template|plantilla/i.test(crudo)) {
      return "La API oficial no permite texto libre fuera de la ventana de 24 h: hay que enviar una plantilla.";
    }
    if (r.red) {
      return canal === 'evolution'
        ? "No se pudo confirmar el envío por la API no oficial. Revisá la conversación antes de reenviar."
        : "No se pudo confirmar el envío por la API oficial. Revisá la conversación antes de reenviar.";
    }
    return crudo || (canal === 'evolution'
      ? "La API no oficial no pudo enviar el mensaje."
      : "La API oficial no pudo enviar el mensaje.");
  };

  /** Revierte la burbuja optimista y devuelve el texto al campo. */
  const revertirEnvio = (optimisticId: string, texto: string) => {
    setMessages(prev => prev.filter(m => m.id !== optimisticId));
    if (texto && msgTextareaRef.current && !msgTextareaRef.current.value.trim()) {
      msgTextareaRef.current.value = texto;
      msgTextareaRef.current.style.height = "auto";
      setHasContent(true);
    }
  };

  /**
   * Envía por el canal pedido y, si ese canal es la API no oficial y se cayó,
   * reintenta UNA vez por la oficial.
   *
   * Nunca al revés: la oficial cuesta y esa decisión no se toma sola. Tampoco hay
   * fallback si el operador ya había elegido la oficial, ni por errores de
   * validación o permisos. Y no hay fallback cuando no hubo respuesta: un timeout
   * no prueba que el mensaje no salió, y reenviarlo por el oficial le mandaría un
   * segundo WhatsApp al cliente. Ahí se revierte y decide el operador.
   */
  const enviarConFallback = async (
    cuerpo: CuerpoEnvio,
    canal: Proveedor,
  ): Promise<{ r: ResultadoEnvio; fallback: boolean }> => {
    let r: ResultadoEnvio;
    try {
      r = await enviarPorCanal(canal, cuerpo);
    } catch (e: any) {
      r = { ok: false, red: true, mensaje: e?.message };
    }
    if (r.ok) return { r, fallback: false };

    const cayoNoOficial = canal === 'evolution'
      && (!!r.sesionCaida || (r.estado != null && r.estado !== 'open'));
    if (!cayoNoOficial || !oficialConfigurada) return { r, fallback: false };

    let r2: ResultadoEnvio;
    try {
      r2 = await enviarPorCanal('ycloud', cuerpo);
    } catch (e: any) {
      r2 = { ok: false, red: true, mensaje: e?.message };
    }
    // La sesión dejó de estar arriba: que el selector lo refleje ya.
    refrescarCanal();
    if (r2.ok) {
      const convId = cuerpo.conversationId;
      setCanalPorConversacion(prev => ({ ...prev, [convId]: 'ycloud' }));
    }
    return { r: r2, fallback: true };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv) return;

    // La ventana de 24 h es una regla de WhatsApp: no aplica al chat web ni al
    // canal sin costo, que no pasa por la API de negocio de Meta.
    if (!puedeEnviar) {
      toast({ title: "Envío Bloqueado", description: "Han pasado más de 24 horas desde el último mensaje del cliente.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      // En minúscula: un "FOTO.JPG" dejaba la ruta con extensión en mayúscula y
      // algunos visores la tratan distinta a la misma foto en minúscula.
      const fileExt = (file.name.split('.').pop() || '').toLowerCase();
      const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const filePath = `${selectedConv.id}/${uniqueName}`;

      const { error: uploadError } = await supabase.storage
        .from('whatsapp_media')
        .upload(filePath, file, { contentType: file.type });

      if (uploadError) {
        /*
         * Cuando el bucket rechaza el archivo, el envío nunca llega a hacerse: no
         * hay error del lado del backend porque nunca se lo llamó. Se reporta a
         * mano para que ese caso deje de ser invisible.
         */
        Sentry.captureException(uploadError, {
          tags: { area: "adjunto" },
          extra: { tipo: file.type, extension: fileExt, tamano: file.size },
        });
        throw new Error("Error al subir archivo: " + uploadError.message);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('whatsapp_media')
        .getPublicUrl(filePath);

      if (selectedConv.is_agent_active) await handleToggleBot(false);

      // Use the real MIME type from the file for YCloud
      // YCloud requires: 'image', 'video', 'audio', or 'document'
      let ycloudType: 'image' | 'video' | 'audio' | 'document' = 'document';
      if (file.type.startsWith('image/')) ycloudType = 'image';
      else if (file.type.startsWith('video/')) ycloudType = 'video';
      else if (file.type.startsWith('audio/')) ycloudType = 'audio';

      const cuerpoMedia: CuerpoEnvio = {
        to: selectedConv.wa_id,
        message: null,               // No text fallback — let YCloud handle it as pure media
        conversationId: selectedConv.id,
        mediaUrl: publicUrl,
        mediaType: ycloudType,
        // El nombre que eligió el operador, para que al cliente le llegue
        // "comprobante.pdf" y no el identificador con el que se guardó.
        fileName: file.name,
        senderName: effectiveSenderName,
      };
      // Mismo criterio que el texto: si la no oficial está caída, el adjunto sale
      // por la oficial. El archivo ya está subido, así que el reintento no lo sube
      // de nuevo.
      const canalMedia = canalDeLaConversacion;
      const { r: envio, fallback } = await enviarConFallback(cuerpoMedia, canalMedia);
      if (!envio.ok) {
        // Un timeout no dice si el adjunto salió: no se reintenta solo.
        if (envio.red) {
          toast({
            title: "Envío sin confirmar",
            description: mensajeDeEnvio(envio, fallback ? 'ycloud' : canalMedia),
            variant: "destructive",
          });
          return;
        }
        throw new Error(mensajeDeEnvio(envio, fallback ? 'ycloud' : canalMedia));
      }
      if (fallback) {
        toast({
          title: "Salió por la API oficial",
          description: "La API no oficial está caída. El archivo salió por la API oficial (con costo).",
        });
      } else {
        toast({ title: "Archivo Enviado", description: "El adjunto fue entregado al cliente." });
      }
    } catch (err: any) {
      toast({ title: "Error al subir archivo", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Pre-compute badge counts once per render (O(n) instead of O(n×m)) ──
  /** Trae el último mensaje entero de una conversación y lo deja cacheado. */
  const cargarUltimoMensaje = useCallback(async (convId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("content, direction, sender_type")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(1);
    const m = Array.isArray(data) ? data[0] : null;
    if (!m?.content) return;
    /*
     * Quién habló. `direction` entrante siempre es el cliente; saliente puede ser
     * el agente de IA o una persona del equipo, y esa diferencia es justamente la
     * que decide si hay que abrir el chat ahora.
     */
    const quien = m.direction === "inbound"
      ? "lo escribió el cliente"
      : m.sender_type === "agent"
        ? "respondió el agente"
        : "respondió el equipo";
    setUltimosMensajes(prev => ({ ...prev, [convId]: { texto: m.content, quien } }));
  }, []);

  const badgeCounts = useMemo(() => {
    const counts: Record<string, { count: number; unread: number }> = {};
    for (const label of ticketLabels) {
      let count = 0;
      let unread = 0;
      for (const c of conversations) {
        if (ticketStatusByConvId[c.id] === label.key) {
          count++;
          if (c.unread_count > 0) unread++;
        }
      }
      counts[label.key] = { count, unread };
    }
    return counts;
  }, [conversations, ticketStatusByConvId, ticketLabels]);

  /*
   * Etiquetas en el orden en que se están usando.
   *
   * Cada empresa puede tener muchas etiquetas y en fila ocupaban media bandeja.
   * "Todos" y "Técnicos" quedan fijos al inicio; el resto se ordena por
   * movimiento: primero las que tienen chats sin leer (más sin leer, más
   * arriba), después por el último mensaje de sus chats. Así lo que se está
   * moviendo queda siempre en las filas visibles. Las que no tienen chats
   * mantienen el orden en que se configuraron.
   */
  const etiquetasVisibles = useMemo(() => {
    const ultimo: Record<string, number> = {};
    for (const c of conversations) {
      const k = ticketStatusByConvId[c.id];
      if (!k) continue;
      const ts = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
      if (ts > (ultimo[k] ?? 0)) ultimo[k] = ts;
    }
    return ticketLabels
      .filter(l => !l.is_final && !esEtiquetaTecnicos(l))
      .map((l, i) => ({ l, i }))
      .sort((a, b) =>
        ((badgeCounts[b.l.key]?.unread ?? 0) - (badgeCounts[a.l.key]?.unread ?? 0))
        || ((ultimo[b.l.key] ?? 0) - (ultimo[a.l.key] ?? 0))
        || (a.i - b.i))
      .map(x => x.l);
  }, [conversations, ticketStatusByConvId, ticketLabels, badgeCounts]);

  // Filas de chips: sólo se ven las 3 primeras; el resto queda tras "Ver todas".
  const FILAS_CHIPS = 2;
  const [altoChips, setAltoChips] = useState<number | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const [chipsExpandido, setChipsExpandido] = useState(false);
  const [chipsOcultos, setChipsOcultos] = useState<string[]>([]);
  useLayoutEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    const medir = () => {
      // Se mide con todos los chips puestos (el recorte del contenedor no altera el layout).
      const todos = Array.from(el.querySelectorAll<HTMLElement>('[data-fila-chip]'));
      if (todos.length === 0) { setChipsOcultos([]); setAltoChips(null); return; }
      const filas = Array.from(new Set(todos.map(h => h.offsetTop))).sort((a, b) => a - b);
      if (filas.length <= FILAS_CHIPS) { setChipsOcultos([]); setAltoChips(null); return; }
      const corte = filas[FILAS_CHIPS];
      const ultimaFila = todos.filter(h => h.offsetTop === filas[FILAS_CHIPS - 1]);
      const bajo = Math.max(...ultimaFila.map(h => h.offsetTop + h.offsetHeight));
      const ocultos = todos.filter(h => h.offsetTop >= corte && h.dataset.chipKey).map(h => h.dataset.chipKey!);
      setAltoChips(bajo + 2);
      setChipsOcultos(prev => prev.length === ocultos.length && prev.every((k, i) => k === ocultos[i]) ? prev : ocultos);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [etiquetasVisibles, tecnicos.length, claveEtiquetaTecnicos, chipsExpandido, badgeCounts, cuentaTecnicos, unreadTecnicos]);
  const unreadOcultos = useMemo(
    () => chipsOcultos.reduce((n, k) => n + (badgeCounts[k]?.unread ?? 0), 0),
    [chipsOcultos, badgeCounts],
  );

  const allUnread = useMemo(
    () => conversations.filter(c => c.status !== 'cerrado' && c.unread_count > 0).length,
    [conversations]
  );


  return (
    <div className="flex h-full w-full overflow-hidden bg-background relative z-10">
      {/* 1. Sidebar de Chats */}
      <div className={`tour-inbox-sidebar ${selectedConv ? "hidden md:flex" : "flex"} flex-col w-full md:w-[300px] border-r border-border/10 glass flex-shrink-0 z-10 overflow-hidden`}>
        <div className="p-4 border-b border-border/20 space-y-3 sticky top-0 z-10">
          <div className="flex items-center gap-2 mb-1">
            {/* Mobile: abre drawer propio de la bandeja */}
            <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1 flex-shrink-0 md:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-4 h-4" />
            </Button>
            {/* Desktop: toggle del sidebar principal */}
            <SidebarTrigger className="hidden md:flex text-muted-foreground/70 hover:text-foreground transition-colors -ml-1 flex-shrink-0" />
            <span className="text-sm font-semibold">Bandeja</span>
            <div className="ml-auto flex items-center gap-1 flex-shrink-0">
              {outboundEnabled && (
                <button
                  onClick={() => openNewConvModal()}
                  title="Iniciar nueva conversación"
                  className="w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center transition-colors"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="relative">
              {searching
                ? <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary animate-spin" />
                : <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
              }
              <Input
                placeholder="Buscar mensajes en chats..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-7 h-9 bg-secondary/50 border-border/40 focus-visible:ring-1 text-[13px] rounded-lg shadow-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* Feedback de resultados */}
            {searchTerm.trim().length >= 3 && !searching && (
              <div className="flex items-center gap-1.5 px-1">
                {searchResults.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/60">Sin resultados — intenta con otras palabras</p>
                ) : searchResults.length > 80 ? (
                  <p className="text-[10px] text-amber-500/80">
                    <span className="font-semibold">{searchResults.length}</span> chats — agrega más palabras para afinar
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground/60">
                    <span className="font-semibold text-foreground/70">{searchResults.length}</span> chats encontrados
                  </p>
                )}
              </div>
            )}
            {searchTerm.trim().length > 0 && searchTerm.trim().length < 3 && (
              <p className="text-[10px] text-muted-foreground/50 px-1">Escribe al menos 3 caracteres</p>
            )}
          </div>
          {/* ── Filtros unificados: Todos + etiquetas de ticket + Míos + Cerrados ── */}
          <div
            ref={chipsRef}
            className="relative flex gap-1.5 flex-wrap pt-1.5 px-0.5 overflow-hidden"
            style={!chipsExpandido && altoChips != null ? { maxHeight: altoChips } : undefined}
          >
            {/* Todos */}
            <button
              data-fila-chip
              onClick={() => setChatFilter('all')}
              className={`relative flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full border transition-all ${chatFilter === 'all' ? 'bg-foreground text-background border-foreground shadow-sm' : 'text-muted-foreground bg-background/50 border-border/30 hover:text-foreground hover:border-border/60'}`}
            >
              Todos
              {allUnread > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-[8px] font-black text-white flex items-center justify-center">{allUnread}</span>
              )}
            </button>

            {/*
              * Técnicos va pegado a "Todos" y no entre las etiquetas, porque no es
              * un estado por el que pase un caso: es quién está del otro lado del
              * chat. Mismo color y mismas mayúsculas que tenía como etiqueta, para
              * que nadie tenga que volver a buscarlo.
              */}
            {(tecnicos.length > 0 || claveEtiquetaTecnicos) && (
              <button
                data-fila-chip
                onClick={() => setChatFilter(chatFilter === 'tecnicos' ? 'all' : 'tecnicos')}
                className="relative flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full border transition-all"
                style={chatFilter === 'tecnicos'
                  ? { backgroundColor: colorTecnicos, borderColor: colorTecnicos, color: '#fff' }
                  : { backgroundColor: colorTecnicos + '18', borderColor: colorTecnicos + '50', color: colorTecnicos }
                }
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: chatFilter === 'tecnicos' ? '#fff' : colorTecnicos }} />
                {(etiquetaTecnicos?.name ?? 'Técnicos').toUpperCase()}
                {cuentaTecnicos > 0 && <span className="text-[9px] opacity-70 ml-0.5">{cuentaTecnicos}</span>}
                {unreadTecnicos > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-[8px] font-black text-white flex items-center justify-center">{unreadTecnicos}</span>
                )}
              </button>
            )}

            {/* Etiqueta de ticket como filtro (oculta las finales como "Resuelto" y la de técnicos, que ya tiene la suya) */}
            {etiquetasVisibles.map(label => {
              const filterKey = `ticket:${label.key}`;
              const active = chatFilter === filterKey;
              const { count = 0, unread = 0 } = badgeCounts[label.key] ?? {};
              return (
                <button
                  key={label.key}
                  data-fila-chip
                  data-chip-key={label.key}
                  onClick={() => setChatFilter(active ? 'all' : filterKey)}
                  className={`relative flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full border transition-all`}
                  style={active
                    ? { backgroundColor: label.color, borderColor: label.color, color: '#fff' }
                    : { backgroundColor: label.color + '18', borderColor: label.color + '50', color: label.color }
                  }
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: active ? '#fff' : label.color }} />
                  {label.name.toUpperCase()}
                  {count > 0 && (
                    <span className="text-[9px] opacity-70 ml-0.5">{count}</span>
                  )}
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-[8px] font-black text-white flex items-center justify-center">{unread}</span>
                  )}
                </button>
              );
            })}

          </div>
          {(chipsOcultos.length > 0 || chipsExpandido) && (
            <button
              onClick={() => setChipsExpandido(v => !v)}
              className="relative flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${chipsExpandido ? 'rotate-180' : ''}`} />
              {chipsExpandido ? 'Ver menos' : `Ver todas (+${chipsOcultos.length})`}
              {!chipsExpandido && unreadOcultos > 0 && (
                <span className="min-w-[14px] h-3.5 px-1 rounded-full bg-red-500 text-[8px] font-black text-white flex items-center justify-center">{unreadOcultos}</span>
              )}
            </button>
          )}
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground text-[13px]">Cargando chats...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-[13px]">No se encontraron conversaciones</div>
          ) : convVisible.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleConvSelect(conv)}
              /*
               * La vista previa se abre en cualquier fila que tenga algo que mostrar.
               *
               * Antes pedía nota Y ticket, así que en la mayoría de los chats pasar
               * el mouse no hacía nada y había que adivinar cuáles tenían nota. El
               * último mensaje siempre existe, así que siempre hay algo que leer.
               * Medio segundo: menos se dispara solo al cruzar la lista, más se
               * siente trabado.
               */
              onMouseEnter={(e) => {
                const hayNota = !!convNotes[conv.id]?.trim();
                const hayMensaje = !!conv.last_message_preview?.trim();
                if (!hayNota && !hayMensaje) return;
                const target = e.currentTarget as HTMLElement;
                tooltipTimeoutRef.current = setTimeout(() => {
                  setTooltipRect(target.getBoundingClientRect());
                  setTooltipConvId(conv.id);
                  if (hayMensaje && !ultimosMensajes[conv.id]) cargarUltimoMensaje(conv.id);
                }, 450);
              }}
              onMouseLeave={() => {
                if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
                setTooltipConvId(null);
                setTooltipRect(null);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-all border-b border-border/5 ${selectedConv?.id === conv.id ? "bg-primary/10 relative" : ""}`}
            >
              {selectedConv?.id === conv.id && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" />
              )}
              <div className="relative flex-shrink-0 flex items-center">
                <Avatar className="h-10 w-10 border border-border/50">
                  <AvatarFallback
                    className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-[11px] font-semibold"
                    style={buscarTecnico(conv.wa_id)
                      ? { background: buscarTecnico(conv.wa_id)!.color + '26', color: buscarTecnico(conv.wa_id)!.color }
                      : undefined}
                  >
                    {buscarTecnico(conv.wa_id)?.name.trim().slice(0, 2).toUpperCase()
                      ?? getInitials(conv.profile_name, conv.wa_id)}
                  </AvatarFallback>
                </Avatar>

              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center text-left overflow-hidden" style={{ contain: 'inline-size' }}>
                <div className="flex items-center gap-2 min-w-0 mb-1">
                  {/*
                    * El numero y no el nombre de WhatsApp.
                    *
                    * Ese nombre lo escribe el cliente en su propio telefono: puede
                    * ser un apodo, un emoji o el nombre de otra persona. El numero
                    * es con lo que se le busca en los demas sistemas, asi que es el
                    * dato que el operador necesita leer de un vistazo.
                    */}
                  {/* Los técnicos son la excepción: a ellos sí se les muestra el
                      nombre, porque es el que quedó registrado en la agenda y no uno
                      que el contacto se puso a sí mismo en su teléfono. */}
                  <span className={`font-semibold text-[13px] truncate ${buscarTecnico(conv.wa_id) ? '' : 'font-mono'} ${selectedConv?.id === conv.id ? "text-primary" : "text-foreground"} tracking-wide`}>
                    {buscarTecnico(conv.wa_id)?.name ?? conv.wa_id}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="bg-green-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 flex-shrink-0 shadow-sm leading-none">
                      {conv.unread_count > 99 ? '99+' : conv.unread_count}
                    </span>
                  )}
                  <span className={`text-[10px] flex-shrink-0 ml-auto pl-1 font-semibold ${conv.unread_count > 0 ? "text-primary" : "text-muted-foreground"}`}>
                    {conv.last_message_at ? formatConvDate(conv.last_message_at) : ""}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <ConvStatusBadge conv={conv} ticketStatus={ticketStatusByConvId[conv.id]} labels={ticketLabels} />
                    {/*
                     * Que la nota se vea sin pasar el mouse. Es el dato que hace
                     * abrir un chat antes que otro, y estaba escondido detrás de un
                     * hover que además había que acertar.
                     */}
                    {!!convNotes[conv.id]?.trim() && (
                      <span
                        title="Tiene nota del caso"
                        className="inline-flex items-center gap-0.5 text-[8px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-500"
                      >
                        <StickyNote className="w-2 h-2" /> NOTA
                      </span>
                    )}
                    {conv.taken_by && (
                      <ChipDueno
                        nombre={porOperador[conv.taken_by]?.nombre ?? "otro operador"}
                        iniciales={porOperador[conv.taken_by]?.iniciales ?? "??"}
                        esMio={conv.taken_by === userId}
                        abandonado={casoAbandonado(conv.taken_at, conv.last_message_at)}
                      />
                    )}
                    {conv.priority === 'alta' && (
                      <span className="inline-flex items-center gap-0.5 text-[8px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-500">
                        <Flame className="w-2 h-2" /> ALTA
                      </span>
                    )}
                    {conv.match_content && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 py-0 bg-primary/10 text-primary border-primary/20 font-bold ml-auto">
                        en mensaje
                      </Badge>
                    )}
                  </div>
                  <p className={`text-[11px] leading-tight truncate w-full ${conv.unread_count > 0 ? "text-foreground/90 font-medium" : "text-muted-foreground/60 font-light"}`}>
                    {conv.match_content || conv.last_message_preview || "Sin mensajes"}
                  </p>
                </div>
              </div>
            </button>
          ))}
          {convVisibleCount < filtered.length && (
            <div ref={convSentinelRef} className="py-3 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
            </div>
          )}
        </ScrollArea>
      </div>

      {/* 2. Ventana de Conversación */}
      <div className={`tour-inbox-chat ${selectedConv ? "flex" : "hidden md:flex"} flex-col flex-1 bg-background/50 relative overflow-hidden min-h-0`}>
        {/* Background Pattern */}
        {!selectedConv ? (
          <InboxEmptyPanel companyId={companyId} onNavigateToSchedule={onNavigateToSchedule} />
        ) : (
          <div className="flex flex-col flex-1 h-full min-h-0 relative z-10 bg-background/50">
            {/* Header. La vista de la ONU se abre solo desde su botón: antes el bloque
                entero respondía al hover, y con la vista a pantalla completa eso
                escondería la conversación al pasar el ratón por encima sin querer. */}
            <div className="border-b border-border/10 glass z-20 flex-shrink-0">
            {/* `min-w-0` en la fila y en el bloque del cliente: sin eso el nombre no
                puede encogerse, empuja los botones hacia afuera y aparece una barra de
                desplazamiento horizontal que descuadra la página entera. */}
            <div className="flex justify-between items-center gap-3 px-6 h-16 min-w-0">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 -ml-2" onClick={() => setSelectedConv(null)}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10 border border-primary/20 shadow-lg glow-box flex-shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {getInitials(selectedConv.profile_name, selectedConv.wa_id)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    {/* Mismo criterio que en la lista: manda el número, salvo para
                        los técnicos, que llevan el nombre de la agenda. Ya no hay
                        línea chica con el teléfono para el resto: el título *es* el
                        teléfono, con copiar y WhatsApp pegados al lado. */}
                    <span className={`text-[14px] font-bold tracking-wide text-foreground leading-none mb-1 flex items-center gap-1.5 min-w-0 ${tecnicoDelChat ? '' : 'font-mono'}`}>
                      <span className="truncate">{tecnicoDelChat?.name ?? selectedConv.wa_id}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(selectedConv.wa_id); toast({ title: 'Teléfono copiado' }); }}
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-primary/10 text-muted-foreground/40 hover:text-primary transition-colors"
                        title="Copiar número"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {/* Abrir el chat en WhatsApp Web. Antes solo aparecía con la
                          ventana de 24 h vencida; va acá para tenerlo siempre a mano
                          sin ocupar espacio en la conversación. */}
                      <a
                        href={`https://wa.me/${selectedConv.wa_id.replace(/^\+/, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir en WhatsApp"
                        className="h-5 w-5 flex items-center justify-center rounded text-[#25d366]/50 hover:text-[#25d366] hover:bg-[#25d366]/10 transition-colors"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      </a>
                    </span>
                    {tecnicoDelChat && (
                      <span className="text-[11px] text-muted-foreground/55 font-mono leading-none mb-1">
                        {selectedConv.wa_id}
                      </span>
                    )}
                    <div className="scale-90 origin-left mt-0.5 flex items-center gap-2 whitespace-nowrap">
                      <ConvStatusBadge
                        conv={selectedConv}
                        ticketStatus={activeTicket ? activeTicket.status : undefined}
                        labels={ticketLabels}
                      />
                      {selectedConv.priority === 'alta' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-500 text-[8px] font-black uppercase tracking-widest">
                          <Flame className="w-2.5 h-2.5" /> ALTA
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Avatares de presencia — quién está viendo este chat */}
                {selectedConv && userId && (
                  <div className="flex items-center -space-x-1.5">
                    {/* Avatar propio — siempre visible con "Tú" */}
                    <div
                      title="Tú"
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-background cursor-default select-none flex-shrink-0 relative"
                      style={{ backgroundColor: stringToColor(userId) }}
                    >
                      {getAgentInitials(userName || "Yo")}
                      {/* Punto verde de "en vivo" */}
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-background" />
                    </div>
                    {/* Otros agentes viendo el mismo chat */}
                    {activeViewers.slice(0, 3).map((viewer) => (
                      <div
                        key={viewer.user_id}
                        title={viewer.user_name}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-background cursor-default select-none flex-shrink-0"
                        style={{ backgroundColor: viewer.color }}
                      >
                        {viewer.initials}
                      </div>
                    ))}
                    {activeViewers.length > 3 && (
                      <div
                        title={activeViewers.slice(3).map(v => v.user_name).join(", ")}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-muted-foreground bg-muted ring-2 ring-background cursor-default select-none flex-shrink-0"
                      >
                        +{activeViewers.length - 3}
                      </div>
                    )}
                  </div>
                )}

                {/* Interruptor de la vista de la ONU. El punto de color adelanta el
                    estado sin abrir nada; el rótulo solo aparece si hay sitio. */}
                {activeTicket?.onu_external_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNetworkPanelOpen(o => !o)}
                    title={networkPanelOpen ? "Volver a la conversación" : "Ver el equipo del cliente"}
                    className={`h-8 gap-1.5 px-2.5 text-[10px] font-bold tracking-wider uppercase border transition-all ${
                      networkPanelOpen
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-primary/40 text-primary hover:bg-primary/10"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${onuPuntoEstado}`} />
                    <Wifi className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">{networkPanelOpen ? "Volver" : "ONU"}</span>
                  </Button>
                )}
                {/* De quién es este caso: un solo botón que despliega sus acciones. */}
                <ControlPropiedadCaso
                  duenoId={selectedConv.taken_by}
                  duenoNombre={selectedConv.taken_by ? porOperador[selectedConv.taken_by]?.nombre : null}
                  tomadoEn={selectedConv.taken_at}
                  userId={userId}
                  abandonado={casoAbandonado(selectedConv.taken_at, selectedConv.last_message_at)}
                  ocupado={casoOcupado}
                  simulando={isSimulating}
                  onTomar={handleTakeCase}
                  onArrebatar={() => setArrebatoPendiente({
                    convId: selectedConv.id,
                    nombre: (selectedConv.taken_by ? porOperador[selectedConv.taken_by]?.nombre : null) ?? "otro operador",
                  })}
                  onLiberar={handleLiberarCaso}
                  onTransferir={() => setTransferPersonaOpen(true)}
                />
                {activeTicket && !ticketIsFinal && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCloseChat()}
                    title="Finalizar el ticket"
                    className="h-8 gap-1.5 px-2.5 text-[10px] font-bold tracking-wider uppercase border transition-all border-red-500/50 text-red-500 hover:bg-red-500/10"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">Finalizar</span>
                  </Button>
                )}

                {/* Lo que no se usa en cada mensaje vive acá adentro. El encabezado tenía
                    siete controles a la vez y en pantallas chicas se desbordaba.
                    El canal de salida ya no se elige acá: tiene su propio selector
                    sobre el campo de escritura, con el costo a la vista. */}
                {((activeTicket?.onu_external_id && !ticketIsFinal && !networkPanelOpen)
                  || (noOficialConfigurada && !evolutionUsable)) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Más opciones">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60 bg-card border-border/40">
                      {activeTicket?.onu_external_id && !ticketIsFinal && !networkPanelOpen && (
                        <button
                          onClick={() => setRebootConfirmOpen(true)}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[12px] font-medium text-amber-500 hover:bg-amber-500/10 transition-colors"
                        >
                          <Power className="w-3.5 h-3.5" /> Reiniciar la ONU
                        </button>
                      )}

                      {noOficialConfigurada && !evolutionUsable && (
                        <>
                          {activeTicket?.onu_external_id && !ticketIsFinal && !networkPanelOpen && (
                            <div className="h-px bg-border/30 my-1" />
                          )}
                          <button
                            onClick={onNavigateToSettings}
                            className="w-full text-left px-2 py-1.5 text-[11px] text-amber-500 hover:underline"
                          >
                            {evolutionEstadoSesion === 'connecting'
                              ? 'Terminá de escanear el código →'
                              : 'Vincular WhatsApp sin costo →'}
                          </button>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => setShowMobilePanel(true)}
                  title="Ver detalles"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </Button>
              </div>
            </div>
            </div>

            {/* La conversación se queda montada por debajo y la ficha de la ONU se
                superpone, en vez de sustituirla. Si se desmontara, al volver React la
                reconstruiría desde cero y el chat aparecería al principio de la
                conversación en lugar de donde lo dejaste. */}
            <div className="flex-1 min-h-0 flex flex-col relative">
            {/* Messages */}
            <div ref={messagesContainerRef} className="flex-1 min-h-0">
            <ScrollArea className="h-full px-4 md:px-8 pt-4 pb-0 scroll-smooth">
              <div className="max-w-4xl mx-auto space-y-1 pb-0">
                {grouped.map((group) => (
                  <div key={group.date}>
                    <div className="flex justify-center my-6 sticky top-2 z-10">
                      <span className="text-[10px] font-medium tracking-widest uppercase glass text-muted-foreground px-4 py-1.5 rounded-full shadow-2xl">
                        {group.date}
                      </span>
                    </div>
                    {group.msgs.map((msg, idx) => {
                      const isOut = msg.direction === "outbound";
                      /* El mensaje borrado conserva su fila y su contenido: se pinta el
                         aviso en vez del texto y no se ofrecen más acciones sobre él. */
                      const estaBorrado = msg.status === 'deleted';
                      const puedeAccionar = tieneAccionesDeMensaje(msg);
                      const effectiveSenderName = msg.sender_name || userName || "Especialista";
                      const badge = isOut ? getSenderBadge(msg.sender_type, effectiveSenderName) : null;

                      // Check if previous message is from same sender to chain bubbles ideally
                      const prevMsg = idx > 0 ? group.msgs[idx - 1] : null;
                      const isChained = prevMsg?.direction === msg.direction && prevMsg?.sender_type === msg.sender_type;

                      // Reacciones: mostrar como emoji compacto, no como burbuja
                      if (msg.message_type === 'reaction' && msg.content) {
                        return (
                          <div key={msg.id} className={`flex w-full ${isOut ? "justify-end" : "justify-start"} mt-0.5`}>
                            <div className="flex items-center gap-1 px-2 py-0.5">
                              <span className="text-base leading-none">{msg.content}</span>
                              <span className="text-[10px] text-muted-foreground/50">{formatMessageTime(msg.created_at)}</span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} className={`flex w-full ${isOut ? "justify-end" : "justify-start"} ${isChained ? "mt-0.5" : "mt-2"}`}>
                          <div className={`
                            group/msg relative max-w-[85%] md:max-w-[70%] lg:max-w-[60%] w-fit min-w-0 overflow-hidden px-4 py-2 hover:brightness-110 transition-all shadow-lg
                            ${isOut ? "rounded-[20px] rounded-br-[4px]" : "rounded-[20px] rounded-tl-[4px]"}
                            ${isChained && isOut ? "!rounded-br-[20px]" : ""}
                            ${isChained && !isOut ? "!rounded-tl-[20px]" : ""}
                            ${isOut
                              ? msg.sender_type === "agent"
                                ? "bg-primary/5 dark:bg-transparent dark:chat-bubble-agent border border-primary/20 text-foreground"
                                : msg.sender_type === "specialist"
                                  ? "bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-md border border-indigo-500/30 dark:bg-transparent dark:chat-bubble-specialist dark:border-secondary/20 dark:text-foreground"
                                  : "glass text-foreground bg-primary/10 dark:bg-primary/20"
                              : "bg-white dark:bg-card border border-slate-200 dark:border-white/5 shadow-sm text-foreground"
                            }
                          `}>
                            {badge && !isChained && (
                              <div className={`flex items-center gap-1 mb-1.5 ${isOut ? "opacity-80" : "text-slate-500 dark:text-muted-foreground"}`}>
                                <badge.icon className="w-3 h-3" />
                                <span className="text-[10px] font-medium tracking-wide">{badge.label}</span>
                              </div>
                            )}

                            {/* Reply: bloque citado encima del mensaje */}
                            {msg.message_type === 'reply' && msg.quoted_content && (
                              <div className={`flex items-stretch gap-1.5 mb-2 rounded-lg overflow-hidden text-[11px] max-w-[260px] ${isOut ? "bg-white/10 border border-white/20" : "bg-black/8 border border-black/10 dark:bg-white/5 dark:border-white/10"}`}>
                                <div className="w-1 shrink-0 bg-primary/60 rounded-l-lg" />
                                <div className="py-1.5 pr-2 min-w-0">
                                  <p className="text-primary font-semibold text-[10px] mb-0.5 truncate">Mensaje citado</p>
                                  <p className="text-foreground/70 leading-snug line-clamp-2 break-words">{msg.quoted_content}</p>
                                </div>
                              </div>
                            )}

                            {estaBorrado && (
                              <p className={`text-[12.5px] italic ${
                                /*
                                 * Blanco sobre las burbujas oscuras (el degradado azul/violeta
                                 * del especialista, y todas en modo oscuro). En las claras
                                 * —las del agente y las de texto libre, que usan
                                 * primary/5 y primary/10— el blanco desaparecería, así que
                                 * ahí va el color de texto del tema, más firme que el gris.
                                 */
                                isOut && msg.sender_type === 'specialist'
                                  ? 'text-white'
                                  : 'text-foreground/80 dark:text-white/90'
                              }`}>
                                🚫 Mensaje eliminado
                              </p>
                            )}

                            {!estaBorrado && <MessageMedia message={msg} onOpen={setLightbox} />}

                            {/* En caso de que no haya URL pero sepamos que es multimedia (inbound de YCloud procesando o error) */}
                            {!estaBorrado && !msg.media_url && (msg.message_type === 'video' || msg.message_type === 'image' || msg.message_type === 'audio' || msg.message_type === 'short_video' || (msg.content && /🎥|📷|🎵|\[video\]|\[image\]/i.test(msg.content))) && (
                              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10 mb-2 max-w-[280px]">
                                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center animate-pulse shrink-0">
                                  <Clock className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                  <span className="text-[11px] font-bold text-primary italic uppercase tracking-wider truncate">Multimedia en Camino</span>
                                  <span className="text-[9px] text-muted-foreground leading-tight">Autorizando acceso seguro con WhatsApp...</span>
                                </div>
                              </div>
                            )}

                            {/* Sticker: mostrar etiqueta en lugar de burbuja vacía */}
                            {!estaBorrado && msg.message_type === 'sticker' && (
                              <span className="text-[12px] text-muted-foreground italic">🎭 Sticker</span>
                            )}

                            {/* Mostrar texto solo si no hay multimedia o si el texto no es el placeholder de sistema [Multimedia].
                                Para documentos, el nombre ya se ve en la tarjeta → no repetirlo como texto. */}
                            {!estaBorrado && msg.message_type !== 'sticker' && msg.content && !(msg.media_url && getMediaType(msg.media_url, msg.message_type) === 'document') && (() => {
                              // 0. Detectar fallback de plantilla — mostrar como chip sin pasar por formatWhatsAppText
                              const tplMatch = msg.content.match(/^📋\s*Plantilla:\s*(.+)$/);
                              if (tplMatch) {
                                return (
                                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border/20 w-fit">
                                    <FileText className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                                    <span className="text-[11px] text-muted-foreground/70 font-medium">
                                      Plantilla: <span className="font-mono">{tplMatch[1].trim()}</span>
                                    </span>
                                  </div>
                                );
                              }

                              // 1. Limpieza de etiquetas técnicas [video] y palabras redundantes solas
                              let clean = msg.content.replace(/\[(video|image|audio|document|sticker|short_video)\]/gi, '').trim();

                              // 2. Limpieza de iconos o palabras de sistema si están solas
                              const redundant = ['video', 'audio', 'imagen', 'documento', 'sticker', 'archivo', 'short_video', 'foto', '🎥 video', '🎵 audio', '📷 imagen', '[multimedia]'];
                              const lowerClean = clean.toLowerCase();
                              const isRedundant = ['🎥', '📷', '🎵', '📄', '🏷️', '📍'].includes(clean) || redundant.includes(lowerClean);

                              if (isRedundant) {
                                clean = '';
                              }

                              return clean ? (
                                <div
                                  className="text-[12.5px] whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-snug"
                                  dangerouslySetInnerHTML={{ __html: formatWhatsAppText(clean) }}
                                />
                              ) : null;
                            })()}

                            <div className={`flex items-center justify-end gap-1 mt-0.5 ${isOut ? "opacity-70" : "text-slate-500 dark:text-muted-foreground/60"
                              }`}>
                              {/* Editar y borrar: aparecen al pasar el mouse sobre la burbuja.
                                  En pantallas chicas no hay hover, así que quedan a la vista. */}
                              {puedeAccionar && (
                                <div className="flex items-center gap-0.5 mr-0.5 transition-opacity lg:opacity-0 lg:group-hover/msg:opacity-100">
                                  {esTextoEditable(msg) && (
                                    <button
                                      type="button"
                                      onClick={() => abrirEdicion(msg)}
                                      title="Editar mensaje"
                                      aria-label="Editar mensaje"
                                      className="p-0.5 rounded text-current opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setMensajeABorrar(msg)}
                                    title="Eliminar mensaje"
                                    aria-label="Eliminar mensaje"
                                    className="p-0.5 rounded text-current opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                              <span className="text-[9.5px] font-medium tracking-wide">{formatMessageTime(msg.created_at)}</span>
                              {isOut && <StatusIcon status={msg.status} provider={msg.provider} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </ScrollArea>
            </div>

            {/* Input Wrapper */}
            <div className="p-2 md:px-6 py-2 border-t border-border/5 bg-background/50 backdrop-blur-xl z-20 sticky bottom-0">
              
              {/* Canal de salida, nombrado por lo que cuesta. El que la empresa tiene
                  por defecto arranca seleccionado; si el operador elige el otro, esa
                  elección manda para esta conversación mientras dure la sesión. */}
              {selectedConv && (noOficialConfigurada || oficialConfigurada) && (
                <div className="max-w-4xl mx-auto mb-2 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Responder por
                  </span>
                  <div className="inline-flex rounded-lg border border-border/40 overflow-hidden">
                    {(['evolution', 'ycloud'] as const).map(p => {
                      const disponible = estaDisponible(p);
                      const activo = canalDeLaConversacion === p;
                      const esDefecto = canalPorDefecto === p;
                      const etiqueta = p === 'evolution' ? 'API no oficial' : 'API oficial';
                      return (
                        <button
                          key={p}
                          type="button"
                          disabled={!disponible}
                          onClick={() => elegirCanal(p)}
                          title={disponible
                            ? p === 'evolution'
                              ? 'Sesión de WhatsApp Web (Baileys): no cuesta por mensaje.'
                              : `API oficial de Meta: cada mensaje se factura${costoMensajeOficial ? ` (~${costoMensajeOficial})` : ''}.`
                            : `${etiqueta}: esta empresa no la tiene configurada.`}
                          className={`h-7 px-2.5 text-[10px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            activo
                              ? p === 'evolution'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : 'text-muted-foreground hover:bg-muted/40'
                          }`}
                        >
                          {etiqueta}
                          <span className="ml-1 font-normal opacity-80">
                            {p === 'evolution' ? '— sin costo' : '— con costo'}
                          </span>
                          {esDefecto && (
                            <span className="ml-1.5 text-[8px] font-black uppercase tracking-widest opacity-70">
                              por defecto
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {canalDeLaConversacion === 'evolution'
                      ? 'Sin costo por mensaje.'
                      : `Con costo${costoMensajeOficial ? ` (~${costoMensajeOficial} por mensaje)` : ''}.`}
                  </span>
                  {sesionNoOficialCaida && noOficialConfigurada && oficialConfigurada && (
                    <span className="text-[10px] text-amber-500 font-medium">
                      La API no oficial está caída: se usa la oficial (con costo).
                    </span>
                  )}
                </div>
              )}
              {selectedConv && !noOficialConfigurada && (
                <p className="max-w-4xl mx-auto mb-1 text-[10px] text-muted-foreground">
                  API no oficial: esta empresa no la tiene configurada.
                </p>
              )}
              {selectedConv && !oficialConfigurada && (
                <p className="max-w-4xl mx-auto mb-1 text-[10px] text-muted-foreground">
                  API oficial: esta empresa no la tiene configurada.
                </p>
              )}

              {/* 24-Hour window validation banner */}
              {selectedConv && (
                /* Ya se esta respondiendo por el canal sin costo: la ventana no
                   aplica, asi que no hay nada que avisar mas alla de por que se
                   puede escribir con el reloj vencido. */
                !dentroDeVentana && sinVentana ? (
                  <div className="max-w-4xl mx-auto text-center text-[10.5px] text-muted-foreground/60 mb-2">
                    Pasaron más de 24 h. Estás respondiendo por el canal sin costo, que no
                    tiene esa restricción.
                  </div>
                ) : dentroDeVentana ? (
                  horasRestantes <= 1.5 ? ( // 1.5 because floating round looks nice on screen
                    <div className="max-w-4xl mx-auto bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 rounded-xl p-2 text-center text-[11px] mb-2 font-medium">
                      ⏳ Quedan {Math.round(horasRestantes * 60)} minutos para responder libremente.
                    </div>
                  ) : (
                    <div className="max-w-4xl mx-auto bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 rounded-xl p-2 text-center text-[11px] mb-2 font-medium">
                      ⏳ Quedan {Math.floor(horasRestantes)}h {Math.round((horasRestantes % 1) * 60)}m para responder libremente.
                    </div>
                  )
                ) : (
                  <div className="max-w-4xl mx-auto bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl p-3 mb-2 leading-snug font-medium space-y-2">
                    <p className="text-[11px] text-center">
                      {ofrecerSinCosto
                        ? <>⚠️ Han pasado más de 24 horas: la API oficial ya no deja escribir libre. Puedes responder por el <strong>canal sin costo</strong>, que no tiene esa restricción.</>
                        : <>⚠️ Han pasado más de 24 horas. Solo puedes contactar al cliente con una <strong>plantilla aprobada</strong> o directamente por WhatsApp.</>}
                    </p>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      {/* Se ofrece antes que la plantilla: es gratis, es texto libre y
                          es el caso donde mas se nota tener el segundo canal. */}
                      {ofrecerSinCosto && (
                        <Button
                          size="sm"
                          className="h-8 text-[11px] gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-500 border border-emerald-500/30"
                          onClick={() => elegirCanal('evolution')}
                        >
                          <MessageCircle className="w-3 h-3" />
                          Responder sin costo
                        </Button>
                      )}
                      {outboundEnabled && (bandejaTemplateId ? (
                        /* Plantilla configurada por el admin — un solo botón */
                        <Button
                          size="sm"
                          className="h-8 text-[11px] gap-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
                          onClick={handleActivarIA}
                          disabled={sendingTemplate || loadingTemplates}
                        >
                          {(sendingTemplate || loadingTemplates) ? <Loader2 className="w-3 h-3 animate-spin" /> : "📋"}
                          Enviar plantilla
                        </Button>
                      ) : (
                        /* Sin plantilla configurada — usuario elige */
                        selectedTemplate ? (
                          <>
                            <Button
                              size="sm"
                              className="h-8 text-[11px] gap-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
                              onClick={handleClickSendTemplate}
                              disabled={sendingTemplate}
                            >
                              {sendingTemplate ? <Loader2 className="w-3 h-3 animate-spin" /> : "📋"}
                              Enviar: <span className="font-bold">{selectedTemplate.name}</span>
                            </Button>
                            <button
                              className="text-[10px] text-muted-foreground underline hover:text-foreground"
                              onClick={() => { fetchTemplates(); setShowTemplateSelector(true); }}
                            >
                              Cambiar plantilla
                            </button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            className="h-8 text-[11px] gap-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
                            onClick={() => { fetchTemplates(); setShowTemplateSelector(true); }}
                            disabled={loadingTemplates}
                          >
                            {loadingTemplates ? <Loader2 className="w-3 h-3 animate-spin" /> : "📋"}
                            Seleccionar plantilla de respuesta
                          </Button>
                        )
                      ))}
                      {/* Abrir en WhatsApp Web */}
                      <a
                        href={`https://wa.me/${selectedConv.wa_id.replace(/^\+/, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[11px] font-medium bg-[#25d366]/15 hover:bg-[#25d366]/25 text-[#25d366] border border-[#25d366]/30 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        Abrir en WhatsApp
                      </a>
                    </div>
                  </div>
                )
              )}

              {/* Slash command popup */}
              {slashOpen && slashShortcuts.length > 0 && (
                <div className="max-w-4xl mx-auto w-full mb-1">
                  <div className="bg-card border border-border/40 rounded-xl shadow-xl overflow-hidden">
                    <div className="px-3 py-1.5 border-b border-border/20 flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Atajos</span>
                      <span className="text-[10px] text-muted-foreground/50">↑↓ navegar · Enter/Tab insertar · Esc cerrar</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {slashShortcuts.map((s, i) => (
                        <button
                          key={s.id}
                          className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors ${i === slashIndex ? "bg-primary/10 text-foreground" : "hover:bg-secondary/60 text-foreground/80"}`}
                          onMouseEnter={() => setSlashIndex(i)}
                          onMouseDown={(e) => { e.preventDefault(); insertShortcut(s.message); setSlashOpen(false); setTimeout(resizeTextarea, 0); }}
                        >
                          <span className="font-mono text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0 mt-0.5">/{s.trigger}</span>
                          <div className="min-w-0">
                            {s.title !== s.trigger && <p className="text-[11px] font-semibold truncate">{s.title}</p>}
                            <p className="text-[11px] text-muted-foreground truncate">{s.message}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Por donde va a salir lo que se escriba. Se pinta solo el canal sin
                  costo: el oficial es lo de siempre y no necesita cartel, y el
                  operador tiene que saberlo antes de escribir, no despues. */}
              {sinVentana && (
                <div className="max-w-4xl mx-auto w-full flex items-center gap-1.5 mb-1 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 flex-shrink-0" />
                  <span className="text-[10px] font-medium text-emerald-500">Sale por la API no oficial, sin costo</span>
                </div>
              )}

              <div className="flex items-end gap-3 max-w-4xl mx-auto relative group">
                <div className={`relative flex-1 bg-white/5 border border-white/10 ${puedeEnviar ? 'group-focus-within:border-primary/50 group-focus-within:bg-white/10' : 'opacity-40'} rounded-2xl flex items-end shadow-xl transition-all min-h-[48px] px-2`}>
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground shrink-0 rounded-full hover:bg-white/10 hover:text-white"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!puedeEnviar}
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                    )}
                  </Button>
                  <textarea
                    ref={msgTextareaRef}
                    defaultValue=""
                    onChange={(e) => {
                      const val = e.target.value;
                      // Actualizar botón enviar solo al cruzar el umbral vacío/no-vacío
                      const nowHasContent = val.trim().length > 0;
                      setHasContent(prev => prev !== nowHasContent ? nowHasContent : prev);
                      // Slash command: detectar /query en la posición del cursor (inicio o tras espacio)
                      const cursor = e.target.selectionStart ?? val.length;
                      const textBeforeCursor = val.slice(0, cursor);
                      const slashMatch = textBeforeCursor.match(/(?:^|\s)\/(\S*)$/);
                      if (slashMatch) {
                        const query = slashMatch[1].toLowerCase();
                        slashStartRef.current = textBeforeCursor.lastIndexOf('/');
                        const all = getShortcuts(companyId);
                        const matches = all.filter(s =>
                          s.trigger.startsWith(query) || s.title.toLowerCase().includes(query)
                        );
                        setSlashShortcuts(matches);
                        setSlashOpen(matches.length > 0);
                        setSlashIndex(0);
                      } else {
                        slashStartRef.current = -1;
                        setSlashOpen(false);
                      }
                    }}
                    placeholder={!puedeEnviar ? "Fuera de la ventana de 24 h de la API oficial" : selectedConv.is_agent_active ? "Inyectar comando (Pausa IA Automáticamente)..." : "Escribe un mensaje o / para atajos..."}
                    disabled={!puedeEnviar}
                    className="w-full bg-transparent border-0 focus:ring-0 focus:outline-none resize-none py-3.5 px-2 text-[13.5px] tracking-wide placeholder:text-muted-foreground/40 max-h-[240px] min-h-[48px] appearance-none"
                    rows={1}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${Math.min(target.scrollHeight, 240)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (slashOpen) {
                        if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex(i => Math.min(i + 1, slashShortcuts.length - 1)); return; }
                        if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex(i => Math.max(i - 1, 0)); return; }
                        if (e.key === "Escape") { e.preventDefault(); setSlashOpen(false); return; }
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          const s = slashShortcuts[slashIndex];
                          if (s) { insertShortcut(s.message); setSlashOpen(false); setTimeout(resizeTextarea, 0); }
                          return;
                        }
                        if (e.key === "Tab") {
                          e.preventDefault();
                          const s = slashShortcuts[slashIndex];
                          if (s) { insertShortcut(s.message); setSlashOpen(false); setTimeout(resizeTextarea, 0); }
                          return;
                        }
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={sendMessage}
                  disabled={!hasContent || !puedeEnviar || sending}
                  className="h-10 w-10 shrink-0 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.5)] transition-all disabled:opacity-50 disabled:shadow-none"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </Button>
              </div>
            </div>

            {networkPanelOpen && activeTicket?.onu_external_id && (
              <div className="absolute inset-0 z-30 bg-background flex flex-col">
                <OnuPanel
                  signal={networkSignal}
                  onuExternalId={activeTicket.onu_external_id}
                  puedeReiniciar={!ticketIsFinal}
                  onReiniciar={() => setRebootConfirmOpen(true)}
                  reiniciando={rebootingOnu}
                  onVolver={() => setNetworkPanelOpen(false)}
                />
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Panel Lateral de Gestión */}
      {/* Backdrop para panel móvil */}
      {selectedConv && showMobilePanel && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setShowMobilePanel(false)}
        />
      )}

      {selectedConv && (
        <div className={`tour-inbox-metadata ${showMobilePanel ? 'flex fixed right-0 top-0 h-full w-[85vw] max-w-[320px] z-50' : 'hidden lg:flex'} flex-col border-l border-border/30 bg-card flex-shrink-0 overflow-y-auto lg:relative lg:h-auto lg:w-[320px] lg:z-10`}>
          {/* Botón cerrar — solo visible en móvil */}
          <div className="lg:hidden flex justify-between items-center px-4 pt-3 pb-1">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Detalles del chat</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowMobilePanel(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* ── Tabs (solo con ticket activo, y nunca para un técnico) ── */}
          {activeTicket && !tecnicoDelChat && (
            <div className="flex border-b border-border/30 shrink-0 bg-muted/30">
              <button
                onClick={() => setRightPanelTab('caso')}
                className={`flex-1 py-3 text-[12px] font-bold uppercase tracking-wide transition-colors ${rightPanelTab === 'caso' ? 'text-primary border-b-2 border-primary bg-card' : 'text-foreground/50 hover:text-foreground/80 hover:bg-card/60'}`}
              >
                Cliente
              </button>
              <button
                onClick={() => setRightPanelTab('acciones')}
                className={`flex-1 py-3 text-[12px] font-bold uppercase tracking-wide transition-colors ${rightPanelTab === 'acciones' ? 'text-primary border-b-2 border-primary bg-card' : 'text-foreground/50 hover:text-foreground/80 hover:bg-card/60'}`}
              >
                Acciones
              </button>
              <button
                onClick={() => setRightPanelTab('agenda')}
                className={`flex-1 py-3 text-[12px] font-bold uppercase tracking-wide transition-colors ${rightPanelTab === 'agenda' ? 'text-primary border-b-2 border-primary bg-card' : 'text-foreground/50 hover:text-foreground/80 hover:bg-card/60'}`}
              >
                Agenda
              </button>
            </div>
          )}

          <div className="p-4 space-y-4 overflow-y-auto flex-1">

            {/*
              * El técnico tiene su propio panel.
              *
              * Antes veía la misma ficha de cliente que un caso de soporte: RUT,
              * plan contratado, motivo de la derivación. Nada de eso aplica a
              * alguien que trabaja acá, y encima el ticket lo empujaba a un flujo
              * de resolver y cerrar que no corresponde. Lo que sirve mientras se le
              * escribe es dónde está y qué le queda por hacer.
              */}
            {tecnicoDelChat && companyId ? (
              <PanelTecnico tecnico={tecnicoDelChat} companyId={companyId} />
            ) : activeTicket ? (
              <>
                {/* ══ TAB 1: CLIENTE ══ */}
                {rightPanelTab === 'caso' && (() => {
                  const t = activeTicket as any;
                  const isNuevo = t.customer_type === 'cliente_nuevo';
                  const addr = t.customer_address || clientAddress;
                  const InfoRow = ({ label, value, onCopy }: { label: string; value: string | null | undefined; onCopy?: () => void }) => (
                    <div className="flex justify-between items-start gap-2 group/field py-2.5 border-b border-border/20 last:border-0">
                      <span className="text-[12px] text-muted-foreground font-medium shrink-0">{label}</span>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[13px] text-foreground font-semibold text-right break-words leading-tight">{value || '—'}</span>
                        {value && onCopy && (
                          <button onClick={onCopy} className="opacity-0 group-hover/field:opacity-100 transition-opacity h-4 w-4 flex items-center justify-center rounded hover:bg-primary/10 text-muted-foreground hover:text-primary shrink-0">
                            <Copy className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                  const CATEGORIAS: Record<string, string> = {
                    soporte_tecnico: "Soporte Técnico",
                    ventas: "Ventas",
                    pagos: "Pagos",
                    consulta_comercial: "Consulta Comercial",
                  };
                  /*
                   * Una fila editable.
                   *
                   * Es una función y no un componente a propósito: declarado acá
                   * dentro, un <Campo/> sería un tipo nuevo en cada render y React
                   * desmontaría el input en cada tecla, perdiendo el foco. Llamarla
                   * devuelve los elementos directo al árbol del padre y eso no pasa.
                   */
                  const campoEdit = (label: string, campo: string, placeholder?: string) => (
                    <div key={campo} className="flex justify-between items-center gap-2 py-1.5 border-b border-border/20">
                      <span className="text-[12px] text-muted-foreground font-medium shrink-0">{label}</span>
                      <input
                        value={borradorCliente[campo] ?? ''}
                        onChange={(e) => setBorradorCliente(prev => ({ ...prev, [campo]: e.target.value }))}
                        placeholder={placeholder}
                        className="flex-1 min-w-0 text-[13px] font-semibold text-right bg-background/60 border border-border/40 rounded-lg px-2 py-1 placeholder:font-normal placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 transition-colors"
                      />
                    </div>
                  );
                  return (
                    <div className="space-y-4">
                      {/* ── Información del cliente ── */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-primary" />
                            {isNuevo ? 'Cliente Nuevo' : 'Información del cliente'}
                          </h4>
                          {t.customer_type && (
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${isNuevo ? 'bg-emerald-500/15 text-emerald-500' : 'bg-blue-500/15 text-blue-500'}`}>
                              {isNuevo ? 'Nuevo' : 'Cliente'}
                            </span>
                          )}
                          {/* Corregir a mano lo que la IA recopiló mal. Sale acá y no
                              en Acciones porque se decide mirando la ficha. */}
                          <button
                            onClick={() => editandoCliente ? setEditandoCliente(false) : abrirEdicionCliente()}
                            title={editandoCliente ? 'Cancelar edición' : 'Editar datos del cliente'}
                            className={`h-6 w-6 flex items-center justify-center rounded-lg transition-colors ${editandoCliente ? 'bg-primary/10 text-primary' : 'text-muted-foreground/45 hover:text-primary hover:bg-primary/10'}`}
                          >
                            {editandoCliente ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3 h-3" />}
                          </button>
                        </div>
                        <div className="rounded-2xl bg-muted/40 border border-border/30 px-3 py-1">
                          {editandoCliente ? (
                            <>
                              {campoEdit('Nombre', 'customer_name')}
                              {isNuevo ? (
                                <>
                                  {campoEdit('Correo', 'customer_email')}
                                  {campoEdit('Plan a contratar', 'customer_plan')}
                                  {campoEdit('Dirección', 'customer_address', 'Calle, número, comuna')}
                                  {campoEdit('RUT', 'customer_rut', '12.345.678-9')}
                                  {campoEdit('N° de TV', 'customer_tv_count')}
                                </>
                              ) : (
                                <>
                                  {campoEdit('RUT', 'customer_rut', '12.345.678-9')}
                                  {campoEdit('Dirección', 'customer_address', 'Calle, número, comuna')}
                                  {campoEdit('Plan', 'customer_plan')}
                                </>
                              )}
                              {/* Categoría */}
                              <div className="flex justify-between items-center gap-2 py-1.5 border-b border-border/20">
                                <span className="text-[12px] text-muted-foreground font-medium shrink-0">Categoría</span>
                                <select
                                  value={borradorCliente.category ?? ''}
                                  onChange={(e) => setBorradorCliente(prev => ({ ...prev, category: e.target.value }))}
                                  className="text-[12px] font-semibold bg-background/60 border border-border/40 rounded-lg px-2 py-1 focus:outline-none focus:border-primary/60 transition-colors"
                                >
                                  <option value="">General</option>
                                  {Object.entries(CATEGORIAS).map(([clave, nombre]) => (
                                    <option key={clave} value={clave}>{nombre}</option>
                                  ))}
                                  {/* Si el ticket trae una categoría que no está en la
                                      lista, se agrega: abrir el editor no puede ser la
                                      forma de perder un dato sin darse cuenta. */}
                                  {borradorCliente.category && !CATEGORIAS[borradorCliente.category] && (
                                    <option value={borradorCliente.category}>{borradorCliente.category}</option>
                                  )}
                                </select>
                              </div>
                              {/* Motivo */}
                              <div className="py-2 space-y-1.5">
                                <span className="text-[12px] text-muted-foreground font-medium block">Motivo</span>
                                <textarea
                                  rows={5}
                                  value={borradorCliente.description ?? ''}
                                  onChange={(e) => setBorradorCliente(prev => ({ ...prev, description: e.target.value }))}
                                  className="w-full text-[13px] text-foreground leading-relaxed bg-background/60 border border-border/40 rounded-lg px-2 py-1.5 resize-y focus:outline-none focus:border-primary/60 transition-colors"
                                />
                              </div>
                              <div className="flex gap-2 pb-2.5">
                                <Button
                                  size="sm"
                                  onClick={guardarDatosCliente}
                                  disabled={guardandoCliente}
                                  className="flex-1 h-8 text-[11px] font-bold"
                                >
                                  {guardandoCliente ? 'Guardando...' : 'Guardar'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditandoCliente(false)}
                                  disabled={guardandoCliente}
                                  className="h-8 text-[11px] font-semibold"
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                            <InfoRow label="Nombre" value={t.customer_name} onCopy={() => { navigator.clipboard.writeText(t.customer_name); toast({ title: 'Nombre copiado' }); }} />
                            {isNuevo ? (
                              <>
                                <InfoRow label="Correo" value={t.customer_email} onCopy={() => { navigator.clipboard.writeText(t.customer_email); toast({ title: 'Correo copiado' }); }} />
                                <InfoRow label="Plan a contratar" value={t.customer_plan} />
                                <InfoRow label="Dirección" value={addr} onCopy={addr ? () => { navigator.clipboard.writeText(addr); toast({ title: 'Dirección copiada' }); } : undefined} />
                                <InfoRow label="RUT" value={t.customer_rut} onCopy={t.customer_rut ? () => { navigator.clipboard.writeText(t.customer_rut); toast({ title: 'RUT copiado' }); } : undefined} />
                                <InfoRow label="N° de TV" value={t.customer_tv_count != null ? String(t.customer_tv_count) : null} />
                              </>
                            ) : (
                              <>
                                <InfoRow label="RUT" value={t.customer_rut} onCopy={t.customer_rut ? () => { navigator.clipboard.writeText(t.customer_rut); toast({ title: 'RUT copiado' }); } : undefined} />
                                <InfoRow label="Dirección" value={addr} onCopy={addr ? () => { navigator.clipboard.writeText(addr); toast({ title: 'Dirección copiada' }); } : undefined} />
                                <InfoRow label="Plan" value={t.customer_plan} />
                              </>
                            )}
                            {/* Categoría */}
                            <div className="flex justify-between items-center py-2.5 border-b border-border/20">
                              <span className="text-[12px] text-muted-foreground font-medium">Categoría</span>
                              <Badge variant="outline" className="text-[11px] font-semibold">
                                {CATEGORIAS[t.category as string] || t.category || 'General'}
                              </Badge>
                            </div>
                            {/* IA */}
                            <div className="flex items-center justify-between py-2.5 border-b border-border/20">
                              <span className="text-[12px] text-muted-foreground font-medium flex items-center gap-2">
                                <Bot className="w-3.5 h-3.5" /> IA
                              </span>
                              {/*
                                * Con ticket abierto la IA esta apagada, sin consultar
                                * la columna.
                                *
                                * Esta ficha solo se dibuja cuando hay ticket activo, y
                                * crear el ticket es justamente lo que apaga al agente,
                                * asi que aca no existe el caso contrario. La columna
                                * `is_agent_active` no sirve de fuente: cuando deriva
                                * n8n, el ticket se crea pero la columna recien se
                                * actualiza si el cliente vuelve a escribir, y mientras
                                * tanto esto decia "Activada" sobre un caso ya tomado.
                                */}
                              <span className="text-[10px] font-bold tracking-widest flex items-center gap-1.5 text-muted-foreground/50">
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                                Apagada
                              </span>
                            </div>
                            {/* Motivo */}
                            <div className="py-2.5 space-y-1.5">
                              <span className="text-[12px] text-muted-foreground font-medium block">Motivo</span>
                              <p className={`text-[13px] text-foreground leading-relaxed break-words ${motivoExpanded ? '' : 'line-clamp-3'}`}>
                                {t.description || '—'}
                              </p>
                              {t.description && t.description.length > 80 && (
                                <button onClick={() => setMotivoExpanded(v => !v)} className="text-[9px] text-primary/60 hover:text-primary transition-colors font-medium">
                                  {motivoExpanded ? '▲ Ver menos' : '▼ Ver más'}
                                </button>
                              )}
                            </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* ── Cita agendada ── */}
                      {clientNextAppt && (
                        <button
                          onClick={() => setRightPanelTab('agenda')}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-violet-500/30 bg-violet-500/8 text-left hover:bg-violet-500/14 transition-colors"
                        >
                          <CalendarClock className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest leading-none mb-0.5">
                              Cita agendada
                            </p>
                            <p className="text-[12px] font-semibold truncate">{clientNextAppt.service_type}</p>
                            <p className="text-[10px] text-muted-foreground/70 capitalize">
                              {format(parseISO(clientNextAppt.start_datetime), "EEE d MMM 'a las' HH:mm", { locale: es })}
                              {clientNextAppt.technician?.name && (
                                <span className="text-muted-foreground/50"> · {clientNextAppt.technician.name}</span>
                              )}
                            </p>
                          </div>
                        </button>
                      )}

                      {/* ── Estado del ticket ── */}
                      <div className="space-y-2">
                        <h4 className="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-2 px-1">
                          <div className="w-1 h-1 rounded-full bg-primary" />
                          Estado del Ticket
                        </h4>
                        <Select
                          value={activeTicket.status || 'abierto'}
                          onValueChange={async (newStatus) => {
                            if (!activeTicket) return;
                            const isFinal = ticketLabels.find(l => l.key === newStatus)?.is_final === true;
                            if (isFinal) { handleCloseChat(newStatus); return; }
                            const { error } = await supabase.functions.invoke("close-ticket", { body: { ticket_id: activeTicket.id, status: newStatus } });
                            if (error) { toast({ title: "Error al actualizar", description: error.message, variant: "destructive" }); return; }
                            setActiveTicket((prev: any) => prev ? { ...prev, status: newStatus } : null);
                            if (selectedConv) setTicketStatusByConvId(prev => ({ ...prev, [selectedConv.id]: newStatus }));
                            toast({ title: "✅ Estado actualizado", description: `Ticket: ${ticketLabels.find(l => l.key === newStatus)?.name || newStatus}` });
                            setTimeout(() => loadConversations(), 100);
                          }}
                        >
                          <SelectTrigger className="h-9 text-[11px] font-medium bg-background/50 border-input">
                            <SelectValue placeholder="Cambiar estado..." />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Sin "Técnicos": dejó de ser un estado por el que pase un caso. */}
                            {ticketLabels.filter(l => !esEtiquetaTecnicos(l)).map(label => (
                              <SelectItem key={label.key} value={label.key}>
                                <span className="font-bold flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: label.color }} />
                                  {label.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* ── Nota del caso ── */}
                      <div className="space-y-2">
                        <h4 className="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-2 px-1">
                          <div className="w-1 h-1 rounded-full bg-primary" />
                          Nota del caso
                        </h4>
                        <textarea
                          value={noteInput}
                          onChange={e => setNoteInput(e.target.value)}
                          placeholder="Escribe una nota interna sobre este caso..."
                          className="w-full bg-background border border-border/50 rounded-lg px-3 py-2.5 text-[13px] resize-none min-h-[80px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                          rows={3}
                        />
                        <Button onClick={saveNote} disabled={savingNote} size="sm" variant="outline" className="w-full h-9 text-[12px] font-bold uppercase tracking-wide gap-1.5">
                          {savingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <StickyNote className="w-3 h-3" />}
                          Guardar nota
                        </Button>
                        <div className="flex items-center justify-between px-1 pt-1">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <Flame className={`w-3.5 h-3.5 transition-colors ${selectedConv.priority === 'alta' ? 'text-amber-500' : 'text-muted-foreground/40'}`} />
                            <span className="text-[12px] font-semibold text-muted-foreground">Alta prioridad</span>
                          </label>
                          <button type="button" role="switch" aria-checked={selectedConv.priority === 'alta'} onClick={() => handleToggleHighPriority(selectedConv.priority !== 'alta')} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${selectedConv.priority === 'alta' ? 'bg-amber-500' : 'bg-muted-foreground/20'}`}>
                            <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${selectedConv.priority === 'alta' ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ══ TAB 3: AGENDA ══ */}
                {rightPanelTab === 'agenda' && companyId && userId && (
                  <Suspense fallback={<div className="flex justify-center py-8"><span className="w-5 h-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /></div>}>
                    <ScheduleTab
                      companyId={companyId}
                      userId={userId}
                      clientPhone={activeTicket?.customer_phone || selectedConv?.wa_id}
                      clientName={activeTicket?.customer_name || undefined}
                      clientRut={activeTicket?.customer_rut || undefined}
                      clientAddress={(activeTicket as any)?.customer_address || undefined}
                      conversationId={selectedConv?.id}
                      ticketId={activeTicket?.id}
                      /* La nota del caso baja a "Notas para el tecnico": es lo que
                         el operador ya escribio sobre este caso, y tenerlo que
                         copiar a mano era la parte que nadie hacia. */
                      caseNote={noteInput || (selectedConv ? convNotes[selectedConv.id] : '') || ''}
                      onOpenFullSchedule={onNavigateToSchedule}
                    />
                  </Suspense>
                )}

                {/* ══ TAB 2: ACCIONES ══ */}
                {rightPanelTab === 'acciones' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-2 px-1">
                        <div className="w-1 h-1 rounded-full bg-primary" /> Ejecución Rápida
                      </h4>
                      <div className="space-y-2">
                        <Button onClick={() => setIsTicketModalOpen(true)} className="w-full justify-center text-[11px] h-10 gap-2.5 rounded-xl shadow-[0_0_15px_rgba(var(--primary),0.3)] bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wider transition-all hover:scale-[1.02]" variant="default">
                          <Ticket className="w-3.5 h-3.5" /> Escalar a Ticket Central
                        </Button>
                        {!selectedConv.taken_by && (
                          <Button onClick={handleTakeCase} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 font-bold uppercase tracking-wider" variant="outline">
                            <Hand className="w-3.5 h-3.5" /> Tomar Caso
                          </Button>
                        )}
                        {selectedConv.is_agent_active ? (
                          <Button onClick={() => handleToggleBot(false)} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-input bg-background/50 hover:bg-accent hover:text-accent-foreground font-bold uppercase tracking-wider text-foreground shadow-sm transition-all" variant="ghost">
                            <User className="w-3.5 h-3.5" /> Intervenir
                          </Button>
                        ) : (
                          <Button onClick={() => handleToggleBot(true)} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-violet-500/30 text-violet-500 dark:text-violet-400 hover:bg-violet-500/10 font-bold uppercase tracking-wider" variant="outline">
                            <Bot className="w-3.5 h-3.5" /> Activar IA
                          </Button>
                        )}
                        <Button onClick={() => setIsTransferModalOpen(true)} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-blue-500/30 text-blue-500 hover:bg-blue-500/10 font-bold uppercase tracking-wider" variant="outline">
                          <Forward className="w-3.5 h-3.5" /> Transferir Chat
                        </Button>
                        <Button onClick={() => setReportModalOpen(true)} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-orange-500/30 text-orange-500 hover:bg-orange-500/10 font-bold uppercase tracking-wider" variant="outline">
                          ⚠️ Reportar Error IA
                        </Button>
                        <Button onClick={() => setInfoClientModalOpen(true)} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-cyan-500/30 text-cyan-500 hover:bg-cyan-500/10 font-bold uppercase tracking-wider" variant="outline">
                          <RefreshCw className="w-3.5 h-3.5" /> Actualizar Info Cliente
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2 border-t border-border/10 pt-2">
                      <h4 className="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-2 px-1">
                        <div className="w-1 h-1 rounded-full bg-primary" /> Buscador de Tickets
                      </h4>
                      <CustomerTicketsSearch key={activeTicket?.id || 'empty'} defaultRut={activeTicket?.customer_rut || ""} companyId={companyId} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* ══ SIN TICKET: solo acciones ══ */
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-2 px-1">
                    <div className="w-1 h-1 rounded-full bg-primary" /> Ejecución Rápida
                  </h4>
                  <div className="space-y-2">
                    <Button onClick={() => setIsTicketModalOpen(true)} className="w-full justify-center text-[11px] h-10 gap-2.5 rounded-xl shadow-[0_0_15px_rgba(var(--primary),0.3)] bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wider transition-all hover:scale-[1.02]" variant="default">
                      <Ticket className="w-3.5 h-3.5" /> Escalar a Ticket Central
                    </Button>
                    {!selectedConv.taken_by && (
                      <Button onClick={handleTakeCase} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 font-bold uppercase tracking-wider" variant="outline">
                        <Hand className="w-3.5 h-3.5" /> Tomar Caso
                      </Button>
                    )}
                    {selectedConv.is_agent_active ? (
                      <Button onClick={() => handleToggleBot(false)} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-input bg-background/50 hover:bg-accent hover:text-accent-foreground font-bold uppercase tracking-wider text-foreground shadow-sm transition-all" variant="ghost">
                        <User className="w-3.5 h-3.5" /> Intervenir
                      </Button>
                    ) : (
                      <Button onClick={() => handleToggleBot(true)} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-violet-500/30 text-violet-500 dark:text-violet-400 hover:bg-violet-500/10 font-bold uppercase tracking-wider" variant="outline">
                        <Bot className="w-3.5 h-3.5" /> Activar IA
                      </Button>
                    )}
                    <Button onClick={() => setIsTransferModalOpen(true)} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-blue-500/30 text-blue-500 hover:bg-blue-500/10 font-bold uppercase tracking-wider" variant="outline">
                      <Forward className="w-3.5 h-3.5" /> Transferir Chat
                    </Button>
                    <Button onClick={() => setReportModalOpen(true)} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-orange-500/30 text-orange-500 hover:bg-orange-500/10 font-bold uppercase tracking-wider" variant="outline">
                      ⚠️ Reportar Error IA
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 border-t border-border/10 pt-2">
                  <h4 className="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-2 px-1">
                    <div className="w-1 h-1 rounded-full bg-primary" /> Buscador de Tickets
                  </h4>
                  <CustomerTicketsSearch key="no-ticket" defaultRut="" companyId={companyId} />
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Tooltip flotante de nota (position:fixed, escapa overflow:hidden del sidebar) ── */}
      {/*
       * Mientras la fila real no llega se muestra el recorte de 100 caracteres, que
       * es lo que ya había: el globo nunca aparece vacío y después se completa.
       */}
      <VistaPreviaChat
        nota={tooltipConvId ? convNotes[tooltipConvId] : null}
        mensaje={tooltipConvId
          ? ultimosMensajes[tooltipConvId]?.texto
            ?? conversations.find(c => c.id === tooltipConvId)?.last_message_preview
            ?? null
          : null}
        quien={tooltipConvId ? ultimosMensajes[tooltipConvId]?.quien ?? null : null}
        rect={tooltipConvId ? tooltipRect : null}
      />

      {selectedConv && (
        <CreateTicketDialog
          open={isTicketModalOpen}
          onOpenChange={(op) => {
            setIsTicketModalOpen(op);
            if (!op) setTicketRefreshCounter(c => c + 1);
          }}
          conversation={selectedConv}
        />
      )}

      {/* Editar un mensaje ya enviado. Sólo texto y sólo canal sin costo: la API
          oficial no permite tocar un mensaje entregado. */}
      <Dialog open={!!mensajeEditando} onOpenChange={(op) => { if (!op && !guardandoEdicion) setMensajeEditando(null); }}>
        <DialogContent className="border-border/30 bg-card" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Editar mensaje</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            <Textarea
              value={textoEdicion}
              onChange={e => setTextoEdicion(e.target.value)}
              className="resize-none min-h-[110px]"
              disabled={guardandoEdicion}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              WhatsApp deja editar hasta 15 minutos después del envío. El cliente ve el texto corregido.
            </p>
          </div>
          <DialogFooter className="mt-2 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMensajeEditando(null)} disabled={guardandoEdicion}>
              Cancelar
            </Button>
            <Button
              onClick={guardarEdicion}
              disabled={
                guardandoEdicion
                || !textoEdicion.trim()
                || textoEdicion.trim() === (mensajeEditando?.content ?? "").trim()
              }
            >
              {guardandoEdicion ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Borrar un mensaje: se confirma porque es irreversible del lado del cliente. */}
      <AlertDialog open={!!mensajeABorrar} onOpenChange={(op) => { if (!op && !borrando) setMensajeABorrar(null); }}>
        <AlertDialogContent className="border-border/30 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este mensaje?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará para el cliente en WhatsApp y no se puede deshacer. En el portal
              la burbuja queda marcada como eliminada, para que se sepa que ahí hubo un mensaje.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mensajeABorrar?.content && (
            <p className="text-[13px] bg-muted/50 border border-border/30 rounded-lg px-3 py-2 max-h-28 overflow-y-auto break-words">
              {mensajeABorrar.content}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarBorrado}
              disabled={borrando}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {borrando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* La sesión sin costo se cayó. No es un error del mensaje —el mismo texto sale
          bien por el oficial—, así que en vez de un error rojo se ofrece el reenvío. */}
      <AlertDialog open={!!reenvioOficial} onOpenChange={(op) => { if (!op) setReenvioOficial(null); }}>
        <AlertDialogContent className="border-border/30 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>El canal sin costo está desconectado</AlertDialogTitle>
            <AlertDialogDescription>
              La sesión de WhatsApp Web se cayó y hay que volver a escanear el QR.
              {reenvioOficial?.message
                ? " Tu mensaje quedó guardado en el campo de escritura."
                : " El archivo ya está subido y no hay que volver a adjuntarlo."}
              {" "}¿Lo envías por el canal oficial? Ese sí tiene costo, alrededor de $20.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {reenvioOficial?.message && (
            <p className="text-[13px] bg-muted/50 border border-border/30 rounded-lg px-3 py-2 max-h-28 overflow-y-auto break-words">
              {reenvioOficial.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Ahora no</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarReenvioOficial}>
              Enviar por el oficial
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quitarle el caso a alguien: se confirma para que sea deliberado. */}
      <AlertDialog open={!!arrebatoPendiente} onOpenChange={(op) => { if (!op) setArrebatoPendiente(null); }}>
        <AlertDialogContent className="border-border/30 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Tomar el caso de {arrebatoPendiente?.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Pasarás a ser el responsable de esta conversación. Se le avisará a{" "}
              {arrebatoPendiente?.nombre} que se lo quitaste — nadie pierde un caso en silencio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarArrebato} className="bg-amber-500 hover:bg-amber-600 text-white">
              Tomarlo igual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transferir a una persona (distinto de transferir a un departamento). */}
      {selectedConv && (
        <Dialog open={transferPersonaOpen} onOpenChange={setTransferPersonaOpen}>
          <DialogContent className="border-border/30 bg-card" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Transferir el caso a un compañero</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Destinatario</Label>
                <Select value={transferPersonaId} onValueChange={setTransferPersonaId}>
                  <SelectTrigger><SelectValue placeholder="Elige un operador" /></SelectTrigger>
                  <SelectContent>
                    {operadores.filter(o => o.user_id !== userId).map(o => (
                      <SelectItem key={o.user_id} value={o.user_id}>
                        {o.nombre}{o.rol ? ` · ${o.rol}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {operadores.length <= 1 && (
                  <p className="text-[11px] text-muted-foreground/60">
                    No hay otros operadores cargados en esta empresa.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Nota (opcional) — la ve el destinatario
                </Label>
                <Textarea
                  value={transferPersonaNota}
                  onChange={(e) => setTransferPersonaNota(e.target.value)}
                  placeholder="Cliente pidió hablar con ventas"
                  className="min-h-[72px] resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setTransferPersonaOpen(false)}>Cancelar</Button>
              <Button onClick={handleTransferirAPersona} disabled={!transferPersonaId || casoOcupado}>
                {casoOcupado ? <Loader2 className="w-4 h-4 animate-spin" /> : "Transferir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {selectedConv && (
        <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
          <DialogContent className="border-border/30 bg-card" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Transferir Conversación</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Select value={transferRole} onValueChange={setTransferRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar sector..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="soporte_tecnico">Soporte Técnico</SelectItem>
                  <SelectItem value="ventas">Ventas</SelectItem>
                  <SelectItem value="pagos">Pagos</SelectItem>
                  <SelectItem value="consulta_comercial">Consulta Comercial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTransferModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleTransferChat} className="bg-blue-600 hover:bg-blue-700">Transferir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/*
        * La misma pregunta que en Rendimiento de IA, no una copia.
        *
        * Si fueran dos, cualquier cambio de criterio habría que hacerlo dos veces
        * y tarde o temprano una de las dos quedaría distinta.
        */}
      <DialogoVeredicto
        conv={veredictoPendiente
          ? ({ id: veredictoPendiente.analysisId, bot_score: veredictoPendiente.nota } as any)
          : null}
        guardando={guardandoVeredicto}
        onCerrar={() => setVeredictoPendiente(null)}
        onGuardar={guardarVeredictoYCerrar}
      />

      {selectedConv && (
        <Dialog open={isCloseModalOpen} onOpenChange={isGeneratingSummary ? undefined : setIsCloseModalOpen}>
          <DialogContent className="border-border/30 bg-card max-w-md" aria-describedby={undefined}>
            {isGeneratingSummary ? (
              <div className="flex flex-col items-center justify-center p-6 space-y-4">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <DialogTitle className="text-center text-lg">Generando resumen del caso...</DialogTitle>
                <p className="text-sm text-muted-foreground text-center">Analizando el historial con IA. Esto puede tomar hasta 30 segundos.</p>
              </div>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Gestión del Caso — {closeSummaryData?.customer_name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">RUT Asociado</span>
                    <p className="text-sm font-medium">{closeSummaryData?.rut}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Resumen de Cierre</span>
                    <Textarea
                      key={closeSummaryKey}
                      ref={closeSummaryRef}
                      defaultValue={closeSummaryText}
                      placeholder="Escribe un resumen o diagnóstico del caso..."
                      className="min-h-[120px] text-sm resize-none"
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0 mt-4">
                  <Button variant="outline" onClick={() => setIsCloseModalOpen(false)} disabled={sending}>Cancelar</Button>
                  <Button onClick={handleConfirmClose} disabled={sending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Confirmar y Cerrar
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={reportModalOpen} onOpenChange={setReportModalOpen}>
        <DialogContent className="border-border/30 bg-card" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Reportar Error del Agente IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Tipo de error</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="informacion_incorrecta">Información incorrecta</SelectItem>
                  <SelectItem value="no_entendio">No entendió al cliente</SelectItem>
                  <SelectItem value="derivo_mal">Derivó mal el caso</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>¿Qué respondió mal el agente?</Label>
              <Textarea 
                value={reportWrong} 
                onChange={e => setReportWrong(e.target.value)} 
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>¿Qué debería haber respondido?</Label>
              <Textarea 
                value={reportExpected} 
                onChange={e => setReportExpected(e.target.value)} 
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReportModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmitReport} className="bg-orange-500 hover:bg-orange-600 text-white">
              Enviar Reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ACTUALIZAR INFO CLIENTE ─────────────────────────────────────────── */}
      <Dialog
        open={infoClientModalOpen}
        onOpenChange={open => {
          setInfoClientModalOpen(open);
          if (!open) { setInfoClientRut(""); setInfoClientRutError(""); }
        }}
      >
        <DialogContent className="border-border/30 bg-card sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="w-4 h-4 text-cyan-500" />
              Actualizar Información del Cliente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="info-rut" className="text-sm font-semibold">
                RUT del cliente <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="info-rut"
                  placeholder="Ej: 12345678-9"
                  value={infoClientRut}
                  onChange={e => {
                    const formatted = formatRutInput(e.target.value);
                    setInfoClientRut(formatted);
                    // Validar en tiempo real una vez que tenga longitud mínima
                    if (formatted.replace(/[^0-9kK]/g, '').length >= 8) {
                      setInfoClientRutError(isRutValid(formatted) ? "" : "RUT inválido — verifica los dígitos.");
                    } else {
                      setInfoClientRutError("");
                    }
                  }}
                  className={`h-10 pr-8 text-[14px] font-mono tracking-wider ${infoClientRutError ? 'border-destructive focus-visible:ring-destructive' : infoClientRut && isRutValid(infoClientRut) ? 'border-emerald-500 focus-visible:ring-emerald-500' : ''}`}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) handleInfoClient(); }}
                  autoFocus
                  maxLength={11}
                />
                {/* Indicador válido/inválido */}
                {infoClientRut.length > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold select-none">
                    {isRutValid(infoClientRut)
                      ? <span className="text-emerald-500">✓</span>
                      : <span className="text-destructive">✗</span>
                    }
                  </span>
                )}
              </div>
              {infoClientRutError && (
                <p className="text-[12px] text-destructive font-medium">{infoClientRutError}</p>
              )}
              <p className="text-[11px] text-foreground/50">Formato: 12345678-9 · Sin puntos, con guion</p>
            </div>
          </div>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setInfoClientModalOpen(false)}
              disabled={infoClientLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleInfoClient}
              disabled={infoClientLoading || !infoClientRut.trim() || !isRutValid(infoClientRut)}
              className="bg-cyan-500 hover:bg-cyan-600 text-white gap-2"
            >
              {infoClientLoading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Actualizando...</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Actualizar datos</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SELECTOR DE PLANTILLA ────────────────────────────────────────────── */}
      <Dialog open={showTemplateSelector} onOpenChange={setShowTemplateSelector}>
        <DialogContent className="border-border/30 bg-card max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold">📋 Seleccionar plantilla de respuesta</DialogTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Esta plantilla se usará cuando la ventana de 24 h esté cerrada. Puedes cambiarla cuando quieras.
            </p>
          </DialogHeader>
          <div className="relative my-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
            <Input
              placeholder="Buscar plantilla..."
              value={templateSearch}
              onChange={e => setTemplateSearch(e.target.value)}
              className="pl-8 h-8 text-[12px]"
            />
          </div>
          <ScrollArea className="h-72">
            {loadingTemplates ? (
              <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-[12px]">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando plantillas...
              </div>
            ) : templates.length === 0 ? (
              <p className="text-center text-muted-foreground text-[12px] py-8">No se encontraron plantillas aprobadas.</p>
            ) : (
              <div className="space-y-1.5 pr-2">
                {templates
                  .filter(t =>
                    !templateSearch ||
                    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                    getTemplatePreview(t).toLowerCase().includes(templateSearch.toLowerCase())
                  )
                  .map(tpl => (
                    <button
                      key={tpl.name}
                      onClick={() => handleSelectTemplate(tpl)}
                      className={`w-full text-left p-3 rounded-lg border transition-all hover:border-primary/50 hover:bg-primary/5 ${
                        selectedTemplate?.name === tpl.name ? "border-primary/60 bg-primary/10" : "border-border/30 bg-background/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-semibold text-foreground">{tpl.name}</span>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5">{tpl.language}</Badge>
                          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 capitalize">{tpl.category?.toLowerCase()}</Badge>
                        </div>
                      </div>
                      {getTemplatePreview(tpl) && (
                        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{getTemplatePreview(tpl)}</p>
                      )}
                    </button>
                  ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowTemplateSelector(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── FORMULARIO DE VARIABLES ──────────────────────────────────────────── */}
      <Dialog open={showVarForm} onOpenChange={setShowVarForm}>
        <DialogContent className="border-border/30 bg-card max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              📋 Completar variables — <span className="text-primary">{selectedTemplate?.name}</span>
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">Completa los campos antes de enviar la plantilla.</p>
          </DialogHeader>
          <div className="space-y-4 my-2">
            {templateVars.map(v => {
              const key = `${v.componentType}_${v.varName}`;
              const highlighted = v.contextText.replace(
                new RegExp(`\\{\\{${v.varName}\\}\\}`, "g"), "▶ aquí ◀"
              );
              // Si el nombre es un número puro → "Parámetro 1", si es texto → mostrar el nombre
              const isNumeric = /^\d+$/.test(v.varName);
              const labelName = isNumeric
                ? `Parámetro ${v.varName}`
                : v.varName.replace(/_/g, " ");
              return (
                <div key={key} className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {v.componentType === "header" ? "Encabezado" : "Cuerpo"} · {labelName}
                  </Label>
                  <p className="text-[10px] text-muted-foreground/70 italic leading-snug line-clamp-2">"{highlighted}"</p>
                  <Textarea
                    placeholder={`Valor para {{${v.varName}}}`}
                    value={templateVarValues[key] || ""}
                    onChange={e => setTemplateVarValues(prev => ({ ...prev, [key]: e.target.value.slice(0, 750) }))}
                    className="text-[12px] min-h-[80px] resize-y"
                    maxLength={750}
                  />
                  <p className={`text-[10px] text-right ${(templateVarValues[key]?.length || 0) >= 700 ? "text-amber-400" : "text-muted-foreground/50"}`}>
                    {templateVarValues[key]?.length || 0}/750
                  </p>
                </div>
              );
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowVarForm(false)}>Cancelar</Button>
            <Button
              size="sm"
              onClick={() => doSendTemplate(templateVarValues, templateVars)}
              disabled={sendingTemplate || templateVars.some(v => !templateVarValues[`${v.componentType}_${v.varName}`]?.trim())}
              className="gap-1.5"
            >
              {sendingTemplate ? <Loader2 className="w-3 h-3 animate-spin" /> : "📤"}
              Enviar plantilla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── NUEVA CONVERSACIÓN OUTBOUND ─────────────────────────────────────── */}
      <Dialog open={newConvOpen} onOpenChange={o => { if (!newConvSending) setNewConvOpen(o); }}>
        <DialogContent className="border-border/30 bg-card max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <MessageSquarePlus className="w-4 h-4 text-primary" />
              Iniciar nueva conversación
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Ingresa el número de WhatsApp y selecciona una plantilla aprobada para iniciar el contacto.
            </p>
          </DialogHeader>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Número de WhatsApp</label>
            <div className="flex gap-1.5">
              <Select value={newConvCountryCode} onValueChange={setNewConvCountryCode} disabled={newConvSending}>
                <SelectTrigger className="h-9 w-[110px] flex-shrink-0 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEW_CONV_COUNTRY_CODES.map(c => (
                    <SelectItem key={c.code} value={c.code} className="text-[12px]">
                      {c.flag} {c.code} <span className="text-muted-foreground/60">{c.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="912345678"
                value={newConvPhone}
                onChange={e => setNewConvPhone(e.target.value.replace(/[^\d\s]/g, ''))}
                className="h-9 text-[13px] flex-1"
                disabled={newConvSending}
                type="tel"
              />
            </div>
            {newConvPhone.trim() && (
              <p className="text-[10px] text-muted-foreground/50 pl-1">
                Número completo: <span className="font-mono text-foreground/60">{newConvCountryCode}{newConvPhone.trim().replace(/\s/g, '')}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Plantilla</label>
            {newConvTpl ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-primary/40 bg-primary/5">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold truncate">{newConvTpl.name}</p>
                  <p className="text-[10px] text-muted-foreground/60 truncate">{getTemplatePreview(newConvTpl)}</p>
                </div>
                <button
                  onClick={() => { setNewConvTpl(null); setNewConvVars([]); setNewConvVarValues({}); }}
                  className="text-muted-foreground/50 hover:text-foreground"
                  disabled={newConvSending}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                  <Input
                    placeholder="Buscar plantilla..."
                    value={newConvSearch}
                    onChange={e => setNewConvSearch(e.target.value)}
                    className="pl-8 h-8 text-[12px]"
                    disabled={newConvSending}
                  />
                </div>
                <ScrollArea className="h-52 border border-border/30 rounded-lg">
                  {newConvLoadingTpls ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground text-[12px] py-8">
                      <Loader2 className="w-4 h-4 animate-spin" /> Cargando plantillas...
                    </div>
                  ) : newConvTemplates.length === 0 ? (
                    <p className="text-center text-muted-foreground text-[12px] py-8">No se encontraron plantillas.</p>
                  ) : (
                    <div className="space-y-1 p-2">
                      {newConvTemplates
                        .filter(t =>
                          !newConvSearch ||
                          t.name.toLowerCase().includes(newConvSearch.toLowerCase()) ||
                          getTemplatePreview(t).toLowerCase().includes(newConvSearch.toLowerCase())
                        )
                        .map(tpl => (
                          <button
                            key={tpl.name}
                            onClick={() => selectNewConvTemplate(tpl)}
                            className="w-full text-left p-2.5 rounded-lg border border-border/30 bg-background/50 hover:border-primary/50 hover:bg-primary/5 transition-all"
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[12px] font-semibold">{tpl.name}</span>
                              <div className="flex gap-1">
                                <Badge variant="outline" className="text-[9px] h-4 px-1.5">{tpl.language}</Badge>
                                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 capitalize">{tpl.category?.toLowerCase()}</Badge>
                              </div>
                            </div>
                            {getTemplatePreview(tpl) && (
                              <p className="text-[10px] text-muted-foreground/60 line-clamp-2">{getTemplatePreview(tpl)}</p>
                            )}
                          </button>
                        ))}
                    </div>
                  )}
                </ScrollArea>
              </>
            )}
          </div>

          {newConvTpl && newConvVars.length > 0 && (
            <div className="space-y-3">
              <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Variables de la plantilla</label>
              {newConvVars.map(v => {
                const key = `${v.componentType}_${v.varName}`;
                const isNumeric = /^\d+$/.test(v.varName);
                const labelName = isNumeric ? `Parámetro ${v.varName}` : v.varName.replace(/_/g, " ");
                return (
                  <div key={key} className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {v.componentType === "header" ? "Encabezado" : "Cuerpo"} · {labelName}
                    </label>
                    <Textarea
                      placeholder={`Escribe el valor para {{${v.varName}}}...`}
                      value={newConvVarValues[key] || ""}
                      onChange={e => setNewConvVarValues(prev => ({ ...prev, [key]: e.target.value.slice(0, 750) }))}
                      className="text-[12px] min-h-[60px] resize-y"
                      disabled={newConvSending}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Preview en tiempo real del mensaje */}
          {newConvTpl && (() => {
            const bodyComp = newConvTpl.components.find(c => c.type.toUpperCase() === 'BODY');
            if (!bodyComp?.text) return null;
            let preview = bodyComp.text;
            for (const v of newConvVars) {
              const key = `${v.componentType}_${v.varName}`;
              const val = newConvVarValues[key]?.trim() || `{{${v.varName}}}`;
              preview = preview.replace(new RegExp(`\\{\\{${v.varName}\\}\\}`, 'g'), val);
            }
            return (
              <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-1">
                <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">Vista previa del mensaje</p>
                <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-foreground/80">{preview}</p>
              </div>
            );
          })()}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setNewConvOpen(false)} disabled={newConvSending}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={doSendNewConv}
              disabled={
                newConvSending ||
                !newConvPhone.trim() ||
                !newConvTpl ||
                newConvVars.some(v => !newConvVarValues[`${v.componentType}_${v.varName}`]?.trim())
              }
              className="gap-1.5"
            >
              {newConvSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Enviar plantilla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Notificación in-app (mensajes nuevos con etiqueta) ─────────────── */}
      {inAppNotif && (
        <div
          className="fixed bottom-6 right-6 z-[9999] w-80 bg-card border border-border/30 rounded-2xl shadow-2xl overflow-hidden cursor-pointer"
          style={{ animation: 'slideInNotif 0.25s ease-out' }}
          onClick={() => {
            const conv = conversations.find(c => c.id === inAppNotif.convId);
            if (conv) {
              setSelectedConv(conv);
              selectedConvRef.current = conv.id;
              selectedWaIdRef.current = conv.wa_id;
            }
            if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
            setInAppNotif(null);
          }}
        >
          <div className="flex items-start gap-3 p-4">
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <MessageCircle className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm truncate">{inAppNotif.clientName}</span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                  style={{ backgroundColor: inAppNotif.labelColor + '28', color: inAppNotif.labelColor }}
                >
                  {inAppNotif.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{inAppNotif.preview || 'Nuevo mensaje'}</p>
            </div>
            <button
              className="text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5"
              onClick={(e) => {
                e.stopPropagation();
                if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
                setInAppNotif(null);
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-0.5 bg-primary/20">
            <div className="h-full bg-primary/50" style={{ animation: 'notifProgress 5s linear forwards' }} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInNotif {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes notifProgress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>

      <MediaLightbox media={lightbox} onClose={() => setLightbox(null)} />

      {/* Confirmación de reinicio de ONU — acción con impacto real (corta la conexión del cliente ~30-60s) */}
      <AlertDialog open={rebootConfirmOpen} onOpenChange={(open) => { if (!rebootingOnu) setRebootConfirmOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reiniciar la ONU de este cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Perderá conexión por ~30-60 segundos mientras el equipo se reinicia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rebootingOnu}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleRebootOnu(); }}
              disabled={rebootingOnu}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {rebootingOnu ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
              {rebootingOnu ? "Reiniciando..." : "Sí, reiniciar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
