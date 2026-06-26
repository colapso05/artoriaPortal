import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Bot, AlertTriangle, CheckCircle2, MessageCircle, TrendingUp,
  ThumbsUp, ThumbsDown, Minus, Clock, Loader2, RefreshCw,
  Zap, Tag, ExternalLink, Lightbulb, Star, ChevronDown, Users, Award,
} from "lucide-react";
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

type Segment = "best" | "errors" | "escalated" | "neutral";

interface SegmentedConv {
  id: string;
  conversation_id: string;
  profile_name: string | null;
  wa_id: string;
  segment: Segment;
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
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SCORE_COLOR = (s: number | null) => {
  if (s === null) return "#94a3b8";
  if (s >= 8) return "#10b981";
  if (s >= 6) return "#f59e0b";
  return "#ef4444";
};

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

function dateRange(r: Range) {
  const to = new Date();
  const from = r === "all"
    ? new Date("2020-01-01")
    : subDays(to, r === "7d" ? 7 : r === "30d" ? 30 : 90);
  return { from: from.toISOString(), to: to.toISOString() };
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color, delay = 0, onSubClick, subActive }: {
  icon: React.ElementType; label: string; value: React.ReactNode;
  sub?: string; color: string; delay?: number;
  onSubClick?: () => void;
  subActive?: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay, duration: 0.35 }}>
      <Card className="border rounded-2xl overflow-hidden bg-card/60" style={{ borderColor: `${color}30`, background: `linear-gradient(135deg, ${color}12, ${color}05)` }}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">{label}</p>
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

function renderMedia(content: string, media_url: string | null, isBot: boolean) {
  if (!media_url) return <p className="whitespace-pre-wrap break-words">{content}</p>;

  const type = detectMediaType(media_url, content);

  if (type === "image") {
    return (
      <img
        src={media_url}
        alt="Imagen"
        className="max-w-full rounded-lg cursor-pointer mt-1"
        style={{ maxWidth: 260 }}
        onClick={() => window.open(media_url, "_blank")}
      />
    );
  }

  if (type === "audio") {
    return (
      <div className="mt-1">
        <audio controls className="rounded-lg" style={{ width: 240, height: 36 }} preload="metadata">
          <source src={media_url} type="audio/ogg" />
          <source src={media_url} type="audio/mpeg" />
        </audio>
      </div>
    );
  }

  if (type === "video") {
    return (
      <video controls className="max-w-full rounded-lg mt-1" style={{ maxWidth: 260 }} preload="metadata" playsInline>
        <source src={media_url} />
      </video>
    );
  }

  if (type === "document") {
    return (
      <a
        href={media_url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-1.5 mt-1 underline text-[12px] ${isBot ? "text-indigo-200" : "text-primary"}`}
      >
        📄 {content.replace(/^📄\s*/, "") || "Descargar documento"}
      </a>
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

function ConvDetailSheet({ conv, allSegments, isAdminView, onClose, onOpenInbox }: {
  conv: SegmentedConv | null;
  allSegments: SegmentedConv[];
  isAdminView?: boolean;
  onClose: () => void;
  onOpenInbox?: (convId: string) => void;
}) {
  const [messages, setMessages] = useState<ConvMessage[]>([]);
  const [analysis, setAnalysis] = useState<ConvAnalysis | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeConv, setActiveConv] = useState<SegmentedConv | null>(null);

  // Todas las sesiones del mismo conversation_id, ordenadas más reciente primero
  const sessions = conv
    ? allSegments
        .filter(s => s.conversation_id === conv.conversation_id && s.session_start)
        .sort((a, b) => (a.session_start! > b.session_start! ? -1 : 1))
    : [];

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
      anaQuery = anaQuery.is("session_start", null).order("analyzed_at", { ascending: false });
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
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-4xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/30 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-extrabold text-white flex-shrink-0"
                style={{ background: SCORE_COLOR(display?.bot_score ?? null) }}
              >
                {display?.bot_score ?? "?"}
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-sm font-bold truncate">
                  {display?.profile_name || display?.wa_id}
                </SheetTitle>
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
                            <div
                              className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-extrabold text-white flex-shrink-0"
                              style={{ background: SCORE_COLOR(s.bot_score) }}
                            >
                              {s.bot_score ?? "?"}
                            </div>
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
                          relative max-w-[80%] px-3.5 py-2 rounded-2xl text-[12px] leading-relaxed shadow-sm
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
                          {renderMedia(msg.content, msg.media_url, isBot)}
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
                    </div>

                    {/* Flags de problemas */}
                    <div className="space-y-1.5">
                      {[
                        { flag: analysis.hallucination_detected, label: "Alucinación detectada",   color: "#ef4444", icon: AlertTriangle },
                        { flag: analysis.failed_to_respond,     label: "Preguntas sin responder", color: "#f59e0b", icon: AlertTriangle },
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

export default function ConversationsAnalytics({ companyId, companyName, isAdminView, onOpenConversation }: Props) {
  const [loading, setLoading]         = useState(true);
  const [summary, setSummary]         = useState<Summary | null>(null);
  const [timeline, setTimeline]       = useState<TimelineRow[]>([]);
  const [topics, setTopics]           = useState<TopicRow[]>([]);
  const [segments, setSegments]       = useState<SegmentedConv[]>([]);
  const [range, setRange]             = useState<Range>("30d");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [lastAnalyzed, setLastAnalyzed] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<SegmentedConv | null>(null);
  const [hourlyData, setHourlyData] = useState<{ hour: number; total: number }[]>([]);
  const [openSections, setOpenSections] = useState<Record<Segment, boolean>>({
    best: true, errors: true, escalated: true, neutral: false,
  });
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);
  const segmentsRef = useRef<HTMLDivElement>(null);

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

    const [summRes, timeRes, topRes, segRes, lastRes, hourRes] = await Promise.all([
      supabase.rpc("get_analytics_summary",        { p_company_id: companyId, p_start_date: from.slice(0, 10), p_end_date: to.slice(0, 10) }),
      supabase.rpc("get_analytics_timeline",       { p_company_id: companyId, p_date_from: from, p_date_to: to, p_granularity: granularity }),
      supabase.rpc("get_analytics_topics",         { p_company_id: companyId, p_date_from: from, p_date_to: to, p_limit: 10 }),
      supabase.rpc("get_segmented_conversations",  { p_company_id: companyId, p_date_from: from, p_date_to: to, p_segment: null, p_limit: 100 }),
      supabase.from("conversation_analysis").select("analyzed_at").eq("company_id", companyId)
        .order("analyzed_at", { ascending: false }).limit(1).maybeSingle(),
      (supabase as any).rpc("get_analytics_hourly_volume", { p_company_id: companyId, p_date_from: from, p_date_to: to }),
    ]);

    if (summRes.data) setSummary(summRes.data as Summary);
    if (timeRes.data) setTimeline(timeRes.data as TimelineRow[]);
    if (topRes.data)  setTopics(topRes.data as TopicRow[]);
    if (segRes.data)  setSegments(segRes.data as SegmentedConv[]);
    if (lastRes.data) setLastAnalyzed(lastRes.data.analyzed_at);
    if (hourRes.data) setHourlyData(hourRes.data as { hour: number; total: number }[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyId, range, granularity]);

  const isEmpty = !loading && segments.length === 0 && (!summary || summary.total_conversations === 0);
  const avgScore = summary?.avg_bot_score ?? null;
  const scoreColor = SCORE_COLOR(avgScore);

  function handleQuickFilter(filter: QuickFilter) {
    setQuickFilter(prev => prev === filter ? null : filter);
    setOpenSections({ best: true, errors: true, escalated: true, neutral: true });
    setTimeout(() => segmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  const filteredSegments = quickFilter
    ? segments.filter(s => {
        if (quickFilter === "resolved")      return s.resolved_auto;
        if (quickFilter === "escalated")     return s.segment === "escalated";
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
                  <button key={r} onClick={() => setRange(r)}
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
                    sub={`${summary.resolved_autonomously} resueltas sin humano`} color="#3b82f6" delay={0}
                    onSubClick={() => handleQuickFilter("resolved")}
                    subActive={quickFilter === "resolved"} />
                  <KpiCard icon={TrendingUp} label="Score promedio del agente"
                    value={avgScore !== null ? avgScore.toFixed(1) : "—"}
                    sub="Escala 1 – 10" color={scoreColor} delay={0.06} />
                  <KpiCard icon={Zap} label="Resueltas autónomamente"
                    value={`${summary.ai_resolution_rate}%`}
                    sub={`${summary.resolved_autonomously} conversaciones`} color="#10b981" delay={0.12}
                    onSubClick={() => handleQuickFilter("resolved")}
                    subActive={quickFilter === "resolved"} />
                  <KpiCard icon={Clock} label="Tiempo ahorrado"
                    value={summary.time_saved_hours != null ? `${summary.time_saved_hours.toLocaleString("es-CL")} hrs` : "—"}
                    sub={summary.time_saved_minutes != null
                      ? `${summary.time_saved_minutes.toLocaleString("es-CL")} min · ~${summary.human_overhead_minutes} min/caso`
                      : `~${summary.human_overhead_minutes} min/caso configurados`}
                    color="#8b5cf6" delay={0.18} />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard icon={CheckCircle2} label="Tasa de contención"
                    value={`${summary.containment_rate}%`}
                    sub="Casos no derivados a humano" color="#6366f1" delay={0.22} />
                  <KpiCard icon={Users} label="Escalación a humano"
                    value={`${summary.escalation_rate}%`}
                    sub={`${summary.escalated_count} conversaciones intervenidas`}
                    color={summary.escalated_count > 0 ? "#f59e0b" : "#10b981"} delay={0.26}
                    onSubClick={() => handleQuickFilter("escalated")}
                    subActive={quickFilter === "escalated"} />
                  <KpiCard icon={ThumbsUp} label="Sentimiento positivo"
                    value={summary.total_conversations > 0
                      ? `${Math.round(((summary.sentiment_distribution?.positivo ?? 0) / summary.total_conversations) * 100)}%`
                      : "—"}
                    sub={`${summary.sentiment_distribution?.positivo ?? 0} clientes`} color="#10b981" delay={0.3}
                    onSubClick={() => handleQuickFilter("sentiment_pos")}
                    subActive={quickFilter === "sentiment_pos"} />
                  <KpiCard icon={ThumbsDown} label="Sentimiento negativo"
                    value={summary.total_conversations > 0
                      ? `${Math.round(((summary.sentiment_distribution?.negativo ?? 0) / summary.total_conversations) * 100)}%`
                      : "—"}
                    sub={`${summary.sentiment_distribution?.negativo ?? 0} clientes`}
                    color={(summary.sentiment_distribution?.negativo ?? 0) > 0 ? "#ef4444" : "#94a3b8"} delay={0.34}
                    onSubClick={() => handleQuickFilter("sentiment_neg")}
                    subActive={quickFilter === "sentiment_neg"} />
                </div>
              </>
            )}

            {/* Banner de contexto — visible solo para clientes */}
            {!isAdminView && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
                <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
                  <TrendingUp className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-[12px] text-muted-foreground/70 leading-relaxed">
                    Estas métricas son analizadas por nuestro equipo para mejorar continuamente el rendimiento del agente de IA.
                    Si ves un score bajo o escalaciones frecuentes, nos encargamos de ajustar el agente automáticamente.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Segmentos de conversaciones */}
            {segments.length > 0 && (() => {
              const activeSegments = filteredSegments;
              const bySegment = (s: Segment) => activeSegments.filter(c => c.segment === s);
              const SEGMENT_CONFIG: { key: Segment; label: string; icon: React.ElementType; color: string; desc: string }[] = [
                { key: "best",      label: "Mejor rendimiento",  icon: Award,          color: "#10b981", desc: "Alto score, resueltas de forma autónoma" },
                { key: "errors",    label: "Con errores",        icon: AlertTriangle,  color: "#ef4444", desc: "Alucinaciones, preguntas sin responder o score bajo" },
                { key: "escalated", label: "Requirieron humano", icon: Users,          color: "#f59e0b", desc: "Intervino un operador durante la conversación" },
                { key: "neutral",   label: "Aceptables",         icon: CheckCircle2,   color: "#94a3b8", desc: "Score intermedio sin incidencias destacadas" },
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
                  {/* Indicador de filtro activo */}
                  {quickFilter && (
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
                    const items = bySegment(key);
                    if (items.length === 0) return null;
                    const isOpen = openSections[key];
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
                              {items.length}
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
                              <button
                                key={rowKey}
                                onClick={() => setSelectedConv(p)}
                                className="w-full flex items-start gap-3 p-3 rounded-xl border border-border/30 bg-background/40 hover:bg-muted/40 hover:border-border/60 transition-all text-left group"
                              >
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold text-white flex-shrink-0"
                                  style={{ background: SCORE_COLOR(p.bot_score) }}>
                                  {p.bot_score ?? "?"}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="text-[12px] font-semibold truncate">{p.profile_name || p.wa_id}</span>
                                    {p.hallucination && <Badge className="text-[9px] px-1.5 py-0 bg-red-500/15 text-red-500 border-red-500/30">Alucinó</Badge>}
                                    {p.failed_response && <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/15 text-amber-500 border-amber-500/30">Sin respuesta</Badge>}
                                    {p.resolved_auto && <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Autónomo</Badge>}
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
                              );
                            })}
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
        allSegments={segments}
        isAdminView={isAdminView}
        onClose={() => setSelectedConv(null)}
        onOpenInbox={onOpenConversation}
      />
    </div>
  );
}
