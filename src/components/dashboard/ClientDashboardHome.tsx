import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Ticket, MessageCircle, Users, AlertTriangle,
  Clock, CheckCircle2, TrendingUp, ArrowRight, Inbox, UserCheck
} from "lucide-react";
import { motion } from "framer-motion";

interface ClientDashboardProps {
  companyId: string | null;
  companyName: string;
  userId: string;
  userName: string;
  userRole?: string;
  operatorRoles?: string[];
  onConversationClick?: (conversationId: string) => void;
}

interface TicketStats {
  open: number;
  inProgress: number;
  resolved: number;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.08, duration: 0.4 },
  }),
};

export default function ClientDashboardHome({ companyId, companyName, userId, userName, userRole, operatorRoles, onConversationClick }: ClientDashboardProps) {
  const [ticketStats, setTicketStats] = useState<TicketStats>({ open: 0, inProgress: 0, resolved: 0 });
  const [recentConversations, setRecentConversations] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [activeAlerts, setActiveAlerts] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [companyId]);

  const loadData = async () => {
    if (!companyId) return;
    try {
      const [tOpen, tProgress, tResolved, convos, alerts] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "abierto"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "en_progreso"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", companyId).in("status", ["resuelto", "cerrado"]),
        supabase.from("conversations").select("id, wa_id, profile_name, last_message_preview, last_message_at, unread_count").eq("company_id", companyId).order("last_message_at", { ascending: false }).limit(5),
        supabase.from("coverage_zones").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("alert_active", true),
      ]);

      setTicketStats({ open: tOpen.count || 0, inProgress: tProgress.count || 0, resolved: tResolved.count || 0 });
      setRecentConversations(convos.data || []);
      setActiveAlerts(alerts.count || 0);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          if (userRole === 'administrador' || userRole === 'admin') {
            const resp = await supabase.functions.invoke("manage-company-user", {
              body: { action: "list", company_id: companyId },
            });
            if (resp.data?.users) setTeamMembers(resp.data.users);
          }
        }
      } catch { }
    } catch (e) {
      console.error("Error loading client dashboard:", e);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (ts: string) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 rounded-2xl bg-muted/15 animate-pulse border border-border/10" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map(i => (
            <div key={i} className="h-64 rounded-2xl bg-muted/15 animate-pulse border border-border/10" />
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Abiertos", value: ticketStats.open, icon: Clock, color: "text-amber-500", bg: "from-amber-500/15 to-amber-500/5", border: "border-amber-500/20" },
    { label: "En Progreso", value: ticketStats.inProgress, icon: TrendingUp, color: "text-blue-500", bg: "from-blue-500/15 to-blue-500/5", border: "border-blue-500/20" },
    { label: "Resueltos", value: ticketStats.resolved, icon: CheckCircle2, color: "text-emerald-500", bg: "from-emerald-500/15 to-emerald-500/5", border: "border-emerald-500/20" },
    { label: "Alertas", value: activeAlerts, icon: AlertTriangle, color: "text-red-500", bg: "from-red-500/15 to-red-500/5", border: "border-red-500/20" },
  ];

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold">Cuenta No Vinculada</h2>
        <p className="text-muted-foreground max-w-md">
          Tu cuenta no tiene una empresa asignada o hubo un error al cargar tus permisos.
          Por favor, contacta con soporte o intenta cerrar sesión y volver a entrar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h2 className="text-3xl font-extrabold tracking-tight font-display mb-2.5">
          Bienvenido {userName ? <span className="text-primary">{userName.split(' ')[0]}</span> : "Usuario"}
        </h2>
        
        {userRole && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-widest border-primary/30 text-primary">
              {userRole}
            </Badge>
            {userRole === "operador" && operatorRoles && operatorRoles.map(role => {
              const labelMap: Record<string, string> = {
                soporte_tecnico: "Soporte Técnico",
                ventas: "Ventas",
                pagos: "Pagos",
                consulta_comercial: "Consulta Comercial"
              };
              return (
                <Badge key={role} variant="secondary" className="text-[9px] uppercase tracking-wider bg-secondary/60">
                  {labelMap[role] || role}
                </Badge>
              );
            })}
          </div>
        )}
        
        <p className="text-muted-foreground/70 text-sm mt-1.5">Resumen de tu actividad en tiempo real</p>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div key={card.label} custom={i} initial="hidden" animate="visible" variants={cardVariants}>
            <Card className={`border ${card.border} bg-gradient-to-br ${card.bg} backdrop-blur-sm hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group rounded-2xl overflow-hidden`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{card.label}</p>
                    <p className={`text-4xl font-black mt-1.5 font-display ${card.color}`}>{card.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-2xl bg-background/50 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-inner`}>
                    <card.icon className={`w-6 h-6 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Conversations */}
        <motion.div custom={4} initial="hidden" animate="visible" variants={cardVariants}>
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

        {/* Team */}
        <motion.div custom={5} initial="hidden" animate="visible" variants={cardVariants}>
          <Card className="border-border/20 bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2.5 uppercase tracking-wide">
                <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5 text-violet-500" />
                </div>
                Equipo
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {teamMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/20 flex items-center justify-center mb-3">
                    <UserCheck className="w-7 h-7 text-muted-foreground/30" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground/60">Sin miembros de equipo</p>
                  <p className="text-xs text-muted-foreground/40 mt-1">Agrega miembros desde la sección Equipo</p>
                </div>
              ) : (
                <div className="divide-y divide-border/10">
                  {teamMembers.slice(0, 6).map((m: any, i: number) => {
                    const roleColors: Record<string, string> = {
                      administrador: "bg-amber-500/15 text-amber-500 border-amber-500/20",
                      supervisor: "bg-blue-500/15 text-blue-500 border-blue-500/20",
                      operador: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
                    };
                    return (
                      <motion.div
                        key={m.user_id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.05 }}
                        className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-secondary/30 transition-all duration-200"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 ring-1 ring-primary/10">
                            <span className="text-xs font-bold text-primary">
                              {(m.display_name || m.email || "?").charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{m.display_name || m.email}</p>
                            <p className="text-xs text-muted-foreground/50 truncate">{m.email}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] font-bold rounded-full ${roleColors[m.role] || ""}`}>
                          {m.role}
                        </Badge>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
