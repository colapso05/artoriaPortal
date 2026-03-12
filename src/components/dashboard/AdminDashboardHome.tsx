import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Ticket, MessageCircle, Users, AlertTriangle,
  Clock, CheckCircle2, TrendingUp, BarChart3, PieChart as PieChartIcon, Inbox
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from "recharts";
import { motion } from "framer-motion";

interface Stats {
  totalCompanies: number;
  totalUsers: number;
  ticketsOpen: number;
  ticketsInProgress: number;
  ticketsResolved: number;
  ticketsClosed: number;
  totalConversations: number;
  unreadConversations: number;
  activeAlerts: number;
}

const CHART_COLORS = [
  "hsl(280, 100%, 70%)",
  "hsl(200, 80%, 55%)",
  "hsl(150, 60%, 50%)",
  "hsl(40, 90%, 55%)",
  "hsl(0, 70%, 55%)",
  "hsl(320, 100%, 60%)",
];

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.08, duration: 0.4 },
  }),
};

export default function AdminDashboardHome() {
  const [stats, setStats] = useState<Stats>({
    totalCompanies: 0, totalUsers: 0,
    ticketsOpen: 0, ticketsInProgress: 0, ticketsResolved: 0, ticketsClosed: 0,
    totalConversations: 0, unreadConversations: 0, activeAlerts: 0,
  });
  const [recentTickets, setRecentTickets] = useState<any[]>([]);
  const [ticketsByCategory, setTicketsByCategory] = useState<any[]>([]);
  const [ticketsByDay, setTicketsByDay] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    try {
      const [companies, profiles, ticketsOpen, ticketsProgress, ticketsResolved, ticketsClosed, conversations, alerts, recent, allTickets] = await Promise.all([
        supabase.from("company_config").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "abierto"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "en_progreso"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "resuelto"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "cerrado"),
        supabase.from("conversations").select("id, unread_count", { count: "exact" }),
        supabase.from("coverage_zones").select("id", { count: "exact", head: true }).eq("alert_active", true),
        supabase.from("tickets").select("id, title, status, priority, customer_name, created_at, company_id").order("created_at", { ascending: false }).limit(5),
        supabase.from("tickets").select("category, created_at, status"),
      ]);

      const unread = conversations.data?.filter(c => c.unread_count > 0).length || 0;

      setStats({
        totalCompanies: companies.count || 0,
        totalUsers: profiles.count || 0,
        ticketsOpen: ticketsOpen.count || 0,
        ticketsInProgress: ticketsProgress.count || 0,
        ticketsResolved: ticketsResolved.count || 0,
        ticketsClosed: ticketsClosed.count || 0,
        totalConversations: conversations.count || 0,
        unreadConversations: unread,
        activeAlerts: alerts.count || 0,
      });
      setRecentTickets(recent.data || []);

      const catMap: Record<string, number> = {};
      const categoryLabels: Record<string, string> = {
        soporte_tecnico: "Soporte Técnico",
        consulta_comercial: "Consulta Comercial",
        ventas: "Ventas",
        pagos: "Pagos",
      };
      (allTickets.data || []).forEach((t: any) => {
        const label = categoryLabels[t.category] || t.category;
        catMap[label] = (catMap[label] || 0) + 1;
      });
      setTicketsByCategory(Object.entries(catMap).map(([name, value]) => ({ name, value })));

      const dayMap: Record<string, { abiertos: number; resueltos: number }> = {};
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString("es", { weekday: "short", day: "numeric" });
        dayMap[key] = { abiertos: 0, resueltos: 0 };
      }
      (allTickets.data || []).forEach((t: any) => {
        const d = new Date(t.created_at);
        const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (diff < 7) {
          const key = d.toLocaleDateString("es", { weekday: "short", day: "numeric" });
          if (dayMap[key]) {
            if (t.status === "resuelto" || t.status === "cerrado") {
              dayMap[key].resueltos++;
            } else {
              dayMap[key].abiertos++;
            }
          }
        }
      });
      setTicketsByDay(Object.entries(dayMap).map(([name, v]) => ({ name, ...v })));

    } catch (e) {
      console.error("Error loading admin stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const ticketStatusData = useMemo(() => [
    { name: "Abiertos", value: stats.ticketsOpen, color: CHART_COLORS[3] },
    { name: "En Progreso", value: stats.ticketsInProgress, color: CHART_COLORS[1] },
    { name: "Resueltos", value: stats.ticketsResolved, color: CHART_COLORS[2] },
    { name: "Cerrados", value: stats.ticketsClosed, color: CHART_COLORS[0] },
  ], [stats]);

  const statCards = [
    { label: "Empresas", value: stats.totalCompanies, icon: Building2, color: "text-blue-500", bg: "from-blue-500/15 to-blue-500/5", border: "border-blue-500/20" },
    { label: "Usuarios", value: stats.totalUsers, icon: Users, color: "text-violet-500", bg: "from-violet-500/15 to-violet-500/5", border: "border-violet-500/20" },
    { label: "Tickets Abiertos", value: stats.ticketsOpen, icon: Ticket, color: "text-amber-500", bg: "from-amber-500/15 to-amber-500/5", border: "border-amber-500/20" },
    { label: "Conversaciones", value: stats.totalConversations, icon: MessageCircle, color: "text-emerald-500", bg: "from-emerald-500/15 to-emerald-500/5", border: "border-emerald-500/20" },
  ];

  const statusColor: Record<string, string> = {
    abierto: "bg-amber-500/15 text-amber-500 border-amber-500/20",
    en_progreso: "bg-blue-500/15 text-blue-500 border-blue-500/20",
    resuelto: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
    cerrado: "bg-muted text-muted-foreground border-border/30",
  };

  const priorityColor: Record<string, string> = {
    baja: "text-muted-foreground",
    media: "text-blue-500",
    alta: "text-amber-500",
    urgente: "text-red-500",
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
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
  };

  const PieTooltip = ({ active, payload }: any) => {
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
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-8 w-72 bg-muted/30 rounded-lg animate-pulse" />
          <div className="h-4 w-48 bg-muted/20 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 rounded-2xl bg-muted/15 animate-pulse border border-border/10" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="h-72 rounded-2xl bg-muted/15 animate-pulse border border-border/10" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6 pt-2 pb-12">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex-shrink-0">
        <h2 className="text-3xl font-extrabold tracking-tight font-display">
          SISTEMA <span className="gradient-text">CORE</span>
        </h2>
        <p className="text-muted-foreground/70 text-xs mt-1 uppercase tracking-widest font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Telemetría en tiempo real activa
        </p>
      </motion.div>

      {/* BENTO GRID SYSTEM - Scrollable Premium Edition */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

        {/* QUICK KPIs */}
        {statCards.map((card, i) => (
          <motion.div key={card.label} custom={i} initial="hidden" animate="visible" variants={cardVariants} className="bento-card flex flex-col justify-center p-6 h-36">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">{card.label}</p>
                <p className={`text-3xl font-black mt-1 font-display ${card.color} glow-text`}>{card.value}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-background/50 flex items-center justify-center shadow-inner border border-border/10">
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
          </motion.div>
        ))}

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* MAIN TRENDS (Area) */}
        <motion.div custom={4} initial="hidden" animate="visible" variants={cardVariants} className="xl:col-span-2 bento-card p-0 flex flex-col min-h-[400px]">
          <div className="p-4 border-b border-white/5 flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center glow-box">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <h3 className="text-[13px] font-bold tracking-wide">Frecuencia de Carga (7 Días)</h3>
              <p className="text-[10px] text-muted-foreground/60 tracking-wider">Flujo de tickets reportados</p>
            </div>
          </div>
          <div className="flex-1 p-4 min-h-0 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ticketsByDay} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradAbiertos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[3]} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={CHART_COLORS[3]} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradResueltos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[2]} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={CHART_COLORS[2]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--primary) / 0.5)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Area type="monotone" dataKey="abiertos" name="Abiertos" stroke={CHART_COLORS[3]} fill="url(#gradAbiertos)" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: CHART_COLORS[3], stroke: "#000", strokeWidth: 2 }} />
                <Area type="monotone" dataKey="resueltos" name="Resueltos" stroke={CHART_COLORS[2]} fill="url(#gradResueltos)" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: CHART_COLORS[2], stroke: "#000", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* DISPOSITION (Pie) */}
        <motion.div custom={5} initial="hidden" animate="visible" variants={cardVariants} className="xl:col-span-1 bento-card p-0 flex flex-col min-h-[400px]">
          <div className="p-4 border-b border-white/5 flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center glow-box">
              <PieChartIcon className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <h3 className="text-[13px] font-bold tracking-wide">Estado Operativo</h3>
              <p className="text-[10px] text-muted-foreground/60 tracking-wider">Distribución actual</p>
            </div>
          </div>
          <div className="flex-1 p-4 flex flex-col lg:flex-row items-center gap-4 min-h-0">
            <div className="flex-1 w-full h-full relative">
              <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full scale-150 pointer-events-none" />
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={ticketStatusData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={5} dataKey="value" stroke="none">
                    {ticketStatusData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} style={{ filter: 'drop-shadow(0px 0px 8px rgba(255,255,255,0.1))' }} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full lg:w-40 flex flex-col gap-2.5 justify-center">
              {ticketStatusData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color, boxShadow: `0 0 10px ${item.color}80` }} />
                    <span className="text-[11px] font-semibold text-muted-foreground/80">{item.name}</span>
                  </div>
                  <span className="text-sm font-black font-display text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* BOTTOM SECTION: CATEGORIES (Bar) + INBOX (List) */}
        <motion.div custom={6} initial="hidden" animate="visible" variants={cardVariants} className="xl:col-span-1 bento-card p-0 flex flex-col min-h-[450px]">
          <div className="p-4 border-b border-white/5 flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center glow-box">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
            </div>
            <h3 className="text-[13px] font-bold tracking-wide">Densidad por Sectores</h3>
          </div>
          <div className="flex-1 p-4 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ticketsByCategory} margin={{ top: 5, right: 10, left: -25, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--foreground))", fontSize: 10, fontWeight: 500 }} width={80} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--primary) / 0.1)' }} />
                <Bar dataKey="value" name="Tickets" radius={[0, 4, 4, 0]} barSize={20}>
                  {ticketsByCategory.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div custom={7} initial="hidden" animate="visible" variants={cardVariants} className="xl:col-span-2 bento-card p-0 flex flex-col min-h-[450px]">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-accent/10 flex items-center justify-center glow-box">
                <Inbox className="w-3.5 h-3.5 text-accent" />
              </div>
              <div>
                <h3 className="text-[13px] font-bold tracking-wide">Entrada de Telemetría</h3>
                <p className="text-[10px] text-muted-foreground/60 tracking-wider">Últimas alertas de tickets</p>
              </div>
            </div>
            <Badge variant="outline" className="border-accent/30 text-accent bg-accent/5 text-[10px] font-bold rounded-lg px-2">LIVE</Badge>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar p-2">
            {recentTickets.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <Inbox className="w-10 h-10 text-muted-foreground/20 mb-2" />
                <p className="text-xs font-semibold text-muted-foreground/50">Vacío de red</p>
              </div>
            ) : (
              <div className="space-y-1.5 flex flex-col h-full justify-start">
                {recentTickets.map((t: any, i: number) => (
                  <motion.div key={t.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * i }}
                    className="flex items-center justify-between p-3 rounded-xl bg-background/20 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full ${t.priority === "urgente" ? "bg-red-500 animate-pulse" : t.priority === "alta" ? "bg-amber-500" : "bg-blue-500"}`} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-white/90 truncate group-hover:text-primary transition-colors">{t.title}</p>
                        <p className="text-[10px] mt-0.5 text-white/40 tracking-wider uppercase font-medium">
                          {t.customer_name || "SYSTEM PROTOCOL"} <span className="opacity-50">· {new Date(t.created_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</span>
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[9px] font-extrabold tracking-widest uppercase rounded-md px-2 py-0 h-5 ${statusColor[t.status] || ""}`}>
                      {t.status?.replace("_", " ")}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
