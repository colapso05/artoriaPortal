import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOperadores, mapaOperadores } from "@/hooks/useOperadores";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Bot, AlertTriangle, CheckCircle2, MessageCircle, TrendingUp,
  ThumbsUp, ThumbsDown, Minus, Clock, Loader2, RefreshCw,
  Zap, Tag, ExternalLink, Lightbulb, Star, ChevronDown, Users, Award, Bell, Flag, Info, UserCheck,
} from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MediaLightbox, type LightboxMedia } from "@/components/ui/MediaLightbox";
import { format, parseISO, subDays } from "date-fns";
import { es } from "date-fns/locale";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Summary {
  total_conversations: number;
  resolved_autonomously: number;
  escalated_count: number;
  with_specialist_count: number;
  ai_resolution_rate: number;
  escalation_rate: number;
  containment_rate: number;
  avg_bot_score: number | null;
  hallucination_count: number;
  failed_to_respond_count: number;
  human_overhead_minutes: number;
  time_saved_minutes: number | null;
  time_saved_hours: number | null;
  sentiment_distribution: { positivo: number; neutral: number; negativo: number };
  resolution_type_distribution: Record<string, number>;
  top_topics: { topic: string; count: number }[];
  weekly_score_trend: { week: string; avg_score: number; total: number }[];
}

interface TimelineRow {
  period: string;
  total: number;
  avg_score: number | null;
  resolved: number;
  escalated: number;
  hallucinations: number;
  negative_sentiment: number;
}

interface TopicRow { topic: string; total: number; avg_score: number | null; }

// Contrato nuevo: problema | best | aceptable (+ flag escalated transversal).
// La capa de compatibilidad (normalizeSegment) mapea el contrato viejo
// (best/errors/escalated/neutral) a este, para poder desplegar en cualquier orden.
type Segment = "problema" | "best" | "aceptable";

interface SegmentedConv {
  id: string;
  conversation_id: string;
  profile_name: string | null;
  wa_id: string;
  segment: Segment;
  escalated?: boolean;
  bot_score: number | null;
  resolution_type: string;
  sentiment: string;
  hallucination: boolean;
  failed_response: boolean;
  resolved_auto: boolean;
  topics: string[];
  summary: string;
  bot_errors: string[];
  bot_messages: number;
  human_messages: number;
  analyzed_at: string;
  session_start: string | null;
  session_end: string | null;
  reviewed?: boolean;
  /** Veredicto del especialista: si el agente se equivocó de verdad o no. */
  veredicto_revision?: "error_real" | "falso_positivo" | null;
  /** Nota que puso el especialista cuando corrigió al analizador. */
  nota_revisada?: number | null;
  /** La que había puesto el analizador, guardada para poder auditar la corrección. */
  nota_original?: number | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

interface ConvMessage {
  id: string;
  content: string;
  media_url: string | null;
  direction: "inbound" | "outbound";
  sender_type: string;
  sender_name: string | null;
  created_at: string;
}

interface ConvAnalysis {
  bot_score: number | null;
  topics: string[];
  resolved_autonomously: boolean;
  hallucination_detected: boolean;
  failed_to_respond: boolean;
  bot_errors: string[];
  customer_sentiment: string;
  resolution_type: string;
  summary: string;
  improvement_suggestions: string[];
  specialist_count: number;
  agent_count: number;
  message_count: number;
}

interface Props {
  companyId: string;
  companyName?: string;
  isAdminView?: boolean;
  onOpenConversation?: (conversationId: string) => void;
  initialConvData?: any;
  onInitialConvDataHandled?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Capa de compatibilidad: normaliza cualquier fila del RPC (contrato viejo o nuevo)
// al contrato nuevo `problema | best | aceptable` + flag `escalated`.
// Permite desplegar frontend y backend en cualquier orden sin romper la vista.
function normalizeSegment(s: SegmentedConv): SegmentedConv {
  const raw = s.segment as string;
  // La escalación es transversal: viene como flag en el contrato nuevo,
  // o como el viejo bucket "escalated".
  const escalated = (s as any).escalated === true || raw === "escalated";
  // El bucket se deriva SIEMPRE del score puro con los umbrales acordados,
  // sin depender de la clasificación del RPC (que puede usar otro umbral):
  //   < 6  → problema (requiere revisión humana)   ·  6-7 → aceptable  ·  ≥ 8 → best
  const score = s.bot_score;
  const segment: Segment =
    score == null ? "aceptable"
    : score < 6   ? "problema"
    : score >= 8  ? "best"
    :               "aceptable";
  return { ...s, segment, escalated };
}

/**
 * El número del cliente, legible.
 *
 * `wa_id` llega como "56912345678", con o sin "+". Si no tiene la forma esperada
 * se devuelve tal cual: es preferible un número raro a no mostrar ninguno.
 */
function telefono(waId: string | null | undefined): string | null {
  if (!waId) return null;
  const d = String(waId).replace(/[^0-9]/g, "");
  if (d.length < 8) return null;
  const m = d.match(/^56(\d)(\d{4})(\d{4})$/);
  return m ? `+56 ${m[1]} ${m[2]} ${m[3]}` : `+${d}`;
}

const SCORE_COLOR = (s: number | null) => {
  if (s === null) return "#94a3b8";
  if (s >= 8) return "#10b981";
  if (s >= 6) return "#f59e0b";
  return "#ef4444";
};

// Ícono/color por segmento — para mostrar a usuarios normales en vez del score numérico.
const SEGMENT_ICON: Record<Segment, { icon: React.ElementType; color: string }> = {
  problema:  { icon: AlertTriangle, color: "#ef4444" },
  best:      { icon: Award,         color: "#10b981" },
  aceptable: { icon: CheckCircle2,  color: "#94a3b8" },
};

// Círculo de estado de una conversación. Admin (admin_isp) ve el score numérico;
// el usuario normal ve solo un ícono por segmento, sin exponer la puntuación.
function ScoreCircle({ score, segment, isAdmin, className, iconSize }: {
  score: number | null; segment?: Segment; isAdmin?: boolean; className: string; iconSize: number;
}) {
  if (isAdmin) {
    return <div className={`${className} text-white`} style={{ background: SCORE_COLOR(score) }}>{score ?? "?"}</div>;
  }
  const cfg = (segment && SEGMENT_ICON[segment]) || { icon: CheckCircle2, color: "#94a3b8" };
  const Icon = cfg.icon;
  return (
    <div className={className} style={{ background: `${cfg.color}20` }}>
      <Icon style={{ width: iconSize, height: iconSize, color: cfg.color }} />
    </div>
  );
}

const RESOLUTION_COLORS: Record<string, string> = {
  resuelto: "#10b981",
  handoff_planificado: "#3b82f6",
  escalado: "#f59e0b",
  no_resuelto: "#ef4444",
  saludo_sin_continuacion: "#94a3b8",
  comprobante_recibido: "#8b5cf6",
};

const RESOLUTION_LABELS: Record<string, string> = {
  resuelto: "Resuelto por el agente",
  handoff_planificado: "Handoff planificado",
  escalado: "Escalado a humano",
  no_resuelto: "No resuelto",
  saludo_sin_continuacion: "Saludo sin continuación",
  comprobante_recibido: "Comprobante recibido",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positivo: "#10b981",
  neutral: "#94a3b8",
  negativo: "#ef4444",
};

type Range = "7d" | "30d" | "90d" | "all";
type Granularity = "day" | "week" | "month";

const TOOLTIP_STYLE = {
  background: "#1e1e2e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  fontSize: 12,
  color: "#e2e8f0",
};
const TOOLTIP_ITEM_STYLE = { color: "#e2e8f0" };
const TOOLTIP_LABEL_STYLE = { color: "#94a3b8", marginBottom: 2 };

/**
 * Cuántas conversaciones se piden por rango.
 *
 * Estaba fijo en 100 para todos. Como vienen ordenadas de la más nueva a la más
 * vieja, en "Todo" esas 100 se acababan a los diez días y el histórico parecía
 * empezar el 21 de agosto: no faltaban datos, faltaba pedirlos. Sigue habiendo
 * techo a propósito —traer miles de filas al panel no ayuda a nadie— pero ahora
 * es un techo que no se alcanza en la práctica.
 */
/** Filas que se pintan de cada sección antes de pedir "Ver más". */
const PASO_LISTA = 50;

const LIMITE_SEGMENTOS: Record<Range, number> = {
  "7d": 500,
  "30d": 1500,
  "90d": 4000,
  all: 10000,
};

function dateRange(r: Range) {
  const to = new Date();
  const from = r === "all"
    ? new Date("2020-01-01")
    : subDays(to, r === "7d" ? 7 : r === "30d" ? 30 : 90);
  return { from: from.toISOString(), to: to.toISOString() };
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color, delay = 0, onSubClick, subActive, tooltip }: {
  icon: React.ElementType; label: string; value: React.ReactNode;
  sub?: string; color: string; delay?: number;
  onSubClick?: () => void;
  subActive?: boolean;
  tooltip?: string;
}) {
  return (
    <motion.div className="h-full" initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay, duration: 0.35 }}>
      <Card className="h-full border rounded-2xl overflow-hidden bg-card/60" style={{ borderColor: `${color}30`, background: `linear-gradient(135deg, ${color}12, ${color}05)` }}>
        <CardContent className="p-5 h-full">
          <div className="flex items-start justify-between gap-3 h-full">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{label}</p>
                {tooltip && (
                  <TooltipProvider delayDuration={150}>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors flex-shrink-0">
                          <Info className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[240px] text-[11px] leading-relaxed">
                        {tooltip}
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="text-2xl font-extrabold tabular-nums" style={{ color }}>{value}</div>
              {sub && onSubClick ? (
                <button
                  onClick={onSubClick}
                  className={`text-[11px] mt-1 flex items-center gap-1 transition-all rounded px-1 -mx-1 ${
                    subActive
                      ? "font-semibold underline underline-offset-2"
                      : "text-muted-foreground/60 hover:text-foreground/80 hover:underline underline-offset-2"
                  }`}
                  style={subActive ? { color } : undefined}
                >
                  {sub}
                  <svg className="w-2.5 h-2.5 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              ) : sub ? (
                <p className="text-[11px] text-muted-foreground/60 mt-1">{sub}</p>
              ) : null}
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Media renderer ────────────────────────────────────────────────────────────

function detectMediaType(url: string, content: string): "image" | "audio" | "video" | "document" | null {
  try {
    const low = url.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|heic)/i.test(low) || low.includes("/image")) return "image";
    if (/\.(ogg|mp3|wav|m4a|amr)/i.test(low) || low.includes("audio")) return "audio";
    if (/\.(mp4|mov|avi|3gp|mkv)/i.test(low) || low.includes("video")) return "video";
    if (/\.(pdf|docx?|xlsx?)/i.test(low)) return "document";
  } catch (_) { /* */ }
  // Fallback: detect by content emoji
  if (content.startsWith("📷")) return "image";
  if (content.startsWith("🎵") || content.startsWith("🔊")) return "audio";
  if (content.startsWith("🎥")) return "video";
  if (content.startsWith("📄")) return "document";
  return null;
}

function AudioPlayer({ src }: { src: string }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setReady(true), 120);
    return () => clearTimeout(t);
  }, [src]);
  if (!ready) return <div style={{ width: 300, height: 40 }} className="rounded-lg bg-white/5 mt-1" />;
  return (
    <div className="mt-1">
      <audio controls src={src} className="rounded-lg" style={{ width: 300, height: 40 }} preload="none" />
    </div>
  );
}

// Devuelve el caption del media si es texto real (no la URL ni solo un emoji marcador)
function mediaCaption(content: string, media_url: string): string {
  if (!content) return "";
  let txt = content.trim();
  if (txt === media_url) return "";
  // quitar emoji marcador inicial (📷 🎵 🔊 🎥 📄) si lo hubiera
  txt = txt.replace(/^(📷|🎵|🔊|🎥|📄)\s*/, "").trim();
  if (!txt || txt === media_url) return "";
  return txt;
}

function renderMedia(content: string, media_url: string | null, isBot: boolean, onOpen: (m: LightboxMedia) => void) {
  if (!media_url) return <p className="whitespace-pre-wrap break-words">{content}</p>;

  const type = detectMediaType(media_url, content);
  const caption = mediaCaption(content, media_url);
  const Caption = caption
    ? <p className="whitespace-pre-wrap break-words mt-1.5">{caption}</p>
    : null;

  if (type === "image") {
    return (
      <>
        <img
          src={media_url}
          alt="Imagen"
          className="max-w-full rounded-lg cursor-pointer mt-1"
          style={{ maxWidth: 260 }}
          onClick={() => onOpen({ url: media_url, type: "image" })}
        />
        {Caption}
      </>
    );
  }

  if (type === "audio") {
    return <><AudioPlayer src={media_url} />{Caption}</>;
  }

  if (type === "video") {
    return (
      <>
        <video controls className="max-w-full rounded-lg mt-1" style={{ maxWidth: 260 }} preload="metadata" playsInline>
          <source src={media_url} />
        </video>
        {Caption}
      </>
    );
  }

  if (type === "document") {
    const isPdf = /\.pdf(\?|$)/i.test(media_url) || /pdf/i.test(content);
    const name = content.replace(/^📄\s*/, "") || "Documento";
    return (
      <button
        onClick={() => onOpen({ url: media_url, type: isPdf ? "pdf" : "other", name })}
        className={`flex items-center gap-1.5 mt-1 underline text-[12px] ${isBot ? "text-indigo-200" : "text-primary"}`}
      >
        📄 {name}
      </button>
    );
  }

  // type === null: media_url existe pero no reconocimos el tipo — mostrar link genérico
  return (
    <a href={media_url} target="_blank" rel="noopener noreferrer"
      className="underline text-[12px] opacity-70">
      {content || "Ver archivo adjunto"}
    </a>
  );
}

// ── Conversation Detail Sheet ─────────────────────────────────────────────────

function ConvDetailSheet({ conv, isAdminView, onClose, onOpenInbox, onMarkReviewed, reviewingId }: {
  conv: SegmentedConv | null;
  isAdminView?: boolean;
  onClose: () => void;
  onOpenInbox?: (convId: string) => void;
  onMarkReviewed?: (id: string) => void;
  reviewingId?: string | null;
}) {
  const [messages, setMessages] = useState<ConvMessage[]>([]);
  const [analysis, setAnalysis] = useState<ConvAnalysis | null>(null);
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeConv, setActiveConv] = useState<SegmentedConv | null>(null);

  // Todas las sesiones de esta conversación. Se consultan DIRECTO por conversation_id (sin
  // rango de fechas ni límite) en vez de filtrar `allSegments` — esa lista viene recortada a
  // las 100 más recientes de cualquier tipo (para no cargar miles de filas en el dashboard), así
  // que una sesión vieja y "aceptable" podía quedar fuera del top 100 y "desaparecer" del panel
  // aunque siguiera intacta en la base. Esta consulta puntual siempre trae todas las sesiones
  // reales de la conversación abierta.
  const [sessions, setSessions] = useState<SegmentedConv[]>([]);

  useEffect(() => {
    if (!conv) { setSessions([]); return; }
    let cancelled = false;
    (supabase as any)
      .from("conversation_analysis")
      /*
       * `nota_efectiva`, no `bot_score`.
       *
       * Las RPC del tablero ya devuelven la nota corregida; esta consulta va
       * directo a la tabla, así que si pidiera `bot_score` mostraría el 3 original
       * al lado de un 10 corregido y parecerían dos pantallas peleadas.
       */
      .select("id, conversation_id, bot_score:nota_efectiva, analyzed_at, session_start, session_end, reviewed")
      .eq("conversation_id", conv.conversation_id)
      .not("session_start", "is", null)
      .order("session_start", { ascending: false })
      .then(({ data }: any) => {
        if (cancelled || !data) return;
        const rows: SegmentedConv[] = data.map((r: any) => normalizeSegment({
          ...r,
          profile_name: conv.profile_name,
          wa_id: conv.wa_id,
          escalated: false,
          resolution_type: "", sentiment: "", hallucination: false, failed_response: false,
          resolved_auto: false, topics: [], summary: "", bot_errors: [],
          bot_messages: 0, human_messages: 0,
        }));
        setSessions(rows);
      });
    return () => { cancelled = true; };
  }, [conv?.conversation_id]);

  // Cuando cambia la conversación abierta, resetear sesión activa
  useEffect(() => {
    setActiveConv(conv);
  }, [conv?.conversation_id]);

  // Cargar mensajes y análisis cuando cambia la sesión activa
  useEffect(() => {
    if (!activeConv) { setMessages([]); setAnalysis(null); return; }
    setLoadingDetail(true);

    let msgQuery = (supabase as any)
      .from("messages")
      .select("id,content,media_url,direction,sender_type,sender_name,created_at")
      .eq("conversation_id", activeConv.conversation_id);
    if (activeConv.session_start) msgQuery = msgQuery.gte("created_at", activeConv.session_start);
    if (activeConv.session_end)   msgQuery = msgQuery.lte("created_at", activeConv.session_end);
    msgQuery = msgQuery.order("created_at", { ascending: true });

    let anaQuery = (supabase as any)
      .from("conversation_analysis")
      .select("*")
      .eq("conversation_id", activeConv.conversation_id);
    if (activeConv.session_start) {
      anaQuery = anaQuery.eq("session_start", activeConv.session_start);
    } else {
      anaQuery = anaQuery.order("analyzed_at", { ascending: false });
    }
    anaQuery = anaQuery.limit(1);

    Promise.all([msgQuery, anaQuery]).then(([msgRes, anaRes]: any[]) => {
      setMessages((msgRes.data as ConvMessage[]) ?? []);
      const anaData = Array.isArray(anaRes.data) ? anaRes.data[0] ?? null : anaRes.data;
      setAnalysis(anaData as ConvAnalysis | null);
      setLoadingDetail(false);
    });
  }, [activeConv?.conversation_id, activeConv?.session_start]);

  const isOpen = !!conv;
  const display = activeConv ?? conv;

  return (
    <>
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[950px] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/30 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <ScoreCircle score={display?.bot_score ?? null} segment={display?.segment} isAdmin={isAdminView}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-extrabold flex-shrink-0"
                iconSize={20} />
              <div className="min-w-0">
                <SheetTitle className="text-sm font-bold truncate">
                  {display?.profile_name || telefono(display?.wa_id) || display?.wa_id}
                </SheetTitle>
                {/*
                 * El número va aparte cuando hay nombre.
                 *
                 * Antes era `profile_name || wa_id`: en cuanto el cliente tenía
                 * nombre de WhatsApp, el número desaparecía de toda la pantalla y
                 * no quedaba forma de buscarlo en el sistema de la empresa.
                 * `select-all` para que un doble clic lo tome entero.
                 */}
                {display?.profile_name && telefono(display?.wa_id) && (
                  <p className="text-[11px] font-mono text-muted-foreground/75 select-all">
                    {telefono(display.wa_id)}
                  </p>
                )}
                {display?.session_start ? (
                  <p className="text-[11px] text-muted-foreground/60">
                    {format(parseISO(display.session_start), "d 'de' MMMM, HH:mm", { locale: es })}
                    {" → "}
                    {display.session_end
                      ? format(parseISO(display.session_end), display.session_end.slice(0,10) === display.session_start.slice(0,10) ? "HH:mm" : "d MMM HH:mm", { locale: es })
                      : "..."}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground/60">
                    {display?.analyzed_at ? format(parseISO(display.analyzed_at), "d 'de' MMMM, HH:mm", { locale: es }) : ""}
                  </p>
                )}
              </div>
            </div>
            {onOpenInbox && conv && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-[11px] flex-shrink-0"
                onClick={() => { onClose(); onOpenInbox(conv.conversation_id); }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ir al chat
              </Button>
            )}
          </div>
        </SheetHeader>

        {loadingDetail ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">

            {/* ── Panel de sesiones (solo si hay múltiples) ────────── */}
            {sessions.length > 1 && (
              <div className="w-40 flex-shrink-0 border-r border-border/20 flex flex-col bg-card/20">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 px-3 pt-3 pb-2 flex-shrink-0">
                  Sesiones
                </p>
                <ScrollArea className="flex-1">
                  <div className="px-2 pb-3 space-y-1">
                    {sessions.map(s => {
                      const sKey = `${s.conversation_id}__${s.session_start}`;
                      const isActive = activeConv?.session_start === s.session_start;
                      return (
                        <button
                          key={sKey}
                          onClick={() => setActiveConv(s)}
                          className={`w-full text-left px-2.5 py-2 rounded-lg transition-all border ${
                            isActive
                              ? "bg-primary/10 border-primary/25 text-foreground"
                              : "border-transparent hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <ScoreCircle score={s.bot_score} segment={s.segment} isAdmin={isAdminView}
                              className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-extrabold flex-shrink-0"
                              iconSize={11} />
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold leading-tight">
                                {format(parseISO(s.session_start!), "d MMM", { locale: es })}
                              </p>
                              <p className="text-[9px] text-muted-foreground/60 leading-tight">
                                {format(parseISO(s.session_start!), "HH:mm", { locale: es })}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* ── Mensajes ─────────────────────────────────────────── */}
            <div className="flex-1 min-h-0 min-w-0 border-b md:border-b-0 md:border-r border-border/20 flex flex-col">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-4 py-2 flex-shrink-0">
                Conversación
              </p>
              <ScrollArea className="flex-1 px-4 pb-4">
                <div className="space-y-1.5">
                  {messages.map((msg) => {
                    const isOut = msg.direction === "outbound";
                    const isBot = msg.sender_type === "agent";
                    const isHuman = msg.sender_type === "specialist";

                    return (
                      <div key={msg.id} className={`flex w-full ${isOut ? "justify-end" : "justify-start"}`}>
                        <div className={`
                          relative max-w-[80%] min-w-0 px-3.5 py-2 rounded-2xl text-[12px] leading-relaxed shadow-sm
                          ${isOut
                            ? isBot
                              ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-br-sm"
                              : isHuman
                                ? "bg-primary/10 border border-primary/20 text-foreground rounded-br-sm"
                                : "bg-muted text-foreground rounded-br-sm"
                            : "bg-card border border-border/40 text-foreground rounded-bl-sm"
                          }
                        `}>
                          {/* Label del tipo de emisor */}
                          {isOut && (
                            <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isBot ? "text-indigo-200" : "text-primary/60"}`}>
                              {isBot ? "Agente IA" : isHuman ? (msg.sender_name || "Operador") : "Sistema"}
                            </p>
                          )}
                          {renderMedia(msg.content, msg.media_url, isBot, setLightbox)}
                          <p className={`text-[9px] mt-1 text-right ${isOut && isBot ? "text-indigo-200/70" : "text-muted-foreground/50"}`}>
                            {format(parseISO(msg.created_at), "HH:mm")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {messages.length === 0 && (
                    <p className="text-center text-[12px] text-muted-foreground/50 py-10">Sin mensajes</p>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* ── Análisis IA ──────────────────────────────────────── */}
            <div className="w-full md:w-72 flex-shrink-0 flex flex-col overflow-hidden">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-4 py-2 flex-shrink-0">
                Análisis del agente IA
              </p>
              <ScrollArea className="flex-1 px-4 pb-4">
                {analysis ? (
                  <div className="space-y-4">

                    {/* Score + resolución */}
                    <div className="p-3 rounded-xl border border-border/30 bg-card/60 space-y-2">
                      {isAdminView && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground/70">Score del agente</span>
                            <span className="text-lg font-extrabold tabular-nums" style={{ color: SCORE_COLOR(analysis.bot_score) }}>
                              {analysis.bot_score ?? "—"}<span className="text-[11px] font-normal text-muted-foreground/50">/10</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div
                              className="h-1.5 rounded-full flex-1"
                              style={{ background: `linear-gradient(to right, ${SCORE_COLOR(analysis.bot_score)} ${(analysis.bot_score ?? 0) * 10}%, rgba(255,255,255,0.1) 0%)` }}
                            />
                          </div>
                        </>
                      )}
                      <Badge
                        className="text-[10px] w-full justify-center py-0.5 border"
                        style={{
                          background: `${RESOLUTION_COLORS[analysis.resolution_type] ?? "#94a3b8"}18`,
                          color: RESOLUTION_COLORS[analysis.resolution_type] ?? "#94a3b8",
                          borderColor: `${RESOLUTION_COLORS[analysis.resolution_type] ?? "#94a3b8"}35`,
                        }}
                      >
                        {RESOLUTION_LABELS[analysis.resolution_type] ?? analysis.resolution_type}
                      </Badge>
                      {onMarkReviewed && conv && conv.segment === "problema" && (
                        <button
                          onClick={() => onMarkReviewed(conv.id)}
                          disabled={reviewingId === conv.id}
                          className={`w-full text-[10px] font-semibold py-1 rounded-lg border transition-all ${
                            conv.reviewed
                              ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                              : "bg-muted/60 text-muted-foreground border-border/40 hover:bg-emerald-500/15 hover:text-emerald-500 hover:border-emerald-500/30"
                          }`}
                        >
                          {reviewingId === conv.id
                            ? "Guardando..."
                            : conv.veredicto_revision === "falso_positivo"
                              ? `✓ Estaba bien · nota ${conv.nota_revisada ?? "—"}`
                              : conv.veredicto_revision === "error_real"
                                ? "✓ Error real confirmado"
                                : conv.reviewed ? "✓ Revisada" : "Revisar"}
                        </button>
                      )}
                    </div>

                    {/* Flags de problemas — los de fallo (alucinación/sin responder) solo para admin */}
                    <div className="space-y-1.5">
                      {[
                        ...(isAdminView ? [
                          { flag: analysis.hallucination_detected, label: "Alucinación detectada",   color: "#ef4444", icon: AlertTriangle },
                          { flag: analysis.failed_to_respond,     label: "Preguntas sin responder", color: "#f59e0b", icon: AlertTriangle },
                        ] : []),
                        { flag: analysis.resolved_autonomously, label: "Resuelto autónomamente",  color: "#10b981", icon: CheckCircle2 },
                      ].map(({ flag, label, color, icon: Icon }) => flag && (
                        <div key={label} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium"
                          style={{ borderColor: `${color}30`, background: `${color}10`, color }}>
                          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                          {label}
                        </div>
                      ))}
                    </div>

                    {/* Sentimiento */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground/70">Sentimiento:</span>
                      <span className="text-[11px] font-semibold capitalize flex items-center gap-1" style={{ color: SENTIMENT_COLORS[analysis.customer_sentiment] ?? "#94a3b8" }}>
                        {analysis.customer_sentiment === "positivo" ? <ThumbsUp className="w-3 h-3" /> :
                         analysis.customer_sentiment === "negativo" ? <ThumbsDown className="w-3 h-3" /> :
                         <Minus className="w-3 h-3" />}
                        {analysis.customer_sentiment}
                      </span>
                    </div>

                    {/* Temas */}
                    {analysis.topics?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1.5 flex items-center gap-1">
                          <Tag className="w-3 h-3" /> Temas
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {analysis.topics.map((t) => (
                            <Badge key={t} variant="outline" className="text-[10px] px-2 py-0.5 rounded-full">
                              {t.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Resumen */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1">Resumen</p>
                      <p className="text-[12px] text-foreground/80 leading-relaxed">{analysis.summary}</p>
                    </div>

                    {/* Errores del bot — solo admin_isp */}
                    {isAdminView && analysis.bot_errors?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-red-500/70 mb-1.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Errores detectados
                        </p>
                        <ul className="space-y-1">
                          {analysis.bot_errors.map((e, i) => (
                            <li key={i} className="text-[11px] text-red-500/80 flex items-start gap-1.5">
                              <span className="mt-0.5 flex-shrink-0">•</span>{e}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Sugerencias — solo admin_isp */}
                    {isAdminView && analysis.improvement_suggestions?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1.5 flex items-center gap-1">
                          <Lightbulb className="w-3 h-3 text-amber-500" /> Sugerencias
                        </p>
                        <ul className="space-y-1.5">
                          {analysis.improvement_suggestions.map((s, i) => (
                            <li key={i} className="text-[11px] text-muted-foreground/80 flex items-start gap-1.5">
                              <Star className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Stats de mensajes */}
                    <div className="pt-2 border-t border-border/20 grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: "Total",   value: analysis.message_count },
                        { label: "Bot",     value: analysis.agent_count,      color: "#6366f1" },
                        { label: "Humano",  value: analysis.specialist_count, color: "#10b981" },
                      ].map(({ label, value, color }) => (
                        <div key={label}>
                          <p className="text-base font-extrabold tabular-nums" style={{ color }}>{value}</p>
                          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wide">{label}</p>
                        </div>
                      ))}
                    </div>

                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground/50 text-center py-8">Sin análisis disponible</p>
                )}
              </ScrollArea>
            </div>

          </div>
        )}
      </SheetContent>
    </Sheet>
    <MediaLightbox media={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ hasHistoricData, onExpandRange }: {
  hasHistoricData: boolean;
  onExpandRange?: () => void;
}) {
  if (hasHistoricData) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
        <Card className="border-border/20 bg-card/50 rounded-2xl">
          <CardContent className="py-20 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center">
              <Clock className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div>
              <h3 className="text-lg font-bold mb-1">Sin conversaciones en este período</h3>
              <p className="text-muted-foreground/60 text-sm max-w-sm">
                No hubo actividad analizada en el rango seleccionado. Prueba con un período más amplio.
              </p>
            </div>
            {onExpandRange && (
              <button
                onClick={onExpandRange}
                className="text-xs font-semibold text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              >
                Ver todo el historial →
              </button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
      <Card className="border-border/20 bg-card/50 rounded-2xl">
        <CardContent className="py-24 flex flex-col items-center justify-center text-center gap-5">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
            <Bot className="w-10 h-10 text-primary/60" />
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">Sin datos de análisis aún</h3>
            <p className="text-muted-foreground/70 text-sm max-w-md">
              El agente analiza las conversaciones automáticamente cada noche.
              El primer reporte estará disponible mañana en la mañana.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Análisis nocturno — 2:00 AM</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

type QuickFilter = "resolved" | "escalated" | "sentiment_pos" | "sentiment_neg" | null;


/**
 * Qué pasó realmente con una conversación marcada como problema.
 *
 * Son dos preguntas, no una: si el agente se equivocó, y —si no se equivocó— cuánto
 * valía de verdad. La nota es obligatoria en el falso positivo a propósito: sin
 * ella, "estaba bien" sacaría la conversación del margen de error sin dejar nada en
 * su lugar, y el número quedaría limpio sin que nadie pueda decir por qué.
 */

export function DialogoVeredicto({ conv, guardando, onCerrar, onGuardar }: {
  conv: SegmentedConv | null;
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (veredicto: "error_real" | "falso_positivo", nota: number | null, comentario: string) => void;
}) {
  const [veredicto, setVeredicto] = useState<"error_real" | "falso_positivo" | null>(null);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");

  useEffect(() => {
    if (conv) { setVeredicto(null); setNota(null); setComentario(""); }
  }, [conv?.id]);

  if (!conv) return null;
  const faltaNota = veredicto === "falso_positivo" && nota == null;

  return (
    <Dialog open={!!conv} onOpenChange={(o) => { if (!o && !guardando) onCerrar(); }}>
      <DialogContent className="border-border/30 bg-card sm:max-w-[520px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-base">¿El agente se equivocó de verdad?</DialogTitle>
        </DialogHeader>

        <p className="text-[12px] text-muted-foreground/70 leading-relaxed -mt-1">
          El analizador le puso <strong className="text-foreground/85">{conv.bot_score ?? "—"}</strong> y la
          mandó a revisión. Tu respuesta decide si esta conversación sigue contando
          como error en el margen del agente.
        </p>

        <div className="space-y-2 mt-1">
          <button
            onClick={() => { setVeredicto("error_real"); setNota(null); }}
            className={`w-full text-left rounded-xl border p-3 transition-colors ${
              veredicto === "error_real"
                ? "border-rose-500/60 bg-rose-500/[0.08]"
                : "border-border/40 hover:border-rose-500/40 hover:bg-rose-500/[0.04]"}`}
          >
            <p className="text-[13px] font-bold">Sí, fue un error real</p>
            <p className="text-[11.5px] text-muted-foreground/65 leading-relaxed mt-0.5">
              El agente respondió mal, inventó algo, no respondió, o dijo que derivaba
              y no generó el ticket. Se mantiene la nota y sigue contando en el margen.
            </p>
          </button>

          <button
            onClick={() => setVeredicto("falso_positivo")}
            className={`w-full text-left rounded-xl border p-3 transition-colors ${
              veredicto === "falso_positivo"
                ? "border-emerald-500/60 bg-emerald-500/[0.08]"
                : "border-border/40 hover:border-emerald-500/40 hover:bg-emerald-500/[0.04]"}`}
          >
            <p className="text-[13px] font-bold">No, estaba bien</p>
            <p className="text-[11.5px] text-muted-foreground/65 leading-relaxed mt-0.5">
              El analizador se equivocó al puntuarla. Deja de contar como error y hay
              que ponerle la nota que merecía.
            </p>
          </button>
        </div>

        {veredicto === "falso_positivo" && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3 space-y-2">
            <Label className="text-[12px] font-semibold">
              ¿Qué nota merecía? <span className="text-rose-500">*</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setNota(n)}
                  className={`w-9 h-9 rounded-lg text-[13px] font-bold transition-colors border ${
                    nota === n
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : "border-border/40 text-muted-foreground hover:border-emerald-500/50 hover:text-foreground"}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[10.5px] text-muted-foreground/50 leading-relaxed">
              Esta nota reemplaza a la del analizador en las métricas. La original
              queda guardada.
            </p>
          </div>
        )}

        {veredicto && (
          <div className="space-y-1.5">
            <Label className="text-[12px] font-semibold">
              Comentario <span className="text-muted-foreground/50 font-normal">(opcional)</span>
            </Label>
            <Textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={2}
              placeholder={veredicto === "error_real"
                ? "Qué hizo mal, para que sirva de ejemplo…"
                : "Por qué estaba bien…"}
              className="text-[12.5px] resize-none"
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCerrar} disabled={guardando} className="text-[12.5px]">
            Cancelar
          </Button>
          <Button
            onClick={() => veredicto && onGuardar(veredicto, nota, comentario)}
            disabled={!veredicto || faltaNota || guardando}
            className="text-[12.5px]"
          >
            {guardando ? "Guardando…" : faltaNota ? "Elegí la nota" : "Guardar revisión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ConversationsAnalytics({ companyId, companyName, isAdminView, onOpenConversation, initialConvData, onInitialConvDataHandled }: Props) {
  const [loading, setLoading]         = useState(true);
  const [summary, setSummary]         = useState<Summary | null>(null);
  /** Cuántas filas se muestran de cada sección. Crece con "Ver más". */
  const [visiblesPorSeccion, setVisiblesPorSeccion] = useState<Record<string, number>>({});
  const [timeline, setTimeline]       = useState<TimelineRow[]>([]);
  const [topics, setTopics]           = useState<TopicRow[]>([]);
  const [segments, setSegments]       = useState<SegmentedConv[]>([]);
  const [range, setRange]             = useState<Range>("30d");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [lastAnalyzed, setLastAnalyzed] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<SegmentedConv | null>(null);
  const [hourlyData, setHourlyData] = useState<{ hour: number; total: number }[]>([]);
  /*
   * Las tres secciones arrancan cerradas.
   *
   * Abiertas, al entrar se veía un muro de cientos de filas y había que bajar
   * mucho para enterarse de qué secciones existen. Cerradas, la pantalla muestra
   * de una el reparto —365 buenas, 32 a revisar, 29 aceptables— y se abre la que
   * importa. El modo revisión las abre igual, porque ahí ya se sabe qué se busca.
   */
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    problema: false, best: false, aceptable: false, revisados: false,
  });
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);
  const [alertStats, setAlertStats] = useState<{ total_clientes_alertados: number; respuestas_manuales_evitadas: number } | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  /** La conversación cuyo veredicto se está escribiendo. */
  const [revisando, setRevisando] = useState<SegmentedConv | null>(null);
  /** Nombres de los operadores, para decir quién revisó en vez de mostrar un uuid. */
  const operadores = useOperadores(companyId);
  const porOperador = useMemo(() => mapaOperadores(operadores), [operadores]);
  const [reviewMode, setReviewMode] = useState(false);
  /**
   * Ids exactos a mostrar, cuando alguien llega desde una alerta que ya sabe
   * cuáles son. Sin esto, "3 conversaciones para revisar" aterrizaba en el filtro
   * general de problemas y mostraba treinta: el mismo criterio calculado dos
   * veces en dos lugares nunca da lo mismo.
   */
  const [idsPedidos, setIdsPedidos] = useState<string[] | null>(null);
  /** Cuántos casos avisó el panel. No es el largo de `idsPedidos`: ahí van dos ids por caso. */
  const [totalPedidos, setTotalPedidos] = useState(0);
  const segmentsRef = useRef<HTMLDivElement>(null);
  const pendingAnalysisRef = useRef<any>(null);
  const { toast } = useToast();

  // ── Reporte de error del agente (tabla agent_feedback) ──
  const [reportConv, setReportConv] = useState<SegmentedConv | null>(null);
  const [reportType, setReportType] = useState("informacion_incorrecta");
  const [reportWrong, setReportWrong] = useState("");
  const [reportExpected, setReportExpected] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  const openReport = (conv: SegmentedConv) => {
    setReportConv(conv);
    setReportType("informacion_incorrecta");
    setReportWrong("");
    setReportExpected("");
  };

  const handleSubmitReport = async () => {
    if (!reportConv) return;
    if (!reportWrong.trim() || !reportExpected.trim()) {
      toast({ title: "Completa todos los campos", variant: "destructive" });
      return;
    }
    setSubmittingReport(true);
    const { data: { user } } = await supabase.auth.getUser();
    const reporterName = (user?.user_metadata?.full_name as string) || user?.email || "—";
    const { error } = await supabase.from("agent_feedback").insert({
      conversation_id: reportConv.conversation_id,
      company_id: companyId,
      reported_by: user?.id ?? null,
      reported_by_name: reporterName,
      wrong_response: reportWrong,
      expected_response: reportExpected,
      error_type: reportType,
    } as any);
    setSubmittingReport(false);
    if (error) {
      toast({ title: "Error al enviar reporte", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✅ Reporte enviado", description: "El administrador revisará el caso." });
    setReportConv(null);
  };

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setSummary(null);
    setTimeline([]);
    setTopics([]);
    setSegments([]);
    setHourlyData([]);
    setQuickFilter(null);
    const { from, to } = dateRange(range);

    const [summRes, timeRes, topRes, segRes, probRes, lastRes, hourRes, alertRes] = await Promise.all([
      supabase.rpc("get_analytics_summary",        { p_company_id: companyId, p_start_date: from.slice(0, 10), p_end_date: to.slice(0, 10) }),
      supabase.rpc("get_analytics_timeline",       { p_company_id: companyId, p_date_from: from, p_date_to: to, p_granularity: granularity }),
      supabase.rpc("get_analytics_topics",         { p_company_id: companyId, p_date_from: from, p_date_to: to, p_limit: 10 }),
      // Vista general (best/aceptable): basta con una muestra reciente acotada.
      supabase.rpc("get_segmented_conversations",  { p_company_id: companyId, p_date_from: from, p_date_to: to, p_segment: null, p_limit: LIMITE_SEGMENTOS[range] }),
      // Requieren revisión humana: se pide POR SEPARADO para no compartir límite con
      // best/aceptable → los problemas nunca se truncan aunque la empresa tenga miles de convs.
      supabase.rpc("get_segmented_conversations",  { p_company_id: companyId, p_date_from: from, p_date_to: to, p_segment: "problema", p_limit: 5000 }),
      supabase.from("conversation_analysis").select("analyzed_at").eq("company_id", companyId)
        .order("analyzed_at", { ascending: false }).limit(1).maybeSingle(),
      (supabase as any).rpc("get_analytics_hourly_volume", { p_company_id: companyId, p_date_from: from, p_date_to: to }),
      (supabase as any).rpc("get_alert_system_stats", { p_company_id: companyId, p_date_from: from, p_date_to: to }),
    ]);

    if (summRes.data) setSummary(summRes.data as Summary);
    if (timeRes.data) setTimeline(timeRes.data as TimelineRow[]);
    if (topRes.data)  setTopics(topRes.data as TopicRow[]);
    if (lastRes.data) setLastAnalyzed(lastRes.data.analyzed_at);
    if (hourRes.data) setHourlyData(hourRes.data as { hour: number; total: number }[]);
    if (alertRes.data) {
      const alertRaw = Array.isArray(alertRes.data) ? alertRes.data[0] : alertRes.data;
      if (alertRaw) setAlertStats(alertRaw as { total_clientes_alertados: number; respuestas_manuales_evitadas: number });
    }

    // Combinar la vista general (best/aceptable) con los problemas completos (llamada aparte),
    // deduplicando por conversación+sesión. normalizeSegment reclasifica por score puro.
    const rawAll = [
      ...((segRes.data ?? []) as SegmentedConv[]),
      ...((probRes.data ?? []) as SegmentedConv[]),
    ];
    const seenKey = new Set<string>();
    let segs: SegmentedConv[] = [];
    for (const r of rawAll.map(normalizeSegment)) {
      const k = `${r.conversation_id}__${r.session_start ?? r.analyzed_at}`;
      if (seenKey.has(k)) continue;
      seenKey.add(k);
      segs.push(r);
    }

    // Enriquecer las problemáticas con el `id` real de conversation_analysis y su estado `reviewed`.
    // El RPC no garantiza un `id` único/correcto por fila, así que lo resolvemos por
    // conversation_id + session_start (clave estable que sí coincide con la tabla).
    const problemConvIds = [...new Set(
      segs.filter(s => s.segment === "problema").map(s => s.conversation_id).filter(Boolean)
    )];
    if (problemConvIds.length > 0) {
      const { data: anaRows } = await (supabase as any)
        .from("conversation_analysis")
        .select("id,conversation_id,session_start,reviewed,veredicto_revision,nota_revisada,nota_original,reviewed_by,reviewed_at")
        .in("conversation_id", problemConvIds);
      if (anaRows?.length) {
        const keyOf = (cid: string, ss: string | null) => `${cid}__${ss ?? ""}`;
        const rowMap = new Map((anaRows as any[]).map((r: any) => [keyOf(r.conversation_id, r.session_start), r]));
        segs = segs.map(s => {
          if (s.segment !== "problema") return s;
          const row = rowMap.get(keyOf(s.conversation_id, s.session_start));
          return row ? {
            ...s, id: row.id, reviewed: !!row.reviewed,
            veredicto_revision: row.veredicto_revision ?? null,
            nota_revisada: row.nota_revisada ?? null,
            nota_original: row.nota_original ?? null,
            reviewed_by: row.reviewed_by ?? null,
            reviewed_at: row.reviewed_at ?? null,
          } : s;
        });
      }
    }
    setSegments(segs);
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyId, range, granularity]);
  // Cambiar de rango o de filtro reinicia el "Ver más": si no, al volver a un rango
  // corto se quedaba pintando cientos de filas que ya no venían al caso.
  useEffect(() => { setVisiblesPorSeccion({}); }, [companyId, range, quickFilter, reviewMode, idsPedidos]);

  // Realtime: reflejar al instante el `reviewed` (p.ej. cuando el backend lo marca
  // al cerrar un ticket "Revisión IA", o cuando otro usuario revisa) sin recargar.
  useEffect(() => {
    if (!companyId) return;
    const matches = (s: { id?: string; conversation_id: string; session_start: string | null }, row: any) =>
      (!!s.id && s.id === row.id) ||
      (s.conversation_id === row.conversation_id && (s.session_start ?? null) === (row.session_start ?? null));
    const ch = (supabase as any)
      .channel(`conv-analysis-reviewed-${companyId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_analysis", filter: `company_id=eq.${companyId}` }, (payload: any) => {
        const row = payload.new;
        if (!row) return;
        setSegments(prev => prev.map(s => matches(s, row) ? { ...s, reviewed: !!row.reviewed } : s));
        setSelectedConv(prev => (prev && matches(prev, row)) ? { ...prev, reviewed: !!row.reviewed } : prev);
      })
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, [companyId]);

  // Deep-link desde el dashboard: activar filtro y recordar qué análisis abrir
  useEffect(() => {
    if (!initialConvData) return;
    onInitialConvDataHandled?.();
    /*
     * Solo se recuerda un análisis si viene su id. Cuando la llamada trae únicamente
     * la intención de revisar —desde la alerta del panel, sin conversación concreta—
     * guardarlo igual hacía que después se buscara `id === undefined`, y eso
     * empataba con la primera fila sin id de la lista: abría un análisis cualquiera,
     * a veces con puntaje 10, que es justo lo contrario de lo que se pidió.
     */
    pendingAnalysisRef.current = initialConvData.analysis_id ? initialConvData : null;
    /*
     * Una sola bolsa con las dos formas de id, y abajo se compara contra los dos
     * campos del segmento. Son uuid, así que no hay riesgo de que uno matchee de
     * casualidad con el campo equivocado.
     */
    const crudos = [
      ...(Array.isArray(initialConvData.ids) ? initialConvData.ids : []),
      ...(Array.isArray((initialConvData as any).convIds) ? (initialConvData as any).convIds : []),
    ].filter(Boolean);
    const ids = crudos.length ? [...new Set(crudos)] : null;
    setIdsPedidos(ids);
    setTotalPedidos(Number((initialConvData as any).total) || (ids?.length ?? 0));
    setReviewMode(true);
    /*
     * Se abren las tres secciones, no solo "problema".
     *
     * Los dos lados no clasifican igual: el panel avisa con score < 8 o sin score,
     * y esta pantalla manda a "problema" solo lo que está bajo 6 —el resto cae en
     * "Aceptables"—. Abriendo únicamente "problema", una conversación que el panel
     * marcó con 7 quedaba dentro de una sección plegada: estaba en la lista, pero
     * no se veía, que para quien mira es lo mismo que no estar.
     */
    setOpenSections(prev => ({ ...prev, problema: true, aceptable: true, best: true, revisados: true }));
    /*
     * También con ids hay que abrir el rango.
     *
     * Se asumía que las conversaciones con problema eran siempre de los últimos
     * días, y no: una que nadie revisó puede ser de hace semanas. Con el rango
     * corto quedaba fuera de `segments` y el filtro por id no la encontraba — el
     * panel avisaba 3 y la lista mostraba 2. La carga es más lenta, pero la
     * alternativa es esconder justo la que lleva más tiempo sin mirar.
     */
    setRange("all");
  }, [initialConvData]);

  // Cuando carguen los segmentos del rango "all", abrir el análisis y hacer scroll
  useEffect(() => {
    if (loading || !pendingAnalysisRef.current) return;
    const data = pendingAnalysisRef.current;
    const id = data.analysis_id as string;
    pendingAnalysisRef.current = null;

    const scrollToRow = () => setTimeout(() => {
      const el = document.querySelector(`[data-analysis-id="${id}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      else segmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);

    // Si está en la lista cargada, usar ese segmento directamente
    const target = segments.find(s => s.id === id);
    if (target) {
      setSelectedConv(target);
      scrollToRow();
      return;
    }

    // No está en la lista (fuera del límite) → traer la fila real de la DB
    (async () => {
      const { data: rows } = await (supabase as any)
        .from("conversation_analysis")
        .select("*")
        .eq("id", id)
        .limit(1);
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) return;
      setSelectedConv({
        id,
        conversation_id: row.conversation_id,
        profile_name: data.profile_name ?? null,
        wa_id: data.wa_id ?? "",
        segment: "problema",
        escalated: row.resolution_type === "escalado" || (row.specialist_count ?? 0) > 0,
        bot_score: row.bot_score ?? null,
        resolution_type: row.resolution_type ?? "",
        sentiment: row.customer_sentiment ?? "neutral",
        hallucination: row.hallucination_detected ?? false,
        failed_response: row.failed_to_respond ?? false,
        resolved_auto: row.resolved_autonomously ?? false,
        topics: row.topics ?? [],
        summary: row.summary ?? "",
        bot_errors: row.bot_errors ?? [],
        bot_messages: 0,
        human_messages: 0,
        analyzed_at: row.analyzed_at ?? new Date().toISOString(),
        session_start: row.session_start ?? null,
        session_end: row.session_end ?? null,
        reviewed: row.reviewed ?? false,
      });
      scrollToRow();
    })();
  }, [loading, segments]);

  /*
   * Revisar dejó de ser un interruptor.
   *
   * Antes marcaba "visto" y nada más: no quedaba registro de si el agente se había
   * equivocado de verdad, y una conversación mal puntuada seguía contando como
   * error para siempre. Ahora hay que decir cuál de las dos cosas fue, y si estaba
   * bien hay que ponerle la nota que merecía — la RPC rechaza el falso positivo sin
   * nota, justo para que nadie limpie la métrica a ciegas.
   */
  const guardarVeredicto = async (
    analysisId: string,
    veredicto: "error_real" | "falso_positivo",
    nota: number | null,
    comentario: string,
  ) => {
    if (!analysisId) return;
    setReviewingId(analysisId);
    /*
     * El revisor viaja explícito.
     *
     * La RPC lo toma de `auth.uid()` si no se manda, pero el backend pidió el
     * parámetro para el caso de la bandeja. Se lee del usuario autenticado, no de
     * un estado del portal: que la métrica diga quién revisó solo sirve si el
     * nombre no se puede elegir desde acá.
     */
    const { data: sesion } = await supabase.auth.getUser();
    const revisor = sesion?.user?.id ?? null;
    const { error } = await (supabase as any).rpc("revisar_analisis", {
      p_analysis_id: analysisId,
      p_veredicto: veredicto,
      ...(revisor ? { p_revisor: revisor } : {}),
      ...(veredicto === "falso_positivo" ? { p_nota: nota } : {}),
      ...(comentario.trim() ? { p_comentario: comentario.trim() } : {}),
    });
    setReviewingId(null);
    if (error) {
      toast({ title: "No se pudo guardar la revisión", description: error.message, variant: "destructive" });
      return;
    }
    const parche = {
      reviewed: true,
      veredicto_revision: veredicto,
      nota_revisada: veredicto === "falso_positivo" ? nota : null,
      reviewed_at: new Date().toISOString(),
    };
    setSegments(prev => prev.map(s => (s.id && s.id === analysisId ? { ...s, ...parche } : s)));
    setSelectedConv(prev => (prev && prev.id === analysisId ? { ...prev, ...parche } : prev));
    setRevisando(null);
    toast({
      title: veredicto === "error_real" ? "Marcada como error real" : `Corregida a nota ${nota}`,
      description: veredicto === "error_real"
        ? "Queda contada en el margen de error."
        : "Deja de contar como error y la métrica usa la nota nueva.",
    });
  };

  /** Abre la pregunta en vez de marcar directo. */
  const markReviewed = (analysisId: string) => {
    const seg = segments.find(x => x.id === analysisId) ?? (selectedConv?.id === analysisId ? selectedConv : null);
    if (seg) setRevisando(seg);
  };

  const isEmpty = !loading && segments.length === 0 && (!summary || summary.total_conversations === 0);
  const avgScore = summary?.avg_bot_score ?? null;
  const scoreColor = SCORE_COLOR(avgScore);

  function handleQuickFilter(filter: QuickFilter) {
    setReviewMode(false);
    setQuickFilter(prev => prev === filter ? null : filter);
    setOpenSections({ problema: true, best: true, aceptable: true });
    setTimeout(() => segmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  const filteredSegments = idsPedidos
    ? segments.filter(s => idsPedidos.includes(s.id) || idsPedidos.includes(s.conversation_id))
    : reviewMode
    ? segments.filter(s => s.segment === "problema" && !s.reviewed && (s.bot_score == null || s.bot_score < 8))
    : quickFilter
      ? segments.filter(s => {
          if (quickFilter === "resolved")      return s.resolved_auto;
          if (quickFilter === "escalated")     return s.escalated === true;
          if (quickFilter === "sentiment_pos") return s.sentiment === "positivo";
          if (quickFilter === "sentiment_neg") return s.sentiment === "negativo";
          return true;
        })
      : segments;

  const resolutionPieData = summary
    ? Object.entries(summary.resolution_type_distribution ?? {}).filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: RESOLUTION_LABELS[k] ?? k, value: v, color: RESOLUTION_COLORS[k] }))
    : [];

  const sentimentPieData = summary
    ? [
        { name: "Positivo", value: summary.sentiment_distribution?.positivo ?? 0, color: SENTIMENT_COLORS.positivo },
        { name: "Neutral",  value: summary.sentiment_distribution?.neutral  ?? 0, color: SENTIMENT_COLORS.neutral },
        { name: "Negativo", value: summary.sentiment_distribution?.negativo ?? 0, color: SENTIMENT_COLORS.negativo },
      ].filter(d => d.value > 0)
    : [];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Rendimiento del <span className="text-primary">Agente IA</span>
            </h1>
            <p className="text-[12px] text-muted-foreground/60 mt-0.5">{companyName} — análisis automático de conversaciones</p>
            {lastAnalyzed && (
              <p className="text-[11px] text-muted-foreground/50 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Último análisis: {format(parseISO(lastAnalyzed), "d 'de' MMMM, HH:mm", { locale: es })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Rango</span>
              <div className="flex rounded-xl border border-border/40 bg-card/60 overflow-hidden text-[11px] font-semibold">
                {(["7d", "30d", "90d", "all"] as Range[]).map(r => (
                  <button key={r} onClick={() => { setReviewMode(false); setRange(r); }}
                    className={`px-3 py-1.5 transition-colors ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
                    {r === "7d" ? "7 días" : r === "30d" ? "30 días" : r === "90d" ? "90 días" : "Todo"}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </motion.div>

        {loading && <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary/40" /></div>}
        {!loading && isEmpty && (
          <EmptyState
            hasHistoricData={lastAnalyzed !== null}
            onExpandRange={range !== "all" ? () => setRange("all") : undefined}
          />
        )}

        {!loading && !isEmpty && (
          <>
            {/* KPI Cards — solo si el RPC de summary tiene datos */}
            {summary && summary.total_conversations > 0 && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard icon={MessageCircle} label="Conversaciones analizadas"
                    value={summary.total_conversations.toLocaleString("es-CL")}
                    sub="en el rango seleccionado" color="#3b82f6" delay={0} />
                  <KpiCard icon={Zap} label="Resueltas autónomamente"
                    value={`${summary.ai_resolution_rate}%`}
                    sub={`${summary.resolved_autonomously} conversaciones`} color="#10b981" delay={0.06}
                    onSubClick={() => handleQuickFilter("resolved")}
                    subActive={quickFilter === "resolved"}
                    tooltip="Conversaciones que el agente resolvió por sí solo, sin necesidad de escalar a un especialista humano. No incluye las de baja puntuación." />
                  <KpiCard icon={UserCheck} label="Derivados"
                    value={`${summary.escalation_rate}%`}
                    sub={`${summary.escalated_count} conversaciones`} color="#f59e0b" delay={0.12}
                    onSubClick={() => handleQuickFilter("escalated")}
                    subActive={quickFilter === "escalated"}
                    tooltip="Conversaciones que se derivaron y escalaron a un especialista humano, pero en las que el agente igual recolectó información relevante para facilitar la solución al cliente." />
                  <KpiCard icon={Clock} label="Tiempo ahorrado"
                    value={summary.time_saved_hours != null ? `${summary.time_saved_hours.toLocaleString("es-CL")} hrs` : "—"}
                    sub={`~${summary.human_overhead_minutes} min/caso`}
                    color="#8b5cf6" delay={0.18} />
                  {isAdminView && (
                    <KpiCard icon={TrendingUp} label="Score promedio del agente"
                      value={avgScore !== null ? avgScore.toFixed(1) : "—"}
                      sub="Escala 1 – 10 · solo admin" color={scoreColor} delay={0.24} />
                  )}
                </div>
                {alertStats && alertStats.total_clientes_alertados > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <KpiCard icon={Bell} label="Sistema de alerta — clientes notificados"
                      value={alertStats.total_clientes_alertados.toLocaleString("es-CL")}
                      sub="Clientes que recibieron la alerta"
                      color="#f59e0b" delay={0.19} />
                    <KpiCard icon={Zap} label="Sistema de alerta — respuestas evitadas"
                      value={alertStats.respuestas_manuales_evitadas.toLocaleString("es-CL")}
                      sub="Respuestas manuales no necesarias"
                      color="#f59e0b" delay={0.21} />
                  </div>
                )}
              </>
            )}

            {/* Banner de contexto — visible solo para clientes */}
            {!isAdminView && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
                <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
                  <TrendingUp className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-[12px] text-muted-foreground/70 leading-relaxed">
                    Estas métricas son analizadas por nuestro equipo para mejorar continuamente el rendimiento del agente de IA.
                    Si ves un score bajo, nos encargamos de ajustar el agente automáticamente.
                    Nuestro equipo trabaja para reducir de forma gradual los problemas detectados, de modo que con el tiempo cada vez sean menos los errores del agente en ARTORIA.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Segmentos de conversaciones */}
            {segments.length > 0 && (() => {
              const activeSegments = filteredSegments;
              /*
               * Lo revisado sale de su sección de origen.
               *
               * Si no, una conversación dictaminada aparecería dos veces: en
               * "Requieren revisión humana" —donde ya no hay nada que hacer— y en
               * "Revisados". La lista de pendientes tiene que quedar solo con lo
               * pendiente, que es para lo que se mira.
               */
              const bySegment = (s: Segment | "revisados") =>
                s === "revisados"
                  ? activeSegments.filter(c => c.reviewed)
                  : activeSegments.filter(c => c.segment === s && !(s === "problema" && c.reviewed));
              const SEGMENT_CONFIG: { key: Segment; label: string; icon: React.ElementType; color: string; desc: string }[] = [
                { key: "best",     label: "Mejor rendimiento",         icon: Award,         color: "#10b981", desc: "Alto score, resueltas de forma autónoma" },
                { key: "problema", label: "Requieren revisión humana", icon: AlertTriangle, color: "#ef4444", desc: "Probables alucinaciones o respuestas incoherentes del agente. Este apartado ayuda a la revisión de problemas del agente." },
                { key: "aceptable", label: "Aceptables",               icon: CheckCircle2,  color: "#94a3b8", desc: "Score intermedio sin incidencias destacadas" },
                /*
                 * No es un segmento del analizador: es un estado de la revisión.
                 * Va en la misma lista para que use exactamente la misma tarjeta
                 * —análisis, resumen, puntaje, errores— y no una fila resumida que
                 * esconda la mitad de lo que hay que auditar.
                 */
                { key: "revisados" as any, label: "Revisados", icon: CheckCircle2, color: "#22c55e",
                  desc: "Ya las miró alguien y dejó su veredicto. Se pueden corregir." },
              ];
              const QUICK_FILTER_LABELS: Record<NonNullable<QuickFilter>, string> = {
                resolved: "resueltas sin humano",
                escalated: "requirieron intervención",
                sentiment_pos: "sentimiento positivo",
                sentiment_neg: "sentimiento negativo",
              };
              return (
                <motion.div
                  ref={segmentsRef}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}
                  className="space-y-3"
                >
                  {/* Modo revisión activo */}
                  {reviewMode && (
                    <div className="flex items-center gap-2 text-[11px] rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      <span className="text-red-400 font-semibold">Modo revisión:</span>
                      <span className="text-muted-foreground/70">
                        {idsPedidos
                          ? activeSegments.length === totalPedidos
                            ? `mostrando las ${activeSegments.length} conversaciones que te avisó el panel`
                            /* Alguna quedó fuera del rango cargado: decirlo evita que
                               parezca que el panel contó de más. */
                            : `mostrando ${activeSegments.length} de las ${totalPedidos} que te avisó el panel`
                          : `mostrando solo casos que requieren revisión (${activeSegments.length})`}
                      </span>
                      <button
                        onClick={() => { setReviewMode(false); setIdsPedidos(null); setRange("30d"); }}
                        className="ml-auto text-muted-foreground/50 hover:text-foreground underline underline-offset-2"
                      >
                        Salir
                      </button>
                    </div>
                  )}
                  {/* Indicador de filtro activo */}
                  {!reviewMode && quickFilter && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      Mostrando <strong className="text-foreground">{activeSegments.length} conversaciones</strong> {QUICK_FILTER_LABELS[quickFilter]}
                      <button
                        onClick={() => setQuickFilter(null)}
                        className="ml-1 text-muted-foreground/50 hover:text-foreground underline underline-offset-2"
                      >
                        Quitar filtro
                      </button>
                    </div>
                  )}
                  {SEGMENT_CONFIG.map(({ key, label, icon: Icon, color, desc }) => {
                    const todos = bySegment(key);
                    if (todos.length === 0) return null;
                    const isOpen = openSections[key];
                    // Se piden todas, pero se pintan de a poco: en "Todo" una sección
                    // puede traer más de mil y el navegador se arrastra.
                    const visibles = visiblesPorSeccion[key] ?? PASO_LISTA;
                    const items = todos.slice(0, visibles);
                    return (
                      <Card key={key} className="border-border/20 bg-card/60 rounded-2xl overflow-hidden" style={{ borderColor: `${color}25` }}>
                        {/* Header colapsable */}
                        <button
                          onClick={() => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
                              <Icon className="w-4 h-4" style={{ color }} />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-bold">{label}</p>
                              <p className="text-[10px] text-muted-foreground/50">{desc}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge className="text-[10px] px-2 border" style={{ background: `${color}15`, color, borderColor: `${color}30` }}>
                              {todos.length}
                            </Badge>
                            <ChevronDown className={`w-4 h-4 text-muted-foreground/40 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </div>
                        </button>

                        {/* Rows */}
                        {isOpen && (
                          <div className="px-4 pb-4 space-y-2 border-t border-border/20 pt-3">
                            {items.map((p) => {
                              const displayDate = p.session_start ?? p.analyzed_at;
                              const isLegacy = !p.session_start;
                              const rowKey = `${p.conversation_id}__${p.session_start ?? p.analyzed_at}`;
                              return (
                              <div key={rowKey} className="relative group/row" data-analysis-id={p.id} data-conversation-id={p.conversation_id}>
                              <button
                                onClick={() => setSelectedConv(p)}
                                className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left ${
                                  key === "problema" && p.reviewed
                                    ? "border-emerald-500/25 bg-emerald-500/[0.07] hover:bg-emerald-500/10"
                                    : "border-border/30 bg-background/40 hover:bg-muted/40 hover:border-border/60"
                                }`}
                              >
                                <ScoreCircle score={p.bot_score} segment={p.segment} isAdmin={isAdminView}
                                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold flex-shrink-0"
                                  iconSize={18} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="text-[12px] font-semibold truncate">{p.profile_name || p.wa_id}</span>
                                    {isAdminView && p.hallucination && <Badge className="text-[9px] px-1.5 py-0 bg-red-500/15 text-red-500 border-red-500/30">Alucinó</Badge>}
                                    {isAdminView && p.failed_response && <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/15 text-amber-500 border-amber-500/30">Sin respuesta</Badge>}
                                    {p.resolved_auto && <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Autónomo</Badge>}
                                    {p.escalated && <Badge className="text-[9px] px-1.5 py-0 bg-orange-500/15 text-orange-500 border-orange-500/30"><Users className="w-2.5 h-2.5 inline mr-0.5" />Intervino humano</Badge>}
                                    <Badge className="text-[9px] px-1.5 py-0 border" style={{
                                      background: `${SENTIMENT_COLORS[p.sentiment]}15`,
                                      color: SENTIMENT_COLORS[p.sentiment],
                                      borderColor: `${SENTIMENT_COLORS[p.sentiment]}30`,
                                    }}>
                                      {p.sentiment === "positivo" ? <ThumbsUp className="w-2.5 h-2.5 inline mr-0.5" /> :
                                       p.sentiment === "negativo" ? <ThumbsDown className="w-2.5 h-2.5 inline mr-0.5" /> :
                                       <Minus className="w-2.5 h-2.5 inline mr-0.5" />}
                                      {p.sentiment}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground/70 line-clamp-2">{p.summary}</p>
                                </div>
                                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                  <span className="text-[10px] text-muted-foreground/60 font-medium">
                                    {format(parseISO(displayDate), "d 'de' MMM", { locale: es })}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground/40">
                                    {format(parseISO(displayDate), "HH:mm", { locale: es })}
                                  </span>
                                  {isLegacy && (
                                    <span className="text-[8px] text-muted-foreground/30 uppercase tracking-wide">anterior</span>
                                  )}
                                </div>
                              </button>
                              {/*
                                * Qué se decidió y quién: la línea que convierte la
                                * tarjeta en algo auditable. La nota vieja tachada
                                * porque lo que importa es de dónde venía — eso es lo
                                * que salió del margen de error.
                                */}
                              {p.reviewed && (
                                <div className="mt-1.5 pl-12 text-[11px] text-muted-foreground/60 flex items-center gap-1.5 flex-wrap">
                                  {p.veredicto_revision === "falso_positivo" ? (
                                    <span className="font-bold text-emerald-500">Estaba bien</span>
                                  ) : p.veredicto_revision === "error_real" ? (
                                    <span className="font-bold text-rose-500">Error real</span>
                                  ) : (
                                    <span className="text-muted-foreground/45">revisión anterior, sin veredicto</span>
                                  )}
                                  {p.nota_revisada != null && (
                                    <>
                                      <span className="text-muted-foreground/30">·</span>
                                      <span className="line-through text-muted-foreground/40 tabular-nums">
                                        {p.nota_original ?? p.bot_score}
                                      </span>
                                      <span className="text-muted-foreground/40">→</span>
                                      <strong className="text-emerald-500 tabular-nums">{p.nota_revisada}</strong>
                                    </>
                                  )}
                                  {p.reviewed_by && porOperador[p.reviewed_by] && (
                                    <>
                                      <span className="text-muted-foreground/30">·</span>
                                      revisó {porOperador[p.reviewed_by].nombre}
                                    </>
                                  )}
                                  {p.reviewed_at && (
                                    <>
                                      <span className="text-muted-foreground/30">·</span>
                                      {format(parseISO(p.reviewed_at), "d MMM", { locale: es })}
                                    </>
                                  )}
                                </div>
                              )}
                              {(key === "problema" || (key as string) === "revisados") && (
                                <div className="flex items-center gap-2 mt-1.5 pl-12">
                                  <button
                                    onClick={() => markReviewed(p.id)}
                                    disabled={reviewingId === p.id}
                                    className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all ${
                                      p.reviewed
                                        ? "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600"
                                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/40 hover:bg-emerald-500 hover:text-white"
                                    }`}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    {reviewingId === p.id
                                      ? "Guardando..."
                                      : !p.reviewed ? "Revisar"
                                      : p.veredicto_revision ? "Cambiar veredicto"
                                      : "Dictaminar"}
                                  </button>
                                  <button
                                    onClick={() => openReport(p)}
                                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-orange-500/40 bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white transition-all"
                                  >
                                    <Flag className="w-3.5 h-3.5" />
                                    Reportar
                                  </button>
                                </div>
                              )}
                              </div>
                              );
                            })}
                            {todos.length > items.length && (
                              <button
                                onClick={() => setVisiblesPorSeccion(p => ({ ...p, [key]: (p[key] ?? PASO_LISTA) + PASO_LISTA }))}
                                className="w-full text-[11px] font-semibold text-muted-foreground/70 hover:text-foreground py-2 rounded-xl border border-border/30 hover:bg-muted/20 transition-colors"
                              >
                                Ver más — quedan {(todos.length - items.length).toLocaleString("es-CL")}
                              </button>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </motion.div>
              );
            })()}
          </>
        )}
      </div>

      {/* Panel de detalle */}
      <ConvDetailSheet
        conv={selectedConv}
        isAdminView={isAdminView}
        onClose={() => setSelectedConv(null)}
        onOpenInbox={onOpenConversation}
        onMarkReviewed={(id) => markReviewed(id)}
        reviewingId={reviewingId}
      />

      {/*
        * La pregunta que faltaba.
        *
        * Marcar "revisado" sin decir qué pasó dejaba dos cosas sin registrar: si el
        * agente se equivocó de verdad, y cuánto valía la conversación si no. Sin
        * eso, una mal puntuada contaba como error para siempre y el margen no se
        * podía corregir nunca.
        */}
      <DialogoVeredicto
        conv={revisando}
        guardando={!!revisando && reviewingId === revisando.id}
        onCerrar={() => setRevisando(null)}
        onGuardar={(veredicto, nota, comentario) =>
          revisando?.id && guardarVeredicto(revisando.id, veredicto, nota, comentario)}
      />

      {/* Modal de reporte de error del agente */}
      <Dialog open={!!reportConv} onOpenChange={(o) => { if (!o) setReportConv(null); }}>
        <DialogContent className="border-border/30 bg-card" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Flag className="w-4 h-4 text-orange-500" />
              Reportar problema del agente
            </DialogTitle>
          </DialogHeader>
          {reportConv && (
            <p className="text-[12px] text-muted-foreground/70 -mt-1">
              Conversación de <span className="font-semibold text-foreground">{reportConv.profile_name || reportConv.wa_id}</span>
            </p>
          )}
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Tipo de problema</Label>
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
              <Textarea value={reportWrong} onChange={e => setReportWrong(e.target.value)} className="resize-none" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>¿Qué debería haber respondido?</Label>
              <Textarea value={reportExpected} onChange={e => setReportExpected(e.target.value)} className="resize-none" rows={3} />
            </div>
          </div>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReportConv(null)}>Cancelar</Button>
            <Button onClick={handleSubmitReport} disabled={submittingReport} className="bg-orange-500 hover:bg-orange-600 text-white">
              {submittingReport ? "Enviando..." : "Enviar reporte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
