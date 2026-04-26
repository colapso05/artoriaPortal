import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Ticket, MessageCircle, AlertTriangle,
  Clock, CheckCircle2, TrendingUp, ArrowRight, Inbox,
  BarChart3, PieChart as PieChartIcon,
  CreditCard,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import ScheduleWidget from "@/components/dashboard/schedule/ScheduleWidget";

interface ClientDashboardProps {
  companyId: string | null;
  companyName: string;
  userId: string;
  userName: string;
  userRole?: string;
  operatorRoles?: string[];
  onConversationClick?: (conversationId: string) => void;
  onNavigateToTickets?: (status: string) => void;
  creditsEnabled?: boolean;
  onNavigateToCredits?: () => void;
  onNavigateToConversations?: () => void;
  onNavigateToSchedule?: () => void;
}

interface CompanyCredits {
  balance: number;
  total_purchased: number;
  total_used: number;
}

interface TicketStats {
  open: number;
  inProgress: number;
  resolved: number;
}

const CHART_COLORS = [
  "hsl(280, 100%, 70%)",
  "hsl(200, 80%, 55%)",
  "hsl(150, 60%, 50%)",
  "hsl(40, 90%, 55%)",
  "hsl(0, 70%, 55%)",
];

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.08, duration: 0.4 },
  }),
};

const categoryLabels: Record<string, string> = {
  soporte_tecnico: "Soporte Técnico",
  consulta_comercial: "Consulta Comercial",
  ventas: "Ventas",
  pagos: "Pagos",
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/30 bg-popover/95 backdrop-blur-xl px-3.5 py-2.5 text-xs shadow-2xl">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/30 bg-popover/95 backdrop-blur-xl px-3.5 py-2.5 text-xs shadow-2xl">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: payload[0].payload.color }} />
        <span className="text-muted-foreground">{payload[0].name}:</span>
        <span className="font-bold text-foreground">{payload[0].value}</span>
      </div>
    </div>
  );
}

export default function ClientDashboardHome({ companyId, companyName, userId, userName, userRole, operatorRoles, onConversationClick, onNavigateToTickets, creditsEnabled, onNavigateToCredits, onNavigateToConversations, onNavigateToSchedule }: ClientDashboardProps) {
  const [ticketStats, setTicketStats] = useState<TicketStats>({ open: 0, inProgress: 0, resolved: 0 });
  const [recentConversations, setRecentConversations] = useState<any[]>([]);
  const [allTicketsData, setAllTicketsData] = useState<any[]>([]);
  const [allConversationsData, setAllConversationsData] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState<"day" | "week" | "month" | "3months" | "all">("week");
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<CompanyCredits | null>(null);

  useEffect(() => {
    if (companyId) loadData();
    else setLoading(false);
  }, [companyId]);

  // Realtime: recargar al haber cambios en conversaciones
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`conv_realtime_${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `company_id=eq.${companyId}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId]);

  // Load credits when enabled
  useEffect(() => {
    if (!companyId || !creditsEnabled) { setCredits(null); return; }
    const loadCredits = async () => {
      const { data, error } = await (supabase as any).rpc("get_company_credits", { p_company_id: companyId });
      if (!error && data) {
        const row: CompanyCredits = Array.isArray(data) ? data[0] : data;
        setCredits(row ?? { balance: 0, total_purchased: 0, total_used: 0 });
      }
    };
    loadCredits();

    // Realtime subscription
    const channel = supabase
      .channel(`credits_home_${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_credits", filter: `company_id=eq.${companyId}` }, () => {
        loadCredits();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId, creditsEnabled]);

  const loadData = async () => {
    if (!companyId) return;
    try {
      const [allTickets, convos, allConvos, rawLabels] = await Promise.all([
        supabase.from("tickets").select("category, created_at, status").eq("company_id", companyId),
        supabase.from("conversations").select("id, wa_id, profile_name, last_message_preview, last_message_at, unread_count").eq("company_id", companyId).order("last_message_at", { ascending: false }).limit(5),
        supabase.from("conversations").select("created_at").eq("company_id", companyId),
        (supabase as any).from("ticket_labels").select("*").eq("company_id", companyId).order("id")
      ]);

      setRecentConversations(convos.data || []);
      setAllConversationsData(allConvos.data || []);
      setLabels(rawLabels.data || []);
      setAllTicketsData(allTickets.data || []);

    } catch (e) {
      console.error("Error loading client dashboard:", e);
    } finally {
      setLoading(false);
    }
  };

  const { statusCounts, ticketsByDay, ticketsByCategory, conversationsCount } = useMemo(() => {
    const now = new Date();
    const startOfHour = new Date(now); startOfHour.setMinutes(0, 0, 0);
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);

    const cutoff = (range: typeof timeRange): number => {
      if (range === "day")     return startOfHour.getTime() - 23 * 60 * 60 * 1000;
      if (range === "week")    return startOfDay.getTime()  -  6 * 24 * 60 * 60 * 1000;
      if (range === "month")   return startOfDay.getTime()  - 29 * 24 * 60 * 60 * 1000;
      if (range === "3months") return startOfDay.getTime()  - 89 * 24 * 60 * 60 * 1000;
      return 0; // "all"
    };

    const cut = cutoff(timeRange);

    const filteredTickets = allTicketsData.filter(t => new Date(t.created_at).getTime() >= cut);
    const filteredConvos  = allConversationsData.filter(c => new Date(c.created_at).getTime() >= cut);

    const statusCounts: Record<string, number> = {};
    const catMap: Record<string, number> = {};

    filteredTickets.forEach((t: any) => {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      const label = categoryLabels[t.category] || t.category || "Sin categoría";
      catMap[label] = (catMap[label] || 0) + 1;
    });

    const isFinalStatus = (status: string) =>
      labels.find(l => l.key === status)?.is_final || status === "resuelto" || status === "cerrado";

    // Helper: build bucket map and fill from data
    const buildBuckets = (keys: string[]) =>
      Object.fromEntries(keys.map(k => [k, { activos: 0, finalizados: 0 }]));

    let timeSeries: any[] = [];

    if (timeRange === "day") {
      const keys = Array.from({ length: 24 }, (_, i) =>
        new Date(startOfHour.getTime() - (23 - i) * 60 * 60 * 1000)
          .toLocaleTimeString("es", { hour: "2-digit" }) + "h"
      );
      const map = buildBuckets(keys);
      filteredTickets.forEach((t: any) => {
        const k = new Date(t.created_at).toLocaleTimeString("es", { hour: "2-digit" }) + "h";
        if (map[k]) { isFinalStatus(t.status) ? map[k].finalizados++ : map[k].activos++; }
      });
      timeSeries = keys.map(k => ({ name: k, ...map[k] }));

    } else if (timeRange === "week") {
      const keys = Array.from({ length: 7 }, (_, i) =>
        new Date(startOfDay.getTime() - (6 - i) * 86400000)
          .toLocaleDateString("es", { weekday: "short", day: "numeric" })
      );
      const map = buildBuckets(keys);
      filteredTickets.forEach((t: any) => {
        const k = new Date(t.created_at).toLocaleDateString("es", { weekday: "short", day: "numeric" });
        if (map[k]) { isFinalStatus(t.status) ? map[k].finalizados++ : map[k].activos++; }
      });
      timeSeries = keys.map(k => ({ name: k, ...map[k] }));

    } else if (timeRange === "month") {
      const keys = Array.from({ length: 30 }, (_, i) =>
        new Date(startOfDay.getTime() - (29 - i) * 86400000)
          .toLocaleDateString("es", { day: "numeric", month: "numeric" })
      );
      const map = buildBuckets(keys);
      filteredTickets.forEach((t: any) => {
        const k = new Date(t.created_at).toLocaleDateString("es", { day: "numeric", month: "numeric" });
        if (map[k]) { isFinalStatus(t.status) ? map[k].finalizados++ : map[k].activos++; }
      });
      timeSeries = keys.map(k => ({ name: k, ...map[k] }));

    } else if (timeRange === "3months") {
      // 13 semanas — un bucket por semana
      const keys = Array.from({ length: 13 }, (_, i) => {
        const d = new Date(startOfDay.getTime() - (12 - i) * 7 * 86400000);
        return d.toLocaleDateString("es", { day: "numeric", month: "short" });
      });
      const map = buildBuckets(keys);
      filteredTickets.forEach((t: any) => {
        const d = new Date(t.created_at);
        const weekStart = new Date(d.getTime() - ((d.getDay() || 7) - 1) * 86400000);
        weekStart.setHours(0, 0, 0, 0);
        // Encontrar el bucket más cercano
        const k = keys.find(key => {
          const ref = new Date(startOfDay.getTime() - (12 - keys.indexOf(key)) * 7 * 86400000);
          return Math.abs(ref.getTime() - weekStart.getTime()) < 4 * 86400000;
        });
        if (k && map[k]) { isFinalStatus(t.status) ? map[k].finalizados++ : map[k].activos++; }
      });
      timeSeries = keys.map(k => ({ name: k, ...map[k] }));

    } else if (timeRange === "all") {
      // Buckets mensuales desde el primer registro hasta hoy
      const allDates = [
        ...allTicketsData.map(t => new Date(t.created_at)),
        ...allConversationsData.map(c => new Date(c.created_at)),
      ];
      const earliest = allDates.length > 0
        ? new Date(Math.min(...allDates.map(d => d.getTime())))
        : new Date(now.getFullYear(), now.getMonth(), 1);
      earliest.setDate(1); earliest.setHours(0, 0, 0, 0);

      const months: string[] = [];
      const cur = new Date(earliest);
      while (cur <= now) {
        months.push(cur.toLocaleDateString("es", { month: "short", year: "2-digit" }));
        cur.setMonth(cur.getMonth() + 1);
      }
      const map = buildBuckets(months);
      filteredTickets.forEach((t: any) => {
        const k = new Date(t.created_at).toLocaleDateString("es", { month: "short", year: "2-digit" });
        if (map[k]) { isFinalStatus(t.status) ? map[k].finalizados++ : map[k].activos++; }
      });
      timeSeries = months.map(k => ({ name: k, ...map[k] }));
    }

    return {
      statusCounts,
      ticketsByDay: timeSeries,
      ticketsByCategory: Object.entries(catMap).map(([name, value]) => ({ name, value })),
      conversationsCount: filteredConvos.length,
    };
  }, [allTicketsData, timeRange, labels]);

  const ticketStatusData = useMemo(() => {
    return labels.map((l, i) => ({
      name: l.label,
      value: statusCounts[l.key] || 0,
      color: l.color || CHART_COLORS[i % CHART_COLORS.length]
    })).filter(x => x.value > 0);
  }, [labels, statusCounts]);

  const formatTime = (ts: string) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (mins < 1) return "Ahora";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-muted/30 rounded-lg animate-pulse" />
          <div className="h-4 w-40 bg-muted/20 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-muted/15 animate-pulse border border-border/10" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-64 rounded-2xl bg-muted/15 animate-pulse border border-border/10" />)}
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold">Cuenta No Vinculada</h2>
        <p className="text-muted-foreground max-w-md">
          Tu cuenta no tiene una empresa asignada. Contacta con soporte o intenta cerrar sesión y volver a entrar.
        </p>
      </div>
    );
  }

  const statCards = labels.map((l, i) => {
    const isFinal = l.is_final;
    const icons = isFinal ? [CheckCircle2] : [Clock, TrendingUp, AlertTriangle, MessageCircle];
    const Icon = isFinal ? CheckCircle2 : icons[i % icons.length];
    return {
      label: l.label,
      value: statusCounts[l.key] || 0,
      icon: Icon,
      hexColor: l.color || '#64748b',
      filterKey: l.key
    };
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="tour-home-welcome flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight font-display mb-2.5">
            Bienvenido{userName ? <span className="text-primary"> {userName.split(" ")[0]}</span> : ""}
          </h2>
          {userRole && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-widest border-primary/30 text-primary">
                {userRole}
              </Badge>
              {userRole === "operador" && operatorRoles && operatorRoles.map(role => (
                <Badge key={role} variant="secondary" className="text-[9px] uppercase tracking-wider bg-secondary/60">
                  {categoryLabels[role] || role}
                </Badge>
              ))}
            </div>
          )}
          <p className="text-muted-foreground/70 text-sm">Resumen operativo de <span className="font-semibold text-foreground/80">{companyName}</span></p>
        </div>
        <div className="flex-shrink-0">
          <Select value={timeRange} onValueChange={(v: "day"|"week"|"month"|"3months"|"all") => setTimeRange(v)}>
            <SelectTrigger className="w-[200px] bg-background">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Hoy (Últimas 24h)</SelectItem>
              <SelectItem value="week">Últimos 7 días</SelectItem>
              <SelectItem value="month">Último mes</SelectItem>
              <SelectItem value="3months">Últimos 3 meses</SelectItem>
              <SelectItem value="all">Historial completo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* KPI Cards — tickets + conversaciones */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((card, i) => (
          <motion.div key={card.label} custom={i} initial="hidden" animate="visible" variants={cardVariants}>
            <Card
              onClick={() => onNavigateToTickets?.(card.filterKey)}
              className={`border bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group rounded-2xl overflow-hidden ${onNavigateToTickets ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]' : ''}`}
              style={{ borderColor: `${card.hexColor}40`, background: `linear-gradient(to bottom right, ${card.hexColor}20, ${card.hexColor}05)` }}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground/90 uppercase tracking-wider">{card.label}</p>
                    <p className="text-4xl font-black mt-1.5 font-display" style={{ color: card.hexColor }}>{card.value}</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-background/50 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-inner">
                    <card.icon className="w-6 h-6" style={{ color: card.hexColor }} />
                  </div>
                </div>
                {onNavigateToTickets && (
                  <p className="text-[10px] text-muted-foreground/40 mt-2 font-medium">Ver en tickets →</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {/* Card conversaciones — tiempo real */}
        <motion.div custom={statCards.length} initial="hidden" animate="visible" variants={cardVariants}>
          <Card
            onClick={onNavigateToConversations}
            className="border bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group rounded-2xl overflow-hidden cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            style={{ borderColor: "#10b98140", background: "linear-gradient(to bottom right, #10b98120, #10b98105)" }}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground/90 uppercase tracking-wider">Conversaciones</p>
                  <p className="text-4xl font-black mt-1.5 font-display" style={{ color: "#10b981" }}>{conversationsCount.toLocaleString("es-CL")}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-background/50 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-inner relative">
                  <MessageCircle className="w-6 h-6" style={{ color: "#10b981" }} />
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/40 mt-2 font-medium">Ver análisis →</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Area chart — 7 días */}
        <motion.div custom={3} initial="hidden" animate="visible" variants={cardVariants} className="xl:col-span-2">
          <Card className="border-border/20 bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden h-full">
            <CardHeader className="pb-3 border-b border-border/10 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2.5 uppercase tracking-wide">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="w-3.5 h-3.5 text-primary" />
                </div>
                Tickets — {timeRange === 'day' ? 'Hoy' : timeRange === 'week' ? 'Últimos 7 días' : timeRange === 'month' ? 'Último mes' : timeRange === '3months' ? 'Últimos 3 meses' : 'Historial completo'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ticketsByDay} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradActivos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[3]} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={CHART_COLORS[3]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradFinalizados" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[2]} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={CHART_COLORS[2]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--primary) / 0.5)", strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="activos" name="Activos" stroke={CHART_COLORS[3]} fill="url(#gradActivos)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: CHART_COLORS[3] }} />
                  <Area type="monotone" dataKey="finalizados" name="Finalizados" stroke={CHART_COLORS[2]} fill="url(#gradFinalizados)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: CHART_COLORS[2] }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Pie chart — estado */}
        <motion.div custom={4} initial="hidden" animate="visible" variants={cardVariants}>
          <Card className="border-border/20 bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden h-full">
            <CardHeader className="pb-3 border-b border-border/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2.5 uppercase tracking-wide">
                <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <PieChartIcon className="w-3.5 h-3.5 text-violet-500" />
                </div>
                Estado de Tickets
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 flex flex-col items-center gap-4">
              <div className="w-full h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={ticketStatusData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value" stroke="none">
                      {ticketStatusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} style={{ filter: "drop-shadow(0px 0px 6px rgba(255,255,255,0.08))" }} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full flex flex-col gap-2">
                {ticketStatusData.map(item => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-[11px] font-semibold text-muted-foreground/80">{item.name}</span>
                    </div>
                    <span className="text-sm font-black font-display">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Bottom row: bar chart + conversaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart — categorías */}
        <motion.div custom={5} initial="hidden" animate="visible" variants={cardVariants}>
          <Card className="border-border/20 bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2.5 uppercase tracking-wide">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Ticket className="w-3.5 h-3.5 text-amber-500" />
                </div>
                Tickets por Categoría
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 h-56">
              {ticketsByCategory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <Ticket className="w-10 h-10 text-muted-foreground/20 mb-2" />
                  <p className="text-xs text-muted-foreground/50 font-medium">Sin datos de categoría aún</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ticketsByCategory} layout="vertical" margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--foreground))", fontSize: 10, fontWeight: 500 }} width={110} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--primary) / 0.08)" }} />
                    <Bar dataKey="value" name="Tickets" radius={[0, 4, 4, 0]} barSize={18}>
                      {ticketsByCategory.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Conversations */}
        <motion.div custom={6} initial="hidden" animate="visible" variants={cardVariants}>
          <Card className="border-border/20 bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2.5 uppercase tracking-wide">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                Conversaciones Recientes
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {recentConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/20 flex items-center justify-center mb-3">
                    <Inbox className="w-7 h-7 text-muted-foreground/30" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground/60">Sin conversaciones aún</p>
                  <p className="text-xs text-muted-foreground/40 mt-1">Las nuevas conversaciones aparecerán aquí</p>
                </div>
              ) : (
                <div className="divide-y divide-border/10">
                  {recentConversations.map((c, i) => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.05 }}
                      className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-secondary/30 transition-all duration-200 cursor-pointer group"
                      onClick={() => onConversationClick?.(c.id)}
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-emerald-500">
                            {(c.profile_name || c.wa_id || "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold truncate">{c.profile_name || c.wa_id}</p>
                            {c.unread_count > 0 && (
                              <Badge className="bg-emerald-500 text-white text-[10px] h-4 px-1.5 font-bold rounded-full">{c.unread_count}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{c.last_message_preview || "..."}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-[10px] text-muted-foreground/50 font-medium">{formatTime(c.last_message_at)}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Schedule widget */}
      {companyId && onNavigateToSchedule && (
        <ScheduleWidget
          companyId={companyId}
          onNavigate={onNavigateToSchedule}
          cardVariants={cardVariants}
          animationIndex={8}
        />
      )}

      {/* Credits widget — al fondo para no obstruir datos importantes */}
      {creditsEnabled && credits && (() => {
        const hexColor = "#8b5cf6";
        const isLow = (credits.balance ?? 0) <= Math.max(100, Math.floor((credits.total_purchased ?? 0) * 0.1));
        return (
          <motion.div custom={7} initial="hidden" animate="visible" variants={cardVariants}>
            <Card
              onClick={onNavigateToCredits}
              className="border bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group rounded-2xl overflow-hidden cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
              style={{ borderColor: `${hexColor}40`, background: `linear-gradient(to bottom right, ${hexColor}20, ${hexColor}05)` }}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-background/50 flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-inner">
                      {isLow
                        ? <AlertTriangle className="w-5 h-5 text-amber-500" />
                        : <CreditCard className="w-5 h-5" style={{ color: hexColor }} />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground/90 uppercase tracking-wider">Créditos WhatsApp</p>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-2xl font-black font-display" style={{ color: hexColor }}>
                          {(credits.balance ?? 0).toLocaleString("es-CL")}
                        </span>
                        <span className="text-xs text-muted-foreground/50">mensajes disponibles</span>
                        {isLow && <span className="text-[10px] text-amber-500 font-bold">⚠ Saldo bajo</span>}
                      </div>
                    </div>
                  </div>
                  {(credits.total_purchased ?? 0) > 0 && (
                    <div className="flex-shrink-0 w-32 hidden sm:block">
                      <div className="flex justify-between text-[10px] text-muted-foreground/50 mb-1">
                        <span>Disponible</span>
                        <span>{Math.round(((credits.balance ?? 0) / (credits.total_purchased ?? 1)) * 100)}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(100, Math.round(((credits.balance ?? 0) / (credits.total_purchased ?? 1)) * 100))}%`,
                            backgroundColor: isLow ? "#f59e0b" : hexColor,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/40 font-medium flex-shrink-0">Ver créditos →</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })()}
    </div>
  );
}
