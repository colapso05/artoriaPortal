import { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from "react";
const ScheduleTab = lazy(() => import("./schedule/ScheduleTab"));
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
  Calendar, CalendarCheck, RefreshCw,
} from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateTicketDialog } from "./CreateTicketDialog";
import { CustomerTicketsSearch } from "./CustomerTicketsSearch";

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

function StatusIcon({ status }: { status: string | null }) {
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

function MessageMedia({ message }: { message: Message }) {
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
        onClick={() => window.open(url, "_blank")}
        loading="lazy"
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
            onClick={() => window.open(url, "_blank")}
          >
            <Monitor className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  // Document/File Fallback
  const fileName = message.content && message.content.includes("📎 Archivo adjunto:") 
    ? message.content.split("📎 Archivo adjunto: ")[1]?.trim()
    : (url.split('/').pop()?.split('?')[0] || "Contenido Multimedia");

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition text-xs mb-1.5 border border-border/30 max-w-[240px]">
      <FileText className="w-5 h-5 shrink-0 text-primary" />
      <span className="underline truncate leading-snug font-medium text-blue-500 dark:text-blue-400">
        📎 Ver archivo ({fileName})
      </span>
    </a>
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
  isSimulating?: boolean;
  simulatedUserName?: string;
  onNavigateToSchedule?: () => void;
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
export default function WhatsAppInbox({ companyId, userId, userName, userRole, operatorRoles, initialConversationId, initialPhone, initialMessage, onConversationOpened, isSimulating, simulatedUserName, onNavigateToSchedule }: WhatsAppInboxProps) {
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
  const [chatFilter, setChatFilter] = useState<string>('all');
  const [ticketStatusByConvId, setTicketStatusByConvId] = useState<Record<string, string>>({});
  const [ticketLabels, setTicketLabels] = useState<Array<{key: string; name: string; color: string; is_initial?: boolean; is_final?: boolean}>>([
    { key: 'abierto', name: 'Abierto', color: '#22c55e', is_initial: true },
    { key: 'en_proceso', name: 'En Proceso', color: '#3b82f6' },
    { key: 'esperando_respuesta', name: 'Esperando Respuesta', color: '#f59e0b' },
    { key: 'resuelto', name: 'Resuelto', color: '#a855f7', is_final: true },
  ]);
  const [filterCounts, setFilterCounts] = useState<Array<{key: string; label: string; color: string; is_initial: boolean; is_final: boolean; total_convs: number; unread_convs: number}>>([]);
  const [filteredConvIds, setFilteredConvIds] = useState<Set<string> | null>(null);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferRole, setTransferRole] = useState("soporte_tecnico");
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [nocodbEnabled, setNocodbEnabled] = useState(false);
  const [outboundEnabled, setOutboundEnabled] = useState(true);
  const [bandejaTemplateId, setBandejaTemplateId] = useState<string | null>(null);
  const [outboundTemplateId, setOutboundTemplateId] = useState<string | null>(null);

  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [closeSummaryData, setCloseSummaryData] = useState<any>(null);
  const [closeSummaryText, setCloseSummaryText] = useState("");
  const [pendingCloseStatus, setPendingCloseStatus] = useState<string | null>(null);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportType, setReportType] = useState("informacion_incorrecta");

  // ── Actualizar Info Cliente ──
  const [infoClientModalOpen, setInfoClientModalOpen] = useState(false);
  const [infoClientRut, setInfoClientRut] = useState("");
  const [infoClientRutError, setInfoClientRutError] = useState("");
  const [infoClientMotivo, setInfoClientMotivo] = useState("");
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
      await fetch("https://bot.artoria.cl/webhook/InfoClientArtoria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId ?? null,
          ticket_id: activeTicket?.id ?? null,
          rut: rutTrimmed,
          reason: infoClientMotivo.trim() || undefined,
        }),
      });
      toast({ title: "✅ Solicitud enviada", description: "La información del cliente será actualizada en breve." });
      setInfoClientModalOpen(false);
      setInfoClientRut("");
      setInfoClientMotivo("");
      setInfoClientRutError("");
    } catch {
      toast({ title: "Error al enviar", description: "No se pudo conectar al servidor.", variant: "destructive" });
    } finally {
      setInfoClientLoading(false);
    }
  };
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const selectedConvRef = useRef<string | null>(null);
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

  // Debounced keyword search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      const normalize = (rows: any[]) =>
        rows.map(r => ({ ...r, id: r.id ?? r.conversation_id }));

      // 1. Always search the full phrase first (exact order)
      const { data: phraseData, error: phraseError } = await (supabase as any).rpc(
        'search_conversations_by_keyword',
        { p_company_id: companyId, p_keyword: searchTerm.trim() }
      );

      if (!phraseError && phraseData && (phraseData as any[]).length > 0) {
        setSearchResults(normalize(phraseData as any[]));
        return;
      }

      // 2. Fallback: search each significant word (≥4 chars) independently and merge results
      const words = searchTerm.toLowerCase().split(/\s+/).filter(t => t.length >= 4);
      if (words.length === 0) {
        // If no significant words exist, nothing useful to search
        setSearchResults([]);
        return;
      }

      const results = await Promise.all(
        words.map(word =>
          (supabase as any).rpc('search_conversations_by_keyword', {
            p_company_id: companyId,
            p_keyword: word
          })
        )
      );

      // Merge deduplicated results (conversation shown once, using first match_content)
      const merged = new Map<string, any>();
      results.forEach(({ data, error }: any) => {
        if (!error && data) {
          normalize(data as any[]).forEach((r: any) => {
            if (!merged.has(r.id)) merged.set(r.id, r);
          });
        }
      });

      setSearchResults(Array.from(merged.values()));
    }, 400);

    return () => clearTimeout(timer);
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
    loadConversations();
    const filter = companyId ? `company_id=eq.${companyId}` : undefined;
    const channel = supabase
      .channel(`conversations-realtime-${companyId || 'all'}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "conversations",
        ...(filter ? { filter } : {})
      }, () => debouncedLoadConversations())
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "tickets",
      }, (payload) => {
        debouncedLoadConversations();
        // Si el ticket pertenece a la conversación activa, refrescar activeTicket en tiempo real
        const convId = (payload.new as any)?.conversation_id;
        if (convId && convId === selectedConvRef.current) {
          setTicketRefreshCounter(c => c + 1);
        }
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
      }, (payload) => {
        setMessages((prev) => {
          // Evitar duplicados si ya fue cargado por el loadMessages posterior
          if (prev.find(m => m.id === payload.new.id)) return prev;
          // Reemplazar mensaje optimista si tiene el mismo contenido, dirección
          // y fue creado en los últimos 15 segundos (ventana de tolerancia)
          const withoutOptimistic = prev.filter(m => {
            if (!m.id.startsWith('opt-')) return true;
            const sameContent = m.content === payload.new.content;
            const sameDirection = m.direction === payload.new.direction;
            const closeInTime = Math.abs(
              new Date(m.created_at).getTime() - new Date(payload.new.created_at).getTime()
            ) < 15_000;
            return !(sameContent && sameDirection && closeInTime);
          });
          return [...withoutOptimistic, payload.new as Message];
        });

        setConversations(prev => prev.map(c =>
          c.id === payload.new.conversation_id
            ? { ...c, last_message_preview: payload.new.content, last_message_at: payload.new.created_at }
            : c
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
    if (selectedConv) {
      (async () => {
        const fetchFallbacks = async () => {
          const finalStatuses = new Set(['cerrado', ...ticketLabels.filter(l => l.is_final).map(l => l.key)]);
          
          // 1. Fallback primario: buscar por conversation_id
          const { data: byConv } = await supabase
            .from("tickets")
            .select("id, customer_rut, customer_name, customer_email, customer_address, customer_type, customer_plan, customer_tv_count, description, category, assigned_to, status")
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
            .select("id, customer_rut, customer_name, customer_email, customer_address, customer_type, customer_plan, customer_tv_count, description, category, assigned_to, status")
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
              .select("id, customer_rut, customer_name, customer_email, customer_address, customer_type, customer_plan, customer_tv_count, description, category, assigned_to, status")
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

  // ── Resetear secciones colapsables al cambiar de conversación ────────────────
  useEffect(() => {
    setClientInfoOpen(true);
    setTicketStatusOpen(false);
    setDerivedCaseOpen(false);
    setQuickActionsOpen(false);
    setTicketSearchOpen(false);
    setMotivoExpanded(false);
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
      // Usar service key para que funcione también con admin_isp simulando empresa
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
      const allTpls: WhatsAppTemplate[] = data?.templates || [];
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
      toast({ title: "Error al activar IA", description: err.message, variant: "destructive" });
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

    try {
      if (selectedConv.is_agent_active) {
        await handleToggleBot(false); // Auto intervenir
      }
      const { error } = await supabase.functions.invoke("ycloud-send", {
        body: {
          to: selectedConv.wa_id,
          message: text,
          conversationId: selectedConv.id,
          senderName: effectiveSenderName
        },
      });
      if (error) throw error;
    } catch (err: any) {
      // Revertir el mensaje optimista si el envío falló
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      if (msgTextareaRef.current) {
        msgTextareaRef.current.value = text;
        msgTextareaRef.current.style.height = "auto";
      }
      setHasContent(true);
      toast({ title: "Error al enviar", description: (err as any).message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleToggleBot = async (activate: boolean) => {
    if (!selectedConv) return;
    try {
      const action = activate ? 'activate_bot' : 'deactivate_bot';
      toast({ title: "Procesando...", description: activate ? "Activando agente IA..." : "Tomando control de la conversación..." });

      // Actualizar BD siempre, independiente del resultado de la edge function
      await supabase.from("conversations").update({
        is_agent_active: activate,
        assigned_user_id: activate ? null : userId
      }).eq("id", selectedConv.id);

      // Actualizar estado local inmediatamente (no esperar realtime)
      const newStatus = activate ? 'abierto' : 'en_progreso';
      const updatedConv = {
        ...selectedConv,
        is_agent_active: activate,
        status: newStatus as any,
        assigned_user_id: activate ? null : (userId || selectedConv.assigned_user_id)
      };
      setSelectedConv(updatedConv);
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? updatedConv : c));

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

  const handleTakeCase = async () => {
    if (!selectedConv) return;
    const { error } = await supabase
      .from("conversations")
      .update({ taken_by: userId, taken_at: new Date().toISOString() } as any)
      .eq("id", selectedConv.id);
    if (!error) {
      toast({ title: "Caso asignado", description: "Ahora eres el responsable de este ticket." });
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, taken_by: userId || null } : c));
      setSelectedConv(prev => prev ? { ...prev, taken_by: userId || null } : null);
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleTransferChat = async () => {
    if (!selectedConv) return;
    const { error } = await supabase
      .from("conversations")
      .update({ assigned_role: transferRole, taken_by: null, taken_at: null } as any)
      .eq("id", selectedConv.id);
    if (!error) {
      toast({ title: "Caso transferido", description: `Enviado al departamento: ${transferRole}` });
      setIsTransferModalOpen(false);
      setConversations(prev => prev.filter(c => c.id !== selectedConv.id));
      setSelectedConv(null);
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleCloseChat = async (statusOverride?: string) => {
    if (!selectedConv) return;
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
      
      if (tId && closeSummaryText.trim()) {
        const { error: noteError } = await supabase.from("ticket_notes").insert({
          ticket_id: tId,
          content: closeSummaryText,
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
        supabase.from('conversation_notes')
          .upsert({
            conversation_id: selectedConv.id,
            company_id: companyId,
            content: '',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'conversation_id' })
          .then(() => {
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

    return withHits.filter(c => {
      const matchesName = !searchTerm
        || c.profile_name?.toLowerCase().includes(q)
        || c.wa_id.includes(q)
        || words.some(t => c.profile_name?.toLowerCase().includes(t) || c.wa_id.includes(t));
      const matchesContent = !!c.match_content;

      if (!matchesName && !matchesContent) return false;
      if (searchTerm.trim() && matchesContent) return true;
      if (c.status === 'cerrado') return false;
      if (ticketStatus) return ticketStatusByConvId[c.id] === ticketStatus;
      return true;
    }).sort((a, b) =>
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );
  }, [conversations, searchTerm, searchResults, ticketStatusByConvId, chatFilter]);

  const getInitials = (name: string | null, waId: string) =>
    (name || waId).replace("+", "").slice(0, 2).toUpperCase();

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
  const puedeEnviar = horasDesdeUltimoMensaje <= 24;
  const horasRestantes = Math.max(0, 24 - horasDesdeUltimoMensaje);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv) return;
    
    if (!puedeEnviar) {
      toast({ title: "Envío Bloqueado", description: "Han pasado más de 24 horas desde el último mensaje del cliente.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const fileExt = file.name.split('.').pop();
      const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const filePath = `${selectedConv.id}/${uniqueName}`;

      const { error: uploadError } = await supabase.storage
        .from('whatsapp_media')
        .upload(filePath, file, { contentType: file.type });

      if (uploadError) throw new Error("Error al subir archivo: " + uploadError.message);

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

      const { error: sendError } = await supabase.functions.invoke("ycloud-send", {
        body: {
          to: selectedConv.wa_id,
          message: null,               // No text fallback — let YCloud handle it as pure media
          conversationId: selectedConv.id,
          mediaUrl: publicUrl,
          mediaType: ycloudType,
          senderName: effectiveSenderName,
        },
      });
      if (sendError) throw sendError;
      toast({ title: "Archivo Enviado", description: "El adjunto fue entregado al cliente." });
    } catch (err: any) {
      toast({ title: "Error al subir archivo", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Pre-compute badge counts once per render (O(n) instead of O(n×m)) ──
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
            {outboundEnabled && (
              <button
                onClick={() => openNewConvModal()}
                title="Iniciar nueva conversación"
                className="ml-auto flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center transition-colors"
              >
                <MessageSquarePlus className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
            <Input
              placeholder="Buscar chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9 bg-secondary/50 border-border/40 focus-visible:ring-1 text-[13px] rounded-lg shadow-sm"
            />
          </div>
          {/* ── Filtros unificados: Todos + etiquetas de ticket + Míos + Cerrados ── */}
          <div className="flex gap-1.5 flex-wrap">
            {/* Todos */}
            <button
              onClick={() => setChatFilter('all')}
              className={`relative flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full border transition-all ${chatFilter === 'all' ? 'bg-foreground text-background border-foreground shadow-sm' : 'text-muted-foreground bg-background/50 border-border/30 hover:text-foreground hover:border-border/60'}`}
            >
              Todos
              {allUnread > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-[8px] font-black text-white flex items-center justify-center">{allUnread}</span>
              )}
            </button>

            {/* Etiqueta de ticket como filtro (oculta las etiquetas finales como "Resuelto") */}
            {ticketLabels.filter(l => !l.is_final).map(label => {
              const filterKey = `ticket:${label.key}`;
              const active = chatFilter === filterKey;
              const { count = 0, unread = 0 } = badgeCounts[label.key] ?? {};
              return (
                <button
                  key={label.key}
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
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground text-[13px]">Cargando chats...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-[13px]">No se encontraron conversaciones</div>
          ) : filtered.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleConvSelect(conv)}
              onMouseEnter={(e) => {
                const note = convNotes[conv.id];
                const hasTkt = !!ticketStatusByConvId[conv.id];
                if (!note?.trim() || !hasTkt) return;
                const target = e.currentTarget as HTMLElement;
                tooltipTimeoutRef.current = setTimeout(() => {
                  setTooltipRect(target.getBoundingClientRect());
                  setTooltipConvId(conv.id);
                }, 1000);
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
                  <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-[11px] font-semibold">
                    {getInitials(conv.profile_name, conv.wa_id)}
                  </AvatarFallback>
                </Avatar>

              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center text-left overflow-hidden" style={{ contain: 'inline-size' }}>
                <div className="flex items-center gap-2 min-w-0 mb-1">
                  <span className={`font-semibold text-[13px] truncate ${selectedConv?.id === conv.id ? "text-primary" : "text-foreground"} tracking-wide`}>
                    {conv.profile_name || conv.wa_id}
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
        </ScrollArea>
      </div>

      {/* 2. Ventana de Conversación */}
      <div className={`tour-inbox-chat ${selectedConv ? "flex" : "hidden md:flex"} flex-col flex-1 bg-background/50 relative overflow-hidden min-h-0`}>
        {/* Background Pattern */}
        {!selectedConv ? (
          <InboxEmptyPanel companyId={companyId} onNavigateToSchedule={onNavigateToSchedule} />
        ) : (
          <div className="flex flex-col flex-1 h-full min-h-0 relative z-10 bg-background/50">
            {/* Header */}
            <div className="flex justify-between items-center px-6 h-16 border-b border-border/10 glass z-20 flex-shrink-0">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 -ml-2" onClick={() => setSelectedConv(null)}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border border-primary/20 shadow-lg glow-box">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {getInitials(selectedConv.profile_name, selectedConv.wa_id)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-bold text-[14px] tracking-wide text-foreground leading-snug">
                      {selectedConv.profile_name || "Contacto Desconocido"}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono font-medium leading-none mb-0.5 flex items-center gap-1">
                      {selectedConv.wa_id}
                      <button
                        onClick={() => { navigator.clipboard.writeText(selectedConv.wa_id); toast({ title: 'Teléfono copiado' }); }}
                        className="h-4 w-4 flex items-center justify-center rounded hover:bg-primary/10 text-muted-foreground/40 hover:text-primary transition-colors"
                        title="Copiar número"
                      >
                        <Copy className="w-2.5 h-2.5" />
                      </button>
                    </span>
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

              <div className="flex items-center gap-2">
                {activeTicket && !ticketLabels.find(l => l.is_final)?.key.includes(activeTicket.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCloseChat()}
                    className="h-8 gap-2 text-[10px] font-bold tracking-widest uppercase border transition-all border-red-500/50 text-red-500 hover:bg-red-500/10"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">FINALIZAR</span>
                  </Button>
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
                      const effectiveSenderName = msg.sender_name || userName || "Especialista";
                      const badge = isOut ? getSenderBadge(msg.sender_type, effectiveSenderName) : null;

                      // Check if previous message is from same sender to chain bubbles ideally
                      const prevMsg = idx > 0 ? group.msgs[idx - 1] : null;
                      const isChained = prevMsg?.direction === msg.direction && prevMsg?.sender_type === msg.sender_type;

                      return (
                        <div key={msg.id} className={`flex w-full ${isOut ? "justify-end" : "justify-start"} ${isChained ? "mt-0.5" : "mt-2"}`}>
                          <div className={`
                            relative max-w-[85%] md:max-w-[70%] lg:max-w-[60%] w-fit min-w-0 overflow-hidden px-4 py-2 hover:brightness-110 transition-all shadow-lg
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

                            <MessageMedia message={msg} />

                            {/* En caso de que no haya URL pero sepamos que es multimedia (inbound de YCloud procesando o error) */}
                            {!msg.media_url && (msg.message_type === 'video' || msg.message_type === 'image' || msg.message_type === 'audio' || msg.message_type === 'short_video' || (msg.content && /🎥|📷|🎵|\[video\]|\[image\]/i.test(msg.content))) && (
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
                            {msg.message_type === 'sticker' && (
                              <span className="text-[12px] text-muted-foreground italic">🎭 Sticker</span>
                            )}

                            {/* Mostrar texto solo si no hay multimedia o si el texto no es el placeholder de sistema [Multimedia] */}
                            {msg.message_type !== 'sticker' && msg.content && (() => {
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
                              <span className="text-[9.5px] font-medium tracking-wide">{formatMessageTime(msg.created_at)}</span>
                              {isOut && <StatusIcon status={msg.status} />}
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
              
              {/* 24-Hour window validation banner */}
              {selectedConv && (
                puedeEnviar ? (
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
                      ⚠️ Han pasado más de 24 horas. Solo puedes contactar al cliente con una <strong>plantilla aprobada</strong> o directamente por WhatsApp.
                    </p>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
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
                    placeholder={!puedeEnviar ? "Respuesta bloqueada (Fuera de la ventana de 24h)" : selectedConv.is_agent_active ? "Inyectar comando (Pausa IA Automáticamente)..." : "Escribe un mensaje o / para atajos..."}
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

          {/* ── Tabs (solo con ticket activo) ── */}
          {activeTicket && (
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

            {activeTicket ? (
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
                        </div>
                        <div className="rounded-2xl bg-muted/40 border border-border/30 px-3 py-1">
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
                              {{ soporte_tecnico: "Soporte Técnico", ventas: "Ventas", pagos: "Pagos", consulta_comercial: "Consulta Comercial" }[t.category as string] || t.category || 'General'}
                            </Badge>
                          </div>
                          {/* IA */}
                          <div className="flex items-center justify-between py-2.5 border-b border-border/20">
                            <span className="text-[12px] text-muted-foreground font-medium flex items-center gap-2">
                              <Bot className="w-3.5 h-3.5" /> IA
                            </span>
                            <span className={`text-[10px] font-bold tracking-widest flex items-center gap-1.5 ${selectedConv.is_agent_active ? 'text-emerald-400' : 'text-muted-foreground/50'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${selectedConv.is_agent_active ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]' : 'bg-muted-foreground/30'}`} />
                              {selectedConv.is_agent_active ? 'Activada' : 'Apagada'}
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
                            {ticketLabels.map(label => (
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
      {tooltipConvId && tooltipRect && convNotes[tooltipConvId] && (
        <div
          className="pointer-events-none fixed z-[9999] w-[260px] rounded-xl shadow-2xl animate-in fade-in slide-in-from-left-2 duration-200 overflow-hidden border border-border bg-popover backdrop-blur-xl"
          style={{
            left: Math.min(tooltipRect.right + 12, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 276),
            top: tooltipRect.top + tooltipRect.height / 2,
            transform: 'translateY(-50%)',
          }}
        >
          {/* Franja lateral amber */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400 rounded-l-xl" />
          {/* Contenido */}
          <div className="pl-4 pr-3.5 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider">Nota del caso</span>
            </div>
            <p className="text-[13px] font-semibold text-foreground leading-relaxed break-words line-clamp-8 uppercase">
              {convNotes[tooltipConvId]}
            </p>
          </div>
        </div>
      )}

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
                      value={closeSummaryText}
                      onChange={(e) => setCloseSummaryText(e.target.value)}
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
          if (!open) { setInfoClientRut(""); setInfoClientMotivo(""); setInfoClientRutError(""); }
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
            <div className="space-y-1.5">
              <Label htmlFor="info-motivo" className="text-sm font-semibold">
                Motivo <span className="text-foreground/50 text-[12px] font-normal">(opcional)</span>
              </Label>
              <Textarea
                id="info-motivo"
                placeholder="Describe el motivo de la actualización..."
                value={infoClientMotivo}
                onChange={e => setInfoClientMotivo(e.target.value)}
                className="resize-none h-[80px] text-[13px]"
              />
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
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Enviar solicitud</>
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

    </div>
  );
}
