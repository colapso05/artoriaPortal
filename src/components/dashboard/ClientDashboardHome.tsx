import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Ticket, MessageCircle, AlertTriangle,
  Clock, CheckCircle2, TrendingUp, ArrowRight,
  BarChart3, PieChart as PieChartIcon, CreditCard,
  Plus, Inbox, CalendarDays, ClipboardList, Zap,
  ChevronLeft, ChevronRight, DollarSign, Loader2,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

const CHART_COLORS = [
  "hsl(280, 100%, 70%)",
  "hsl(200, 80%, 55%)",
  "hsl(150, 60%, 50%)",
  "hsl(40, 90%, 55%)",
  "hsl(0, 70%, 55%)",
];

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

// Chip compacto de KPI
function KpiChip({
  icon: Icon, label, value, hexColor, subLabel = "Tickets", onClick,
}: {
  icon: React.ElementType; label: string; value: string | number;
  hexColor: string; subLabel?: string; onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-2xl bg-card flex-shrink-0 w-[140px] relative overflow-hidden transition-all
        shadow-[0_1px_3px_0_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.05)]
        dark:shadow-none dark:border dark:border-border/30
        ${onClick ? "cursor-pointer hover:shadow-[0_4px_14px_0_rgb(0_0_0/0.10)] hover:-translate-y-0.5 active:scale-[0.98]" : ""}`}
      onClick={onClick}
    >
      <div className="px-3.5 pt-2.5 pb-3 flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ backgroundColor: `${hexColor}18` }}>
          <Icon className="flex-shrink-0" style={{ color: hexColor, width: 15, height: 15 }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground/70 font-medium uppercase leading-tight line-clamp-2">{label}</p>
          <p className="text-[24px] font-black leading-none mt-0.5" style={{ color: hexColor }}>{value}</p>
          <p className="text-[10px] text-muted-foreground/50 font-medium mt-0.5">{subLabel}</p>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${hexColor}, ${hexColor}33)` }} />
    </div>
  );
}

export default function ClientDashboardHome({
  companyId, companyName, userId, userName, userRole, operatorRoles,
  onConversationClick, onNavigateToTickets, creditsEnabled, onNavigateToCredits,
  onNavigateToConversations, onNavigateToSchedule,
}: ClientDashboardProps) {
  const [allTicketsData, setAllTicketsData] = useState<any[]>([]);
  const [allConversationsData, setAllConversationsData] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState<"day" | "week" | "month" | "3months" | "all">("week");
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<CompanyCredits | null>(null);
  const [ycloudBalance, setYcloudBalance] = useState<{ amount: number; currency: string } | null>(null);
  const [loadingYCloud, setLoadingYCloud] = useState(false);
  const chipsScrollRef = useRef<HTMLDivElement>(null);
  const chipsFadeLeftRef = useRef<HTMLDivElement>(null);
  const chipsFadeRightRef = useRef<HTMLDivElement>(null);
  const isDropp = companyName?.toLowerCase().includes("dropp") || companyId === "01f8520b-5727-4e7c-937f-180c567609d9";

  useEffect(() => {
    if (companyId) loadData();
    else setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    if (!isDropp) return;

    const loadYCloudBalance = async () => {
      setLoadingYCloud(true);
      try {
        const { data, error } = await supabase.functions.invoke("get-ycloud-balance", {
          body: { companyId },
        });
        if (!error && data && typeof data.amount === "number") {
          setYcloudBalance({ amount: data.amount, currency: data.currency || "USD" });
        }
      } catch (e) {
        console.error("Error al cargar saldo de YCloud:", e);
      } finally {
        setLoadingYCloud(false);
      }
    };

    loadYCloudBalance();
    
    // Refrescar cada 10 minutos (600,000 ms)
    const interval = setInterval(loadYCloudBalance, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [companyId, companyName]);

  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`conv_realtime_${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `company_id=eq.${companyId}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId]);

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
    const channel = supabase
      .channel(`credits_home_${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_credits", filter: `company_id=eq.${companyId}` }, () => loadCredits())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, creditsEnabled]);


  const loadData = async () => {
    if (!companyId) return;
    try {
      const [allTickets, allConvos, rawLabels] = await Promise.all([
        supabase.from("tickets").select("category, created_at, status").eq("company_id", companyId),
        supabase.from("conversations").select("created_at").eq("company_id", companyId),
        (supabase as any).from("ticket_labels").select("*").eq("company_id", companyId).order("id"),
      ]);
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
      return 0;
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
      const keys = Array.from({ length: 13 }, (_, i) => {
        const d = new Date(startOfDay.getTime() - (12 - i) * 7 * 86400000);
        return d.toLocaleDateString("es", { day: "numeric", month: "short" });
      });
      const map = buildBuckets(keys);
      filteredTickets.forEach((t: any) => {
        const d = new Date(t.created_at);
        const weekStart = new Date(d.getTime() - ((d.getDay() || 7) - 1) * 86400000);
        weekStart.setHours(0, 0, 0, 0);
        const k = keys.find(key => {
          const ref = new Date(startOfDay.getTime() - (12 - keys.indexOf(key)) * 7 * 86400000);
          return Math.abs(ref.getTime() - weekStart.getTime()) < 4 * 86400000;
        });
        if (k && map[k]) { isFinalStatus(t.status) ? map[k].finalizados++ : map[k].activos++; }
      });
      timeSeries = keys.map(k => ({ name: k, ...map[k] }));
    } else {
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
      color: l.color || CHART_COLORS[i % CHART_COLORS.length],
    })).filter(x => x.value > 0);
  }, [labels, statusCounts]);

  // Chips de estado de tickets (dynamic from labels)
  const statChips = useMemo(() => {
    return labels.map((l, i) => {
      const isFinal = l.is_final;
      const icons = isFinal ? [CheckCircle2] : [Clock, TrendingUp, AlertTriangle, MessageCircle];
      const Icon = isFinal ? CheckCircle2 : icons[i % icons.length];
      return {
        label: l.label,
        value: statusCounts[l.key] || 0,
        icon: Icon,
        hexColor: l.color || "#64748b",
        filterKey: l.key,
      };
    });
  }, [labels, statusCounts]);

  // Scroll animado manual (scrollBy con behavior:smooth no funciona con overflow:hidden en ancestros)
  // Re-leemos chipsScrollRef.current en cada frame para evitar referencia obsoleta si React re-renderiza
  const scrollChips = (delta: number) => {
    const elNow = chipsScrollRef.current;
    if (!elNow) return;
    const start = elNow.scrollLeft;
    const target = Math.max(0, Math.min(start + delta, elNow.scrollWidth - elNow.clientWidth));
    if (target === start) return; // nada que animar
    const duration = 250;
    const startTime = performance.now();
    const step = (now: number) => {
      const el = chipsScrollRef.current; // re-leer en cada frame
      if (!el) return;
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
      el.scrollLeft = start + (target - start) * ease;
      if (t < 1) requestAnimationFrame(step);
      else updateChipsFade();
    };
    requestAnimationFrame(step);
  };

  // Chips scroll — actualiza fades directo en DOM (sin estado React para evitar timing issues)
  const updateChipsFade = () => {
    const el = chipsScrollRef.current;
    const left = chipsFadeLeftRef.current;
    const right = chipsFadeRightRef.current;
    if (!el) return;
    const showLeft = el.scrollLeft > 4;
    const showRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    if (left)  { left.style.opacity  = showLeft  ? "1" : "0"; left.style.pointerEvents  = showLeft  ? "auto" : "none"; }
    if (right) { right.style.opacity = showRight ? "1" : "0"; right.style.pointerEvents = showRight ? "auto" : "none"; }
  };

  // Registrar listeners cuando loading termina
  useEffect(() => {
    if (loading) return;
    const el = chipsScrollRef.current;
    if (!el) return;
    updateChipsFade();
    el.addEventListener("scroll", updateChipsFade, { passive: true });
    window.addEventListener("resize", updateChipsFade, { passive: true });
    return () => {
      el.removeEventListener("scroll", updateChipsFade);
      window.removeEventListener("resize", updateChipsFade);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Re-mide cuando los chips cambian (datos async)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let raf1: number, raf2: number;
    raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(updateChipsFade); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [statChips]);

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden gap-3 pt-1">
        <div className="h-8 w-full flex items-center justify-between flex-shrink-0">
          <div className="h-6 w-48 rounded-lg bg-muted/30 animate-pulse" />
          <div className="h-8 w-36 rounded-lg bg-muted/20 animate-pulse" />
        </div>
        <div className="h-11 grid grid-cols-4 gap-2 flex-shrink-0">
          {[1, 2, 3, 4].map(i => <div key={i} className="rounded-xl bg-muted/15 animate-pulse border border-border/10" />)}
        </div>
        <div className="flex gap-3 flex-1 min-h-0">
          <div className="flex-[3] rounded-2xl bg-muted/15 animate-pulse border border-border/10" />
          <div className="flex-[2] flex flex-col gap-3 min-h-0">
            <div className="flex-[3] rounded-2xl bg-muted/15 animate-pulse border border-border/10" />
            <div className="flex-[2] rounded-2xl bg-muted/15 animate-pulse border border-border/10" />
          </div>
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold">Cuenta No Vinculada</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          Tu cuenta no tiene una empresa asignada. Contacta con soporte o intenta cerrar sesión y volver a entrar.
        </p>
      </div>
    );
  }

  const firstName = userName?.split(" ")[0] || "";
  const rangeLabel: Record<string, string> = {
    day: "Hoy", week: "7 días", month: "30 días", "3months": "3 meses", all: "Historial",
  };

  // Total tickets en el período
  const totalTickets = ticketStatusData.reduce((s, x) => s + x.value, 0);

  const cardClass = "rounded-2xl bg-card overflow-hidden shadow-[0_1px_3px_0_rgb(0_0_0/0.08),0_1px_2px_-1px_rgb(0_0_0/0.05)] dark:shadow-none dark:border dark:border-border/30";
  const cardHeaderClass = "px-4 py-2.5 border-b border-border/20 flex items-center gap-2.5 flex-shrink-0";
  const cardIconClass = "w-6 h-6 rounded-lg flex items-center justify-center";

  return (
    <div className="flex flex-col h-full overflow-hidden gap-3 pt-1 pb-3 px-0">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-shrink-0">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className="text-xl font-extrabold leading-tight truncate tracking-tight">
              ¡Hola{firstName ? <>, <span className="text-primary">{firstName}</span></> : ""}! 👋
            </h2>
            {userRole && (
              <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-widest border-primary/30 text-primary h-5 px-1.5 flex-shrink-0">
                {userRole}
              </Badge>
            )}
            <span className="text-muted-foreground/60 text-sm truncate hidden sm:block font-medium">· {companyName}</span>
          </div>
          <p className="text-sm text-muted-foreground/60 font-medium">Bienvenido al Panel de Control</p>
        </div>
        <Select value={timeRange} onValueChange={(v: "day" | "week" | "month" | "3months" | "all") => setTimeRange(v)}>
          <SelectTrigger className="w-[160px] h-9 text-sm bg-card border-border/40 shadow-sm">
            <SelectValue placeholder="Periodo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Hoy (24h)</SelectItem>
            <SelectItem value="week">Últimos 7 días</SelectItem>
            <SelectItem value="month">Último mes</SelectItem>
            <SelectItem value="3months">Últimos 3 meses</SelectItem>
            <SelectItem value="all">Historial completo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── KPI Chips ── */}
      <div className="relative flex-shrink-0 w-full">
        <div ref={chipsScrollRef} className="overflow-x-auto no-scrollbar">
          <div className="flex flex-nowrap gap-2">
            {statChips.map(chip => (
              <KpiChip key={chip.label} icon={chip.icon} label={chip.label} value={chip.value} hexColor={chip.hexColor} onClick={() => onNavigateToTickets?.(chip.filterKey)} />
            ))}
            <KpiChip icon={MessageCircle} label="Conversaciones" value={conversationsCount.toLocaleString("es-CL")} hexColor="#10b981" subLabel="Totales" onClick={onNavigateToConversations} />
            {creditsEnabled && credits && (
              <KpiChip icon={CreditCard} label="Créditos WA" value={(credits.balance ?? 0).toLocaleString("es-CL")}
                hexColor={(credits.balance ?? 0) <= Math.max(100, Math.floor((credits.total_purchased ?? 0) * 0.1)) ? "#f59e0b" : "#8b5cf6"}
                subLabel="Disponibles"
                onClick={onNavigateToCredits} />
            )}
          </div>
        </div>
        {/* Fade + botón izquierdo — opacidad controlada por ref (DOM directo) */}
        <div ref={chipsFadeLeftRef} className="absolute left-0 top-0 bottom-0 w-16 flex items-center justify-start pl-1 transition-opacity duration-200 opacity-0 pointer-events-none"
          style={{ background: "linear-gradient(to right, hsl(var(--background)) 30%, transparent)" }}>
          <button
            onClick={() => { scrollChips(-300); }}
            className="w-7 h-7 rounded-full bg-card border border-border/40 shadow-sm flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Ver chips anteriores"
          >
            <ChevronLeft className="w-4 h-4 text-foreground/70" />
          </button>
        </div>
        {/* Fade + botón derecho — opacidad controlada por ref (DOM directo) */}
        <div ref={chipsFadeRightRef} className="absolute right-0 top-0 bottom-0 w-16 flex items-center justify-end pr-1 transition-opacity duration-200 opacity-0 pointer-events-none"
          style={{ background: "linear-gradient(to left, hsl(var(--background)) 30%, transparent)" }}>
          <button
            onClick={() => { scrollChips(300); }}
            className="w-7 h-7 rounded-full bg-card border border-border/40 shadow-sm flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Ver más chips"
          >
            <ChevronRight className="w-4 h-4 text-foreground/70" />
          </button>
        </div>
      </div>

      {/* ── Cuerpo principal: columna izquierda + columna derecha ── */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* ── Columna izquierda: gráfico área + fila inferior ── */}
        <div className="flex-[2.5] flex flex-col gap-3 min-h-0 min-w-0">

          {/* Área chart */}
          <div className={`flex-shrink-0 h-[160px] flex flex-col ${cardClass}`}>
            <div className={cardHeaderClass}>
              <div className={`${cardIconClass} bg-primary/10`}><BarChart3 className="w-3 h-3 text-primary" /></div>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Evolución de tickets — {rangeLabel[timeRange]}</span>
              <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground/70">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded-full inline-block" style={{backgroundColor: CHART_COLORS[3]}}/>Activos</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 rounded-full inline-block" style={{backgroundColor: CHART_COLORS[2]}}/>Finalizados</span>
              </div>
            </div>
            <div className="flex-1 p-2 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ticketsByDay} margin={{ top: 4, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradActivos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[3]} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={CHART_COLORS[3]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradFinalizados" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[2]} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={CHART_COLORS[2]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--primary) / 0.4)", strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="activos" name="Activos" stroke={CHART_COLORS[3]} fill="url(#gradActivos)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: CHART_COLORS[3] }} />
                  <Area type="monotone" dataKey="finalizados" name="Finalizados" stroke={CHART_COLORS[2]} fill="url(#gradFinalizados)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: CHART_COLORS[2] }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fila inferior: bar chart + pie chart */}
          <div className="flex gap-3 flex-1 min-h-0">

            {/* Bar chart — categorías */}
            <div className={`flex-[1.5] flex flex-col min-h-0 ${cardClass}`}>
              <div className={cardHeaderClass}>
                <div className={`${cardIconClass} bg-amber-500/10`}><Ticket className="w-3 h-3 text-amber-500" /></div>
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tickets por categoría</span>
              </div>
              <div className="flex-1 p-3 min-h-0">
                {ticketsByCategory.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-xs text-muted-foreground/60">Sin datos de categoría</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ticketsByCategory} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 4 }} barSize={13}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontWeight: 600 }} width={100} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.3)", radius: 4 }} />
                      <Bar dataKey="value" name="Tickets" radius={[0, 5, 5, 0]} label={{ position: "right", fontSize: 11, fontWeight: 700, fill: "hsl(var(--foreground)/0.6)" }}>
                        {ticketsByCategory.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <button
                onClick={() => onNavigateToTickets?.("")}
                className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline px-3 pb-2.5"
              >
                Ver todas las categorías <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Distribución — horizontal */}
            <div className={`flex-1 flex flex-col min-h-0 ${cardClass}`}>
              <div className={cardHeaderClass}>
                <div className={`${cardIconClass} bg-violet-500/10`}><PieChartIcon className="w-3 h-3 text-violet-500" /></div>
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Distribución de Tickets</span>
              </div>
              <div className="flex-1 flex flex-col min-h-0 p-3">
                {ticketStatusData.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-muted-foreground/60">Sin tickets</p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-3 flex-1 min-h-0 items-center">
                      {/* Donut with total inside */}
                      <div className="relative flex-shrink-0 w-[100px] h-[100px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={ticketStatusData} cx="50%" cy="50%" innerRadius="40%" outerRadius="68%" paddingAngle={2} dataKey="value" stroke="none">
                              {ticketStatusData.map((_, i) => <Cell key={i} fill={ticketStatusData[i].color} />)}
                            </Pie>
                            <Tooltip content={<PieTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <p className="text-lg font-black text-foreground leading-none">{totalTickets}</p>
                          <p className="text-[8px] text-muted-foreground/60 font-medium">Total</p>
                        </div>
                      </div>
                      {/* Legend */}
                      <div className="flex-1 space-y-1.5 min-w-0">
                        {ticketStatusData.map(item => {
                          const pct = totalTickets > 0 ? Math.round((item.value / totalTickets) * 100) : 0;
                          return (
                            <div key={item.name} className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                              <span className="text-[11px] text-foreground/70 font-medium flex-1 truncate">{item.name}</span>
                              <span className="text-[11px] font-bold flex-shrink-0 tabular-nums" style={{ color: item.color }}>{item.value}</span>
                              <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 w-7 text-right tabular-nums">{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <button
                      onClick={() => onNavigateToTickets?.("")}
                      className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline mt-2"
                    >
                      Ver detalle <ArrowRight className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── Columna derecha: Resumen Rápido + Accesos Rápidos ── */}
        <div className="flex flex-col gap-3 min-h-0 w-[220px] flex-shrink-0">

          {/* Resumen Rápido / Saldo YCloud */}
          <div className={`flex-[3] flex flex-col min-h-0 ${cardClass}`}>
            <div className={cardHeaderClass}>
              <div className={`${cardIconClass} bg-primary/10`}>
                {isDropp ? (
                  <DollarSign className="w-3 h-3 text-primary" />
                ) : (
                  <TrendingUp className="w-3 h-3 text-primary" />
                )}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                {isDropp ? "Saldo Proveedor" : "Resumen Rápido"}
              </span>
            </div>
            {isDropp ? (
              <div className="flex-1 flex flex-col items-center justify-center p-3 text-center gap-1.5 select-none min-h-0">
                {loadingYCloud && !ycloudBalance ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                    <span className="text-[10px] text-muted-foreground">Cargando saldo...</span>
                  </div>
                ) : ycloudBalance ? (
                  <>
                    <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-1 border border-emerald-500/20 shadow-[0_0_12px_-3px_rgba(16,185,129,0.2)]">
                      <DollarSign className="w-5 h-5 text-emerald-500" />
                    </div>
                    <p className="text-2xl font-black text-emerald-500 tabular-nums tracking-tight leading-none">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: ycloudBalance.currency }).format(ycloudBalance.amount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-1.5">Saldo YCloud</p>
                    <p className="text-[8px] text-muted-foreground/45 leading-tight mt-0.5">Refresco automático (10 min)</p>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1 p-2 text-center">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <p className="text-[10px] font-semibold text-muted-foreground">No disponible</p>
                    <p className="text-[9px] text-muted-foreground/40 leading-snug">Revisa la API Key en configuración</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 p-2.5 gap-1.5">
                {/* Donut + total */}
                <div className="flex items-center gap-2.5 flex-shrink-0 min-w-0">
                  <div className="relative w-14 h-14 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={ticketStatusData.length > 0 ? ticketStatusData : [{ name: "Sin datos", value: 1, color: "hsl(var(--muted))" }]}
                          cx="50%" cy="50%" innerRadius="40%" outerRadius="78%" dataKey="value" stroke="none" paddingAngle={2}>
                          {(ticketStatusData.length > 0 ? ticketStatusData : [{ name: "Sin datos", value: 1, color: "hsl(var(--muted))" }]).map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className="text-3xl font-black text-foreground leading-none">{totalTickets}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Tickets totales<br/>en el período</p>
                  </div>
                </div>
                {/* Lista compacta de estados */}
                <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5">
                  {ticketStatusData.map(item => {
                    const pct = totalTickets > 0 ? Math.round((item.value / totalTickets) * 100) : 0;
                    return (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-[11px] text-foreground/70 font-medium flex-1 truncate">{item.name}</span>
                        <span className="text-[11px] font-bold tabular-nums flex-shrink-0" style={{ color: item.color }}>{item.value}</span>
                        <span className="text-[10px] text-muted-foreground/50 w-6 text-right tabular-nums flex-shrink-0">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
                {/* Ver reporte completo */}
                <button
                  onClick={onNavigateToTickets ? () => onNavigateToTickets("") : undefined}
                  className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  Ver reporte completo <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Accesos Rápidos */}
          <div className="flex-[2] flex flex-col min-h-0 rounded-2xl overflow-hidden"
               style={{ background: 'linear-gradient(135deg, hsl(265,80%,35%), hsl(243,70%,28%))', boxShadow: '0 4px 20px 0 rgba(109,40,217,0.35)' }}>
            <div className="px-3 py-2 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <Zap className="w-3 h-3 text-white" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-white">Accesos Rápidos</span>
            </div>
            <div className="flex-1 p-1.5 grid grid-cols-2 gap-1.5 min-h-0">
              {[
                { icon: Plus,          label: "Nuevo Ticket", action: () => onNavigateToTickets?.("") },
                { icon: Inbox,         label: "Mi Bandeja",   action: onNavigateToConversations },
                { icon: CalendarDays,  label: "Agenda",       action: onNavigateToSchedule },
                { icon: ClipboardList, label: "Reportes",     action: undefined },
              ].map(({ icon: Ic, label: lbl, action }) => (
                <button
                  key={lbl}
                  onClick={action}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl transition-all active:scale-95"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.18)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
                >
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                    <Ic className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-[9px] font-bold text-white text-center leading-tight">{lbl}</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
