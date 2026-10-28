import * as Sentry from "@sentry/react";
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PanelPlataforma from "@/components/dashboard/PanelPlataforma";
import {
  Building2, Ticket, MessageCircle, Play,
  DollarSign, CalendarClock, FileWarning, CreditCard, AlertTriangle,
} from "lucide-react";
import { format, addMonths, setDate, isBefore, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

import CostoIAEmpresas from "@/components/dashboard/CostoIAEmpresas";

interface AdminDashboardHomeProps {
  onSimulate?: (companyId: string, companyName: string) => void;
  /** Va al análisis de una conversación que fallo, simulando su empresa. */
  onVerAnalisis?: (destino: { companyId: string; analysisId: string; waId: string }) => void;
  onVerReportes?: () => void;
  /** Abre la pantalla completa de Consumo de IA, con el detalle por modelo. */
  onVerConsumoIA?: () => void;
}

interface CompanyRow {
  id: string;
  company_name: string;
  alert_active: boolean;
  ycloud_phone: string | null;
  status?: string;
  /** Cuenta de la casa (Artoria). La marca el backend, no el nombre. */
  es_interna?: boolean | null;
}

interface GlobalStats {
  /** Empresas cliente, sin contar las cuentas de la casa. */
  clientCompanies: number;
  internalCompanies: number;
  monthlyRevenue: number;
  nextBillingLabel: string;
  /** Reportes de IA sin abrir y ya en curso. Juntos son el trabajo acumulado. */
  reportsSinAbrir: number;
  reportsEnCurso: number;
  pendingCredits: number;
}

interface RevenueEntry {
  name: string;
  amount: number;
}

interface TicketCounts {
  /** Todo lo que no llegó a una etiqueta final. */
  sinResolver: number;
  /** Los que siguen en la etiqueta inicial: nadie los movió todavía. */
  abiertos: number;
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

function KpiChip({ icon: Icon, label, value, color, detalle }: {
  icon: React.ElementType; label: string; value: string | number; color: string;
  /** Segunda linea: sirve para que un numero no esconda lo que deja fuera. */
  detalle?: string;
}) {
  return (
    <div className="rounded-xl border border-border/20 bg-card/40 px-4 py-2.5 flex items-center gap-3">
      <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-widest leading-none mb-0.5">{label}</p>
        <p className={`text-xl font-black leading-none ${color}`}>{value}</p>
        {detalle && <p className="text-[10px] text-muted-foreground/50 font-medium leading-none mt-1 truncate">{detalle}</p>}
      </div>
    </div>
  );
}

export default function AdminDashboardHome({ onSimulate, onVerAnalisis, onVerReportes, onVerConsumoIA }: AdminDashboardHomeProps) {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [companyUnread, setCompanyUnread] = useState<Record<string, number>>({});
  const [companyTickets, setCompanyTickets] = useState<Record<string, number>>({});
  const [revenueChartData, setRevenueChartData] = useState<RevenueEntry[]>([]);
  const [ticketCounts, setTicketCounts] = useState<TicketCounts>({ sinResolver: 0, abiertos: 0, alertas: 0 });
  const [stats, setStats] = useState<GlobalStats>({
    clientCompanies: 0,
    internalCompanies: 0,
    monthlyRevenue: 0,
    nextBillingLabel: "—",
    reportsSinAbrir: 0,
    reportsEnCurso: 0,
    pendingCredits: 0,
  });
  const [loading, setLoading] = useState(true);
  /**
   * Las cuentas de la casa y las archivadas quedan fuera por defecto.
   *
   * El tablero de arriba ya decía "2 clientes + 2 internas" y estaba bien; la lista
   * de abajo las mezclaba sin ninguna marca, así que el admin veía cuatro empresas
   * donde tiene dos. No se borran ni se esconden a la fuerza: hay un interruptor,
   * porque a veces hace falta entrar a una interna a mirar algo.
   */
  const [verOcultas, setVerOcultas] = useState(false);

  const loadStats = async () => {
    try {
      /*
       * Esperar la sesion antes de consultar. El efecto corre al montar, y si el
       * cliente de Supabase todavia no rehidrato el token, la peticion sale como
       * `anon`: las tablas con RLS estricta devuelven cero filas sin error, y la
       * tarjeta muestra "0 reportes" como si no hubiera trabajo pendiente. Las
       * tablas con politica permisiva si responden, asi que el tablero se ve
       * completo y solo esta parte queda en blanco.
       */
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn("[admin] sin sesion al cargar el tablero: las consultas con RLS estricta van a volver vacias");
        Sentry.captureMessage("Tablero admin cargado sin sesion", { level: "warning" });
      }

      const [
        companiesRes,
        conversationsRes,
        ticketsRes,
        labelsRes,
        billingRes,
        reportsRes,
        creditsRes,
      ] = await Promise.all([
        supabase.from("company_config").select("id, company_name, alert_active, ycloud_phone, status, es_interna"),
        supabase.from("conversations").select("company_id, unread_count").gt("unread_count", 0),
        /*
         * Sin resolver = no está en una etiqueta final, y final lo define cada
         * empresa en `ticket_labels`.
         *
         * Antes pedía `status IN ('abierto','en_progreso')` y se le escapaba todo
         * lo que estuviera en una etiqueta propia —pagos, tecnicos, agendado,
         * ventas— que igual es trabajo sin cerrar. En Dropp mostraba 4 donde había
         * 15, y en Optve 45 donde había 60. Se traen los tickets no finales y el
         * filtro fino por empresa se hace abajo, porque una etiqueta puede ser
         * final en una empresa y no en otra.
         */
        supabase.from("tickets").select("company_id, status").is("deleted_at", null),
        (supabase as any).from("ticket_labels").select("company_id, key, is_final"),
        (supabase as any).from("billing_config").select("company_id, amount, billing_day, billing_enabled"),
        // Antes solo contaba "pendiente" y dejaba fuera los que ya estaban en
        // revision, o sea casi la mitad del trabajo acumulado.
        (supabase as any).from("agent_feedback").select("status").neq("status", "resuelto"),
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

      /* --- Tickets sin resolver, por empresa ---
       *
       * Cada empresa decide qué etiqueta cierra un ticket, así que el corte se
       * arma por empresa y no con una lista escrita acá. Las que todavía no
       * configuraron etiquetas caen al par de siempre.
       */
      const finalesPorEmpresa: Record<string, Set<string>> = {};
      const inicialPorEmpresa: Record<string, string> = {};
      for (const l of (labelsRes.data as any[]) || []) {
        if (l.is_final) (finalesPorEmpresa[l.company_id] ??= new Set()).add(l.key);
        if (l.is_initial && !inicialPorEmpresa[l.company_id]) inicialPorEmpresa[l.company_id] = l.key;
      }
      const POR_DEFECTO = new Set(["resuelto", "cerrado"]);

      const ticketsMap: Record<string, number> = {};
      let sinResolver = 0;
      let abiertos = 0;
      for (const t of ticketsRes.data || []) {
        const cid = (t as any).company_id as string;
        const st = (t as any).status as string;
        if ((finalesPorEmpresa[cid] ?? POR_DEFECTO).has(st)) continue;
        ticketsMap[cid] = (ticketsMap[cid] || 0) + 1;
        sinResolver++;
        if (st === (inicialPorEmpresa[cid] ?? "abierto")) abiertos++;
      }
      setCompanyTickets(ticketsMap);
      setTicketCounts({
        sinResolver,
        abiertos,
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

      const activas = companiesList.filter((c: any) => c.status === "active");
      // Bandera del backend. Antes se adivinaba por el nombre y eso se iba a
      // romper el dia que un cliente se llamara parecido.
      const esInterna = (c: CompanyRow) => c.es_interna === true;
      /*
       * `agent_feedback` se lee directo de la tabla, asi que pasa por RLS. Si la
       * politica no deja ver los reportes de otras empresas, la consulta no falla:
       * devuelve cero filas y la tarjeta muestra "0 reportes sin resolver", que es
       * indistinguible de no tener trabajo pendiente. Se avisa para que ese caso
       * deje de ser invisible.
       */
      if ((reportsRes as any).error) {
        Sentry.captureException((reportsRes as any).error, { tags: { area: "reportes-ia" } });
        console.error("[reportes] no se pudo leer agent_feedback:", (reportsRes as any).error);
      }
      const reportes = (reportsRes.data ?? []) as Array<{ status: string }>;

      setStats({
        clientCompanies: activas.filter(c => !esInterna(c)).length,
        internalCompanies: activas.filter(c => esInterna(c)).length,
        monthlyRevenue,
        nextBillingLabel,
        reportsSinAbrir: reportes.filter(r => r.status === "pendiente").length,
        reportsEnCurso: reportes.filter(r => r.status !== "pendiente").length,
        pendingCredits: creditsRes.count || 0,
      });
    } catch (e) {
      console.error("Error loading admin stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  /*
   * `status` puede venir sin definir en filas viejas: se trata como activa, porque
   * esconder una empresa por un campo vacío sería peor que mostrar una de más.
   */
  const esArchivada = (c: CompanyRow) => c.status != null && c.status !== "active";
  const esOculta = (c: CompanyRow) => c.es_interna === true || esArchivada(c);
  const empresasVisibles = verOcultas ? companies : companies.filter(c => !esOculta(c));
  const ocultas = companies.length - companies.filter(c => !esOculta(c)).length;

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
    <div className="flex flex-col min-h-full gap-3 pt-1 pb-3">

      {/* KPI Strip — móvil: 2 por fila; desktop: los 5 en línea */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 flex-shrink-0">
        <KpiChip icon={Building2}     label="Clientes"            value={stats.clientCompanies}                              color="text-blue-500"
                 detalle={stats.internalCompanies > 0 ? `+ ${stats.internalCompanies} internas` : undefined} />
        <KpiChip icon={DollarSign}    label="Facturación mensual" value={`$${stats.monthlyRevenue.toLocaleString("es-CL")}`} color="text-emerald-500" />
        <KpiChip icon={CalendarClock} label="Próxima factura"     value={stats.nextBillingLabel}                             color="text-violet-500" />
        <KpiChip icon={FileWarning}   label="Reportes sin resolver" value={stats.reportsSinAbrir + stats.reportsEnCurso}      color="text-amber-500"
                 detalle={`${stats.reportsSinAbrir} sin abrir · ${stats.reportsEnCurso} en curso`} />
        <KpiChip icon={CreditCard}    label="Créditos pendientes" value={stats.pendingCredits}                               color="text-primary" />
      </div>

      {/* Body — móvil: altura natural con scroll de página; desktop: dos columnas a pantalla */}
      <div className="flex flex-col md:flex-row gap-3 md:flex-1 md:min-h-[380px]">

        {/* Izquierda: tabla de empresas */}
        <div className="flex flex-col h-[360px] md:h-auto md:flex-[3] md:min-h-0 rounded-2xl border border-border/20 bg-card/40 backdrop-blur overflow-hidden">
          <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between flex-shrink-0">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Empresas</span>
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] text-muted-foreground/40">
                {empresasVisibles.length} {empresasVisibles.length === 1 ? "empresa" : "empresas"}
              </span>
              {ocultas > 0 && (
                <button
                  onClick={() => setVerOcultas(v => !v)}
                  className="text-[10px] font-semibold text-primary/80 hover:text-primary hover:underline"
                >
                  {verOcultas ? "ocultar internas" : `ver ${ocultas} ${ocultas === 1 ? "oculta" : "ocultas"}`}
                </button>
              )}
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {empresasVisibles.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-muted-foreground/40">Sin empresas</p>
              </div>
            )}
            {empresasVisibles.map(company => (
              <div
                key={company.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-border/20 transition-all group cursor-pointer"
                onClick={() => onSimulate?.(company.id, company.company_name)}
              >
                {/* Indicador salud */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${company.alert_active ? "bg-red-500 animate-pulse" : "bg-emerald-500/50"}`} />
                {/* Con el interruptor puesto hay que poder distinguirlas de un vistazo. */}
                {esOculta(company) && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded bg-muted/60 text-muted-foreground/70 flex-shrink-0">
                    {company.es_interna ? "interna" : "archivada"}
                  </span>
                )}

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
        <div className="flex flex-col gap-3 md:flex-[2] md:min-h-0">

          {/* Gráfico: ingresos por empresa */}
          <div className="flex flex-col h-[260px] md:h-auto md:flex-[3] md:min-h-0 rounded-2xl border border-border/20 bg-card/40 backdrop-blur overflow-hidden">
            <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Ingresos por empresa</span>
              <span className="text-[10px] text-muted-foreground/40">mensual</span>
            </div>
            {/*
              * Filas con el monto escrito, no barras.
              * Con $65.000 y $1.100 en el mismo grafico, la barra chica mide 1,7% de
              * la grande y desaparece. La barra de fondo queda como referencia visual,
              * pero lo que se lee es el numero.
              */}
            <div className="flex-1 p-3 min-h-0 overflow-y-auto">
              {revenueChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs text-muted-foreground/40">Sin datos de facturación</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {revenueChartData.map((fila, i) => {
                    const total = revenueChartData.reduce((a, r) => a + (r.amount || 0), 0);
                    const parte = total > 0 ? (fila.amount / total) * 100 : 0;
                    const color = CHART_COLORS[i % CHART_COLORS.length];
                    return (
                      <div key={fila.name} className="rounded-xl border border-border/20 bg-background/40 px-3 py-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[12px] font-bold truncate">{fila.name}</span>
                          <span className="text-[14px] font-black tabular-nums whitespace-nowrap" style={{ color }}>
                            ${fila.amount.toLocaleString("es-CL")}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(parte, 1.5)}%`, backgroundColor: color }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground/50 mt-1 tabular-nums">
                          {parte.toFixed(1)}% de la facturación
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Mini-panel: estado tickets + alertas */}
          <div className="h-[130px] md:h-auto md:flex-[2] md:min-h-0 rounded-2xl border border-border/20 bg-card/40 backdrop-blur overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border/10 flex-shrink-0">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Estado actual</span>
            </div>
            <div className="flex-1 flex items-center justify-around px-4">

              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Ticket className="w-4.5 h-4.5 text-amber-500" />
                </div>
                <p className="text-2xl font-black text-amber-500 leading-none">{ticketCounts.sinResolver}</p>
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Sin resolver</p>
              </div>

              <div className="w-px h-10 bg-border/20" />

              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Ticket className="w-4.5 h-4.5 text-blue-500" />
                </div>
                <p className="text-2xl font-black text-blue-500 leading-none">{ticketCounts.abiertos}</p>
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Sin tocar</p>
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

      {/* ── Lo que cuesta operar cada empresa ──
          Va pegado a "Ingresos por empresa" porque las dos cifras se leen juntas:
          lo que entra por una empresa y lo que cuesta atenderla. La pantalla de
          Consumo de IA queda para el detalle por modelo y las tarifas. */}
      <CostoIAEmpresas onVerDetalle={onVerConsumoIA} />

      {/* ── Producto: como esta funcionando la IA y cuanto cuesta operarla ──
          Va debajo de la administracion del negocio porque es lo que se revisa a
          diario; lo de arriba se consulta cuando toca facturar. */}
      <PanelPlataforma
        /* Las mismas que la lista de al lado: si el admin oculta las internas, las
           métricas de abajo tampoco deberían contarlas. */
        empresas={empresasVisibles.map(c => ({ id: c.id, company_name: c.company_name }))}
        onVerAnalisis={onVerAnalisis}
        onVerReportes={onVerReportes}
      />
    </div>
  );
}
