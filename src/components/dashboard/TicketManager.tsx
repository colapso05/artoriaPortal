import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Ticket, Plus, MessageSquare, Clock, User, AlertTriangle,
  CheckCircle2, CircleDot, Pause, X, Send, Search, ArrowUpDown,
  ArrowUp, ArrowDown, SlidersHorizontal, Info, Sparkles, RotateCcw,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Types ──────────────────────────────────────────────────────── */

type TicketCategory = "soporte_tecnico" | "consulta_comercial" | "ventas" | "pagos";
type TicketStatus = "abierto" | "en_progreso" | "esperando_cliente" | "resuelto" | "cerrado";
type TicketPriority = "baja" | "media" | "alta" | "urgente";
type SortField = "created_at" | "priority" | "status" | "updated_at";
type SortDir = "asc" | "desc";

interface TicketData {
  id: string;
  company_id: string | null;
  conversation_id: string | null;
  title: string;
  description: string | null;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  customer_rut: string | null;
  created_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TicketNote {
  id: string;
  ticket_id: string;
  content: string;
  author_name: string | null;
  author_id: string | null;
  is_internal: boolean;
  created_at: string;
}

/* ─── Constants ──────────────────────────────────────────────────── */

const categoryLabels: Record<TicketCategory, string> = {
  soporte_tecnico: "Soporte Técnico",
  consulta_comercial: "Consulta Comercial",
  ventas: "Ventas",
  pagos: "Pagos",
};

const statusLabels: Record<TicketStatus, string> = {
  abierto: "Abierto",
  en_progreso: "En Progreso",
  esperando_cliente: "Esperando Cliente",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
};

const priorityLabels: Record<TicketPriority, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
};

const statusIcons: Record<TicketStatus, any> = {
  abierto: CircleDot,
  en_progreso: Clock,
  esperando_cliente: Pause,
  resuelto: CheckCircle2,
  cerrado: X,
};

const priorityColors: Record<TicketPriority, string> = {
  baja: "bg-muted text-muted-foreground",
  media: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  alta: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  urgente: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusColors: Record<TicketStatus, string> = {
  abierto: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  en_progreso: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  esperando_cliente: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  resuelto: "bg-primary/10 text-primary border-primary/20",
  cerrado: "bg-muted text-muted-foreground border-border",
};

const priorityWeight: Record<TicketPriority, number> = {
  urgente: 4, alta: 3, media: 2, baja: 1,
};

const statusWeight: Record<TicketStatus, number> = {
  abierto: 5, en_progreso: 4, esperando_cliente: 3, resuelto: 2, cerrado: 1,
};

/* ─── Onboarding Tooltip ────────────────────────────────────────── */

function OnboardingTip({ children, tip, side = "bottom" }: { children: React.ReactNode; tip: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-[220px] text-xs font-normal bg-card border-border shadow-lg">
        <div className="flex items-start gap-1.5">
          <Info className="w-3 h-3 text-primary mt-0.5 shrink-0" />
          <span>{tip}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/* ─── Component ──────────────────────────────────────────────────── */

export default function TicketManager({ companyId }: { companyId?: string }) {
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [newNote, setNewNote] = useState("");

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", category: "soporte_tecnico" as TicketCategory,
    priority: "media" as TicketPriority, customer_name: "", customer_phone: "", customer_rut: "", assigned_to: "",
  });

  const { toast } = useToast();

  useEffect(() => {
    loadTickets();
    const channel = supabase
      .channel("tickets-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => loadTickets())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (selectedTicket) loadNotes(selectedTicket.id);
  }, [selectedTicket?.id]);

  const loadTickets = async () => {
    let query = supabase.from("tickets").select("*").order("created_at", { ascending: false });
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { data } = await query;
    if (data) setTickets(data as unknown as TicketData[]);
    setLoading(false);
  };

  const loadNotes = async (ticketId: string) => {
    const { data } = await supabase.from("ticket_notes").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
    if (data) setNotes(data as unknown as TicketNote[]);
  };

  const handleCreate = async () => {
    if (!form.title) { toast({ title: "Título requerido", variant: "destructive" }); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("tickets").insert({
      title: form.title,
      description: form.description || null,
      category: form.category,
      priority: form.priority,
      customer_name: form.customer_name || null,
      customer_phone: form.customer_phone || null,
      customer_rut: form.customer_rut || null,
      assigned_to: form.assigned_to || null,
      created_by: session?.user?.id || null,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ticket creado exitosamente", description: `"${form.title}" ha sido registrado.` });
      setCreateOpen(false);
      setForm({ title: "", description: "", category: "soporte_tecnico", priority: "media", customer_name: "", customer_phone: "", customer_rut: "", assigned_to: "" });
      loadTickets();
    }
  };

  const updateStatus = async (ticketId: string, status: TicketStatus) => {
    const updates: any = { status };
    if (status === "resuelto") updates.resolved_at = new Date().toISOString();
    await supabase.from("tickets").update(updates).eq("id", ticketId);
    if (selectedTicket?.id === ticketId) setSelectedTicket(prev => prev ? { ...prev, status, ...(status === "resuelto" ? { resolved_at: new Date().toISOString() } : {}) } : null);
    loadTickets();
  };

  const addNote = async () => {
    if (!newNote.trim() || !selectedTicket) return;
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("ticket_notes").insert({
      ticket_id: selectedTicket.id,
      content: newNote.trim(),
      author_name: "Admin",
      author_id: session?.user?.id || null,
    } as any);
    setNewNote("");
    loadNotes(selectedTicket.id);
  };

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }, [sortField]);

  const resetFilters = () => {
    setFilterStatus("all");
    setFilterCategory("all");
    setFilterPriority("all");
    setSearchQuery("");
    setSortField("created_at");
    setSortDir("desc");
  };

  /* ─── Filtered + Sorted ─────────────────────────────────── */

  const activeStatuses: TicketStatus[] = ["abierto", "en_progreso", "esperando_cliente"];

  const filtered = useMemo(() => {
    let result = tickets.filter(t => {
      if (filterStatus === "active") return activeStatuses.includes(t.status);
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      return true;
    });

    if (filterCategory !== "all") result = result.filter(t => t.category === filterCategory);
    if (filterPriority !== "all") result = result.filter(t => t.priority === filterPriority);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.customer_name?.toLowerCase().includes(q) ||
        t.customer_rut?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.assigned_to?.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "created_at":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "updated_at":
          cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
        case "priority":
          cmp = priorityWeight[a.priority] - priorityWeight[b.priority];
          break;
        case "status":
          cmp = statusWeight[a.status] - statusWeight[b.status];
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [tickets, filterStatus, filterCategory, filterPriority, searchQuery, sortField, sortDir]);

  /* ─── Stats ─────────────────────────────────────────────── */

  const stats = useMemo(() => ({
    open: tickets.filter(t => t.status === "abierto").length,
    inProgress: tickets.filter(t => t.status === "en_progreso").length,
    waiting: tickets.filter(t => t.status === "esperando_cliente").length,
    resolved: tickets.filter(t => t.status === "resuelto").length,
    urgent: tickets.filter(t => t.priority === "urgente" && activeStatuses.includes(t.status)).length,
  }), [tickets]);

  const hasActiveFilters = filterStatus !== "active" || filterCategory !== "all" || filterPriority !== "all" || searchQuery.trim() !== "";

  /* ─── Render ────────────────────────────────────────────── */

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[calc(100vh-8rem)] rounded-xl border border-border/40 overflow-hidden bg-card shadow-sm">
        {/* ── Stats Bar ── */}
        <div className="px-4 py-3 border-b border-border/30 bg-gradient-to-r from-card to-secondary/20">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Ticket className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-bold font-['Space_Grotesk']">Centro de Tickets</h2>
                <p className="text-[10px] text-muted-foreground">{filtered.length} de {tickets.length} tickets</p>
              </div>
            </div>
            <OnboardingTip tip="Crea un nuevo ticket para registrar solicitudes, incidencias o consultas de tus clientes." side="left">
              <Button size="sm" className="h-8 gap-1.5 text-xs shadow-sm" onClick={() => setCreateOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> Nuevo Ticket
              </Button>
            </OnboardingTip>
          </div>

          {/* Quick stats pills */}
          <div className="flex gap-1.5 flex-wrap">
            <OnboardingTip tip="Haz clic en una categoría para filtrar rápidamente los tickets por estado.">
              <button onClick={() => { setFilterStatus("abierto"); }} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${filterStatus === "abierto" ? "ring-1 ring-emerald-500" : ""} bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20`}>
                <CircleDot className="w-2.5 h-2.5" /> {stats.open} Abiertos
              </button>
            </OnboardingTip>
            <button onClick={() => setFilterStatus("en_progreso")} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${filterStatus === "en_progreso" ? "ring-1 ring-blue-500" : ""} bg-blue-500/10 text-blue-500 hover:bg-blue-500/20`}>
              <Clock className="w-2.5 h-2.5" /> {stats.inProgress} En Progreso
            </button>
            <button onClick={() => setFilterStatus("esperando_cliente")} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${filterStatus === "esperando_cliente" ? "ring-1 ring-amber-500" : ""} bg-amber-500/10 text-amber-500 hover:bg-amber-500/20`}>
              <Pause className="w-2.5 h-2.5" /> {stats.waiting} Esperando
            </button>
            <button onClick={() => setFilterStatus("resuelto")} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${filterStatus === "resuelto" ? "ring-1 ring-primary" : ""} bg-primary/10 text-primary hover:bg-primary/20`}>
              <CheckCircle2 className="w-2.5 h-2.5" /> {stats.resolved} Resueltos
            </button>
            {stats.urgent > 0 && (
              <button onClick={() => setFilterPriority(filterPriority === "urgente" ? "all" : "urgente")} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${filterPriority === "urgente" ? "ring-1 ring-destructive" : ""} bg-destructive/10 text-destructive hover:bg-destructive/20 animate-pulse`}>
                <AlertTriangle className="w-2.5 h-2.5" /> {stats.urgent} Urgentes
              </button>
            )}
            {filterStatus !== "all" && (
              <button onClick={() => setFilterStatus("all")} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground hover:bg-secondary/80 transition-all">
                <Sparkles className="w-2.5 h-2.5" /> Ver todos
              </button>
            )}
          </div>
        </div>

        {/* ── Main Content ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* ── Ticket List ── */}
          <div className={`${selectedTicket ? "hidden md:flex" : "flex"} flex-col w-full md:w-[420px] border-r border-border/30`}>
            {/* Search + Filters */}
            <div className="p-3 border-b border-border/20 space-y-2">
              <div className="flex gap-2">
                <OnboardingTip tip="Busca tickets por título, cliente, descripción o persona asignada." side="bottom">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar tickets..."
                      className="h-8 pl-8 text-xs bg-secondary/40 border-border/30 focus:bg-card"
                    />
                  </div>
                </OnboardingTip>
                <OnboardingTip tip="Abre filtros avanzados para refinar la vista por categoría, prioridad u ordenamiento." side="left">
                  <Button variant={showFilters ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => setShowFilters(!showFilters)}>
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </Button>
                </OnboardingTip>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground" onClick={resetFilters}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>

              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Categoría</label>
                        <Select value={filterCategory} onValueChange={setFilterCategory}>
                          <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas</SelectItem>
                            {Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Prioridad</label>
                        <Select value={filterPriority} onValueChange={setFilterPriority}>
                          <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas</SelectItem>
                            {Object.entries(priorityLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Ordenar por</label>
                        <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                          <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="created_at">Fecha creación</SelectItem>
                            <SelectItem value="updated_at">Última actividad</SelectItem>
                            <SelectItem value="priority">Prioridad</SelectItem>
                            <SelectItem value="status">Estado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end mt-1.5">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}>
                        {sortDir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                        {sortDir === "desc" ? "Más recientes primero" : "Más antiguos primero"}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Ticket List Items */}
            <ScrollArea className="flex-1">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="animate-pulse space-y-2 px-3 py-3 rounded-lg bg-secondary/30">
                      <div className="h-3.5 bg-secondary rounded w-3/4" />
                      <div className="flex gap-2">
                        <div className="h-4 bg-secondary rounded w-16" />
                        <div className="h-4 bg-secondary rounded w-12" />
                      </div>
                      <div className="h-2.5 bg-secondary rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                    <Ticket className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Sin tickets</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">
                    {hasActiveFilters ? "Prueba ajustando los filtros" : "Crea tu primer ticket"}
                  </p>
                </div>
              ) : (
                <div className="p-1.5">
                  <AnimatePresence mode="popLayout">
                    {filtered.map((t, idx) => {
                      const StatusIcon = statusIcons[t.status];
                      const isSelected = selectedTicket?.id === t.id;
                      return (
                        <motion.button
                          key={t.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.15, delay: idx * 0.02 }}
                          onClick={() => setSelectedTicket(t)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-all group ${isSelected
                            ? "bg-primary/8 border border-primary/20 shadow-sm"
                            : "hover:bg-secondary/50 border border-transparent"
                            }`}
                        >
                          <div className="flex items-start gap-2.5">
                            {/* Priority indicator */}
                            <div className={`w-1 self-stretch rounded-full shrink-0 mt-0.5 ${t.priority === "urgente" ? "bg-destructive" :
                              t.priority === "alta" ? "bg-amber-500" :
                                t.priority === "media" ? "bg-blue-500" :
                                  "bg-muted-foreground/30"
                              }`} />

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-[13px] font-medium truncate leading-tight">{t.title}</p>
                                {t.priority === "urgente" && (
                                  <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <Badge variant="outline" className={`text-[10px] h-[18px] px-1.5 gap-0.5 font-medium ${statusColors[t.status]}`}>
                                  <StatusIcon className="w-2.5 h-2.5" />
                                  {statusLabels[t.status]}
                                </Badge>
                                <Badge variant="outline" className={`text-[10px] h-[18px] px-1.5 font-medium ${priorityColors[t.priority]}`}>
                                  {priorityLabels[t.priority]}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">
                                  {categoryLabels[t.category]}
                                </span>
                              </div>

                              <div className="flex items-center justify-between mt-1.5">
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                                  {t.customer_rut && (
                                    <span className="font-mono bg-secondary/50 px-1 rounded">{t.customer_rut}</span>
                                  )}
                                  {t.customer_name && (
                                    <span className="flex items-center gap-0.5"><User className="w-2.5 h-2.5" />{t.customer_name}</span>
                                  )}
                                  {t.assigned_to && (
                                    <span className="text-primary/70">→ {t.assigned_to}</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground/50">
                                  {format(new Date(t.created_at), "dd/MM/yy HH:mm", { locale: es })}
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* ── Ticket Detail ── */}
          <div className={`${selectedTicket ? "flex" : "hidden md:flex"} flex-col flex-1`}>
            {!selectedTicket ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-8">
                <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center">
                  <Ticket className="w-7 h-7 text-primary/30" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Selecciona un ticket</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">Elige un ticket del panel izquierdo para ver sus detalles</p>
                </div>
              </div>
            ) : (
              <>
                {/* Detail Header */}
                <div className="px-4 py-3 border-b border-border/30 bg-gradient-to-r from-card to-secondary/10 flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Button variant="ghost" size="sm" className="md:hidden h-7 w-7 p-0 shrink-0" onClick={() => setSelectedTicket(null)}>
                        ←
                      </Button>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate font-['Space_Grotesk']">{selectedTicket.title}</h3>
                        <p className="text-[10px] text-muted-foreground">
                          Creado {format(new Date(selectedTicket.created_at), "dd MMM yyyy · HH:mm", { locale: es })}
                          {selectedTicket.resolved_at && (
                            <> · Resuelto {format(new Date(selectedTicket.resolved_at), "dd MMM HH:mm", { locale: es })}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <OnboardingTip tip="Cambia el estado del ticket para reflejar su progreso actual." side="left">
                      <Select value={selectedTicket.status} onValueChange={(v) => updateStatus(selectedTicket.id, v as TicketStatus)}>
                        <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(statusLabels) as TicketStatus[]).map(s => {
                            const Icon = statusIcons[s];
                            return (
                              <SelectItem key={s} value={s}>
                                <span className="flex items-center gap-1.5">
                                  <Icon className="w-3 h-3" />{statusLabels[s]}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </OnboardingTip>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    <Badge variant="outline" className={`text-[10px] ${priorityColors[selectedTicket.priority]}`}>
                      {selectedTicket.priority === "urgente" && <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />}
                      {priorityLabels[selectedTicket.priority]}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{categoryLabels[selectedTicket.category]}</Badge>
                    {selectedTicket.customer_rut && (
                      <Badge variant="outline" className="text-[10px] gap-1 font-mono bg-secondary/40">RUT: {selectedTicket.customer_rut}</Badge>
                    )}
                    {selectedTicket.customer_name && (
                      <Badge variant="outline" className="text-[10px] gap-1"><User className="w-2.5 h-2.5" />{selectedTicket.customer_name}</Badge>
                    )}
                    {selectedTicket.customer_phone && (
                      <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">{selectedTicket.customer_phone}</Badge>
                    )}
                    {selectedTicket.assigned_to && (
                      <Badge variant="outline" className="text-[10px] gap-1 bg-primary/10 text-primary border-primary/20">
                        Asignado: {selectedTicket.assigned_to}
                      </Badge>
                    )}
                  </div>

                  {selectedTicket.description && (
                    <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed bg-secondary/30 rounded-lg px-3 py-2">
                      {selectedTicket.description}
                    </p>
                  )}
                </div>

                {/* Notes Timeline */}
                <ScrollArea className="flex-1 px-4 py-3">
                  <div className="space-y-2.5">
                    {notes.length === 0 ? (
                      <div className="text-center py-8">
                        <MessageSquare className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground/60">Sin notas aún</p>
                        <p className="text-[10px] text-muted-foreground/40 mt-1">Agrega una nota para iniciar el seguimiento</p>
                      </div>
                    ) : notes.map((n, idx) => (
                      <motion.div
                        key={n.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-secondary/30 rounded-lg px-3 py-2.5 border border-border/10"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground/80">{n.author_name || "Sistema"}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(n.created_at), "dd MMM HH:mm", { locale: es })}
                          </span>
                        </div>
                        <p className="text-[13px] mt-1.5 leading-relaxed">{n.content}</p>
                      </motion.div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Note Input */}
                <div className="px-4 py-3 border-t border-border/30 flex-shrink-0 bg-card/80">
                  <OnboardingTip tip="Escribe una nota interna para documentar avances, comunicaciones o decisiones sobre este ticket." side="top">
                    <div className="flex gap-2">
                      <Input
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Agregar nota de seguimiento..."
                        className="flex-1 h-9 text-sm bg-secondary/30 border-border/20"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNote(); } }}
                      />
                      <Button size="sm" onClick={addNote} disabled={!newNote.trim()} className="h-9 gap-1.5 shadow-sm">
                        <Send className="w-3.5 h-3.5" /> Enviar
                      </Button>
                    </div>
                  </OnboardingTip>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Create Dialog ── */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="bg-card border-border/30 max-w-md">
            <DialogHeader>
              <DialogTitle className="font-['Space_Grotesk'] flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-primary" />
                </div>
                Nuevo Ticket
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Título *</Label>
                <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} className="mt-1" placeholder="Describe brevemente el problema o solicitud" />
              </div>
              <div>
                <Label className="text-xs">Descripción</Label>
                <Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} className="mt-1" rows={3} placeholder="Detalles adicionales..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Categoría</Label>
                  <Select value={form.category} onValueChange={(v) => setForm(p => ({ ...p, category: v as TicketCategory }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Prioridad</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm(p => ({ ...p, priority: v as TicketPriority }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(priorityLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">RUT del Cliente</Label>
                <Input
                  value={form.customer_rut}
                  onChange={(e) => {
                    // Format: remove dots, keep hyphen, allow only digits + K/k + hyphen
                    const raw = e.target.value.replace(/\./g, "").toUpperCase();
                    const clean = raw.replace(/[^0-9K-]/g, "");
                    setForm(p => ({ ...p, customer_rut: clean }));
                  }}
                  className="mt-1 font-mono"
                  placeholder="12345678-9"
                  maxLength={10}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Sin puntos, con guión (ej: 12345678-9)</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Cliente</Label>
                  <Input value={form.customer_name} onChange={(e) => setForm(p => ({ ...p, customer_name: e.target.value }))} className="mt-1" placeholder="Nombre" />
                </div>
                <div>
                  <Label className="text-xs">Teléfono</Label>
                  <Input value={form.customer_phone} onChange={(e) => setForm(p => ({ ...p, customer_phone: e.target.value }))} className="mt-1" placeholder="+569..." />
                </div>
              </div>
              <div>
                <Label className="text-xs">Asignar a</Label>
                <Input value={form.assigned_to} onChange={(e) => setForm(p => ({ ...p, assigned_to: e.target.value }))} className="mt-1" placeholder="Nombre del responsable" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} className="gap-1.5">
                <Ticket className="w-3.5 h-3.5" /> Crear Ticket
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
