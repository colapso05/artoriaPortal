import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, Ticket, MessageCircle, Play,
  DollarSign, CalendarClock, FileWarning, CreditCard, AlertTriangle,
} from "lucide-react";
import { format, addMonths, setDate, isBefore, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface AdminDashboardHomeProps {
  onSimulate?: (companyId: string, companyName: string) => void;
}

interface CompanyRow {
  id: string;
  company_name: string;
  alert_active: boolean;
  ycloud_phone: string | null;
  status?: string;
}

interface GlobalStats {
  activeCompanies: number;
  monthlyRevenue: number;
  nextBillingLabel: string;
  pendingReports: number;
  pendingCredits: number;
}

interface RevenueEntry {
  name: string;
  amount: number;
}

interface TicketCounts {
  abiertos: number;
  enProgreso: number;
  alertas: number;
}

const CHART_COLORS = ["#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#8b5cf6", "#f59e0b", "#f97316", "#ec4899"];

// Tooltip personalizado para el gráfico de barras
function RevenueTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/30 bg-card/95 backdrop-blur px-3 py-2 shadow-xl text-xs">
      <p className="font-bold text-foreground/90 mb-0.5">{payload[0]?.payload?.name}</p>
      <p className="text-emerald-400 font-black">${(payload[0]?.value || 0).toLocaleString("es-CL")}/mes</p>
    </div>
  );
}

function KpiChip({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | number; color: string;
}) {
  return (
    <div className="rounded-xl border border-border/20 bg-card/40 px-4 py-2.5 flex items-center gap-3">
      <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
      <div>
        <p className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-widest leading-none mb-0.5">{label}</p>
        <p className={`text-xl font-black leading-none ${color}`}>{value}</p>
      </div>
    </div>
  );
}

export default function AdminDashboardHome({ onSimulate }: AdminDashboardHomeProps) {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [companyUnread, setCompanyUnread] = useState<Record<string, number>>({});
  const [companyTickets, setCompanyTickets] = useState<Record<string, number>>({});
  const [revenueChartData, setRevenueChartData] = useState<RevenueEntry[]>([]);
  const [ticketCounts, setTicketCounts] = useState<TicketCounts>({ abiertos: 0, enProgreso: 0, alertas: 0 });
  const [stats, setStats] = useState<GlobalStats>({
    activeCompanies: 0,
    monthlyRevenue: 0,
    nextBillingLabel: "—",
    pendingReports: 0,
    pendingCredits: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    try {
      const [
        companiesRes,
        conversationsRes,
        ticketsRes,
        billingRes,
        reportsRes,
        creditsRes,
      ] = await Promise.all([
        supabase.from("company_config").select("id, company_name, alert_active, ycloud_phone, status"),
        supabase.from("conversations").select("company_id, unread_count").gt("unread_count", 0),
        supabase.from("tickets").select("company_id, status")
          .in("status", ["abierto", "en_progreso"])
          .is("deleted_at", null),
        (supabase as any).from("billing_config").select("company_id, amount, billing_day, billing_enabled"),
        (supabase as any).from("agent_feedback").select("id", { count: "exact", head: true }).eq("status", "pendiente"),
        (supabase as any).from("credit_transactions").select("id", { count: "exact", head: true })
          .in("payment_status", ["pending", "transfer_sent", "questioned"]),
      ]);

      // --- Empresas ---
      const companiesList: CompanyRow[] = (companiesRes.data || []) as CompanyRow[];
      setCompanies(companiesList);

      const namesMap: Record<string, string> = {};
      for (const c of companiesList) namesMap[c.id] = c.company_name;

      // ID de Dropp para excluir de facturación
      const droppId = companiesList.find(c =>
        c.company_name.toLowerCase().includes("dropp")
      )?.id;

      // --- Mensajes sin leer ---
      const unreadMap: Record<string, number> = {};
      for (const conv of conversationsRes.data || []) {
        const cid = (conv as any).company_id as string;
        unreadMap[cid] = (unreadMap[cid] || 0) + ((conv as any).unread_count as number);
      }
      setCompanyUnread(unreadMap);

      // --- Tickets por empresa y por estado ---
      const ticketsMap: Record<string, number> = {};
      let abiertos = 0;
      let enProgreso = 0;
      for (const t of ticketsRes.data || []) {
        const cid = (t as any).company_id as string;
        const st = (t as any).status as string;
        ticketsMap[cid] = (ticketsMap[cid] || 0) + 1;
        if (st === "abierto") abiertos++;
        else if (st === "en_progreso") enProgreso++;
      }
      setCompanyTickets(ticketsMap);
      setTicketCounts({
        abiertos,
        enProgreso,
        alertas: companiesList.filter(c => c.alert_active).length,
      });

      // --- Facturación ---
      const billingRows: any[] = billingRes.data || [];
      const activeBilling = billingRows.filter((b: any) => b.billing_enabled);

      // Revenue total excluyendo Dropp
      const monthlyRevenue = activeBilling
        .filter((b: any) => b.company_id !== droppId)
        .reduce((sum: number, b: any) => sum + (b.amount || 0), 0);

      // Próxima fecha de cobro
      const today = startOfDay(new Date());
      let nextBilling: Date | null = null;
      for (const b of activeBilling) {
        const day = b.billing_day as number;
        let candidate = setDate(today, day);
        if (!isBefore(today, candidate)) candidate = setDate(addMonths(today, 1), day);
        if (!nextBilling || isBefore(candidate, nextBilling)) nextBilling = candidate;
      }
      const nextBillingLabel = nextBilling
        ? format(nextBilling, "d MMM", { locale: es })
        : "—";

      // Gráfico de ingresos por empresa (excl. Dropp), ordenado desc
      const chartData: RevenueEntry[] = activeBilling
        .filter((b: any) => b.company_id !== droppId && (b.amount || 0) > 0)
        .map((b: any) => ({
          name: namesMap[b.company_id] || b.company_id.split("-")[0],
          amount: b.amount || 0,
        }))
        .sort((a: RevenueEntry, b: RevenueEntry) => b.amount - a.amount);
      setRevenueChartData(chartData);

      setStats({
        activeCompanies: companiesList.filter((c: any) => c.status === "active").length,
        monthlyRevenue,
        nextBillingLabel,
        pendingReports: reportsRes.count || 0,
        pendingCredits: creditsRes.count || 0,
      });
    } catch (e) {
      console.error("Error loading admin stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden gap-3 pt-1">
        <div className="grid grid-cols-5 gap-2 flex-shrink-0">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-14 rounded-xl bg-muted/15 animate-pulse border border-border/10" />
          ))}
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

  return (
    <div className="flex flex-col h-full overflow-hidden gap-3 pt-1">

      {/* KPI Strip */}
      <div className="grid grid-cols-5 gap-2 flex-shrink-0">
        <KpiChip icon={Building2}     label="Empresas activas"    value={stats.activeCompanies}                              color="text-blue-500" />
        <KpiChip icon={DollarSign}    label="Facturación mensual" value={`$${stats.monthlyRevenue.toLocaleString("es-CL")}`} color="text-emerald-500" />
        <KpiChip icon={CalendarClock} label="Próxima factura"     value={stats.nextBillingLabel}                             color="text-violet-500" />
        <KpiChip icon={FileWarning}   label="Reportes pendientes" value={stats.pendingReports}                               color="text-amber-500" />
        <KpiChip icon={CreditCard}    label="Créditos pendientes" value={stats.pendingCredits}                               color="text-primary" />
      </div>

      {/* Body */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Izquierda: tabla de empresas */}
        <div className="flex-[3] flex flex-col min-h-0 rounded-2xl border border-border/20 bg-card/40 backdrop-blur overflow-hidden">
          <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between flex-shrink-0">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Empresas</span>
            <span className="text-[10px] text-muted-foreground/40">{companies.length} registradas</span>
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {companies.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-muted-foreground/40">Sin empresas</p>
              </div>
            )}
            {companies.map(company => (
              <div
                key={company.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-border/20 transition-all group cursor-pointer"
                onClick={() => onSimulate?.(company.id, company.company_name)}
              >
                {/* Indicador salud */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${company.alert_active ? "bg-red-500 animate-pulse" : "bg-emerald-500/50"}`} />

                {/* Nombre */}
                <span className="flex-1 text-sm font-semibold truncate">{company.company_name}</span>

                {/* Msgs sin leer */}
                {(companyUnread[company.id] || 0) > 0 && (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    <MessageCircle className="w-3 h-3" />
                    {companyUnread[company.id]}
                  </div>
                )}

                {/* Tickets abiertos */}
                {(companyTickets[company.id] || 0) > 0 && (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                    <Ticket className="w-3 h-3" />
                    {companyTickets[company.id]}
                  </div>
                )}

                {/* Botón simular */}
                <button className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-primary/70 hover:text-primary px-2 py-1 rounded-lg hover:bg-primary/10 flex items-center gap-1">
                  <Play className="w-3 h-3" />
                  Simular
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Derecha: gráficos */}
        <div className="flex-[2] flex flex-col gap-3 min-h-0">

          {/* Gráfico: ingresos por empresa */}
          <div className="flex-[3] flex flex-col min-h-0 rounded-2xl border border-border/20 bg-card/40 backdrop-blur overflow-hidden">
            <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Ingresos por empresa</span>
              <span className="text-[10px] text-muted-foreground/40">mensual</span>
            </div>
            <div className="flex-1 p-3 min-h-0">
              {revenueChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs text-muted-foreground/40">Sin datos de facturación</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={revenueChartData}
                    margin={{ top: 2, right: 48, left: 4, bottom: 2 }}
                    barSize={14}
                  >
                    <XAxis
                      type="number"
                      hide
                      domain={[0, (dataMax: number) => Math.round(dataMax * 1.15)]}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={88}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<RevenueTooltip />}
                      cursor={{ fill: "rgba(255,255,255,0.04)", radius: 6 }}
                    />
                    <Bar dataKey="amount" radius={[0, 6, 6, 0]} label={{
                      position: "right",
                      formatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
                      fontSize: 10,
                      fontWeight: 700,
                      fill: "hsl(var(--muted-foreground))",
                    }}>
                      {revenueChartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Mini-panel: estado tickets + alertas */}
          <div className="flex-[2] rounded-2xl border border-border/20 bg-card/40 backdrop-blur overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border/10 flex-shrink-0">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Estado actual</span>
            </div>
            <div className="flex-1 flex items-center justify-around px-4">

              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Ticket className="w-4.5 h-4.5 text-amber-500" />
                </div>
                <p className="text-2xl font-black text-amber-500 leading-none">{ticketCounts.abiertos}</p>
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Abiertos</p>
              </div>

              <div className="w-px h-10 bg-border/20" />

              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Ticket className="w-4.5 h-4.5 text-blue-500" />
                </div>
                <p className="text-2xl font-black text-blue-500 leading-none">{ticketCounts.enProgreso}</p>
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold">En progreso</p>
              </div>

              <div className="w-px h-10 bg-border/20" />

              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-4.5 h-4.5 text-red-500" />
                </div>
                <p className="text-2xl font-black text-red-500 leading-none">{ticketCounts.alertas}</p>
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Alertas activas</p>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
