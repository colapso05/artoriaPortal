import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, Clock, ChevronRight,
  MessageSquare, Loader2, RefreshCw, X, Send,
} from "lucide-react";

interface Report {
  id: string;
  created_at: string;
  error_type: string;
  description: string;
  status: string;
  admin_response: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  user_id: string;
  reported_by: string | null;
  company_id: string | null;
  conversation_id: string | null;
  wrong_response: string | null;
  expected_response: string | null;
  conversations?: { id: string; wa_id: string; profile_name: string | null } | null;
  company_config?: { id: string; company_name: string } | null;
}

interface Props {
  currentUserId: string;
  onOpenConversation?: (companyId: string, companyName: string, conversationId: string) => void;
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  wrong_answer: "Respuesta incorrecta",
  missed_context: "Perdió el contexto",
  hallucination: "Inventó información",
  escalation_fail: "No derivó correctamente",
  tone: "Tono inapropiado",
  other: "Otro",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pendiente: { label: "Pendiente", color: "text-amber-500 bg-amber-500/10 border-amber-500/20", icon: Clock },
  en_revision: { label: "En revisión", color: "text-blue-500 bg-blue-500/10 border-blue-500/20", icon: AlertTriangle },
  resuelto: { label: "Resuelto", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["pendiente"];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.color}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminAgentReports({ currentUserId, onOpenConversation }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Report | null>(null);
  const [adminResponse, setAdminResponse] = useState("");
  const [resolving, setResolving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const { toast } = useToast();

  const loadReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("agent_feedback")
      .select("*, conversations(id, wa_id, profile_name), company_config(id, company_name)")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error al cargar reportes", description: error.message, variant: "destructive" });
    } else {
      setReports(data ?? []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleSelect = (r: Report) => {
    setSelected(r);
    setAdminResponse(r.admin_response ?? "");
  };

  const handleResolve = async () => {
    if (!selected) return;
    setResolving(true);
    const { error } = await (supabase as any)
      .from("agent_feedback")
      .update({
        status: "resuelto",
        admin_response: adminResponse.trim() || null,
        resolved_at: new Date().toISOString(),
        resolved_by: currentUserId,
      })
      .eq("id", selected.id);
    setResolving(false);
    if (error) {
      toast({ title: "Error al resolver", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Reporte marcado como resuelto" });
      setReports(prev => prev.map(r =>
        r.id === selected.id
          ? { ...r, status: "resuelto", admin_response: adminResponse.trim() || null, resolved_at: new Date().toISOString() }
          : r
      ));
      setSelected(prev => prev ? { ...prev, status: "resuelto", admin_response: adminResponse.trim() || null } : null);
    }
  };

  const handleMarkReviewing = async () => {
    if (!selected) return;
    const { error } = await (supabase as any)
      .from("agent_feedback")
      .update({ status: "en_revision" })
      .eq("id", selected.id);
    if (!error) {
      setReports(prev => prev.map(r => r.id === selected.id ? { ...r, status: "en_revision" } : r));
      setSelected(prev => prev ? { ...prev, status: "en_revision" } : null);
    }
  };

  const filtered = filterStatus === "all" ? reports : reports.filter(r => r.status === filterStatus);
  const counts = {
    all: reports.length,
    pendiente: reports.filter(r => r.status === "pendiente").length,
    en_revision: reports.filter(r => r.status === "en_revision").length,
    resuelto: reports.filter(r => r.status === "resuelto").length,
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-border/40 overflow-hidden bg-card shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/30 bg-gradient-to-r from-card to-secondary/20 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold font-['Space_Grotesk']">Reportes IA</h2>
            <p className="text-[10px] text-muted-foreground">{reports.length} reportes totales</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["all", "pendiente", "en_revision", "resuelto"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${
                filterStatus === s
                  ? "bg-foreground text-background border-foreground"
                  : "text-muted-foreground bg-background/50 border-border/30 hover:border-border/60"
              }`}
            >
              {s === "all" ? "Todos" : STATUS_CONFIG[s]?.label} ({counts[s]})
            </button>
          ))}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadReports} title="Actualizar">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* List */}
        <div className={`${selected ? "hidden md:flex" : "flex"} flex-col w-full md:w-[420px] border-r border-border/20 overflow-y-auto`}>
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-xl bg-muted/20 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
              <CheckCircle2 className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">Sin reportes {filterStatus !== "all" ? "en este estado" : ""}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/10">
              {filtered.map(r => (
                <button
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  className={`w-full text-left px-4 py-3.5 hover:bg-secondary/30 transition-colors flex items-start gap-3 ${selected?.id === r.id ? "bg-primary/5" : ""}`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold truncate">
                        {ERROR_TYPE_LABELS[r.error_type] ?? r.error_type}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{r.description}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-muted-foreground/60">{formatDate(r.created_at)}</span>
                      {r.company_config?.company_name && (
                        <span className="text-[10px] bg-primary/10 text-primary font-semibold px-1.5 py-0.5 rounded">
                          {r.company_config.company_name}
                        </span>
                      )}
                      {r.conversations?.wa_id && (
                        <span className="text-[10px] text-muted-foreground/60 font-mono truncate">
                          {r.conversations.profile_name ?? r.conversations.wa_id}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0 mt-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selected ? (
            <motion.div
              key="detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col flex-1 overflow-y-auto"
            >
              {/* Detail header */}
              <div className="px-5 py-3 border-b border-border/20 flex items-center justify-between gap-3 sticky top-0 bg-card z-10">
                <div className="flex items-center gap-2 min-w-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7 md:hidden flex-shrink-0" onClick={() => setSelected(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-sm font-semibold truncate">
                    {ERROR_TYPE_LABELS[selected.error_type] ?? selected.error_type}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={selected.status} />
                  {selected.conversations?.id && selected.company_id && onOpenConversation && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] gap-1.5"
                      onClick={() => onOpenConversation(
                        selected.company_id!,
                        selected.company_config?.company_name ?? "",
                        selected.conversations!.id
                      )}
                    >
                      <MessageSquare className="w-3 h-3" />
                      Ver chat
                    </Button>
                  )}
                </div>
              </div>

              {/* Detail content */}
              <div className="p-5 space-y-5 flex-1">
                {/* Meta */}
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
                    <p className="text-muted-foreground font-medium uppercase tracking-wider text-[9px]">Fecha reporte</p>
                    <p className="font-semibold">{formatDate(selected.created_at)}</p>
                  </div>
                  <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
                    <p className="text-muted-foreground font-medium uppercase tracking-wider text-[9px]">Tipo de error</p>
                    <p className="font-semibold">{ERROR_TYPE_LABELS[selected.error_type] ?? selected.error_type}</p>
                  </div>
                  {selected.company_config && (
                    <div className="bg-secondary/30 rounded-lg p-3 space-y-1 col-span-2">
                      <p className="text-muted-foreground font-medium uppercase tracking-wider text-[9px]">Reportado por empresa</p>
                      <p className="font-semibold">{selected.company_config.company_name}</p>
                    </div>
                  )}
                  {selected.conversations && (
                    <div className="bg-secondary/30 rounded-lg p-3 space-y-1 col-span-2">
                      <p className="text-muted-foreground font-medium uppercase tracking-wider text-[9px]">Cliente del chat</p>
                      <p className="font-semibold">
                        {selected.conversations.profile_name
                          ? `${selected.conversations.profile_name} · ${selected.conversations.wa_id}`
                          : selected.conversations.wa_id}
                      </p>
                    </div>
                  )}
                  {selected.resolved_at && (
                    <div className="bg-emerald-500/10 rounded-lg p-3 space-y-1 col-span-2 border border-emerald-500/20">
                      <p className="text-emerald-600 dark:text-emerald-400 font-medium uppercase tracking-wider text-[9px]">Resuelto el</p>
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatDate(selected.resolved_at)}</p>
                    </div>
                  )}
                </div>

                {/* Wrong / Expected response */}
                {selected.wrong_response && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Lo que dijo la IA</p>
                    <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-4 text-[12px] leading-relaxed text-foreground/80">
                      {selected.wrong_response}
                    </div>
                  </div>
                )}
                {selected.expected_response && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Lo que debió hacer</p>
                    <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-4 text-[12px] leading-relaxed text-foreground/80">
                      {selected.expected_response}
                    </div>
                  </div>
                )}

                {/* Description */}
                {selected.description && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Descripción adicional</p>
                    <div className="bg-secondary/20 rounded-xl p-4 text-[12px] leading-relaxed border border-border/20">
                      {selected.description}
                    </div>
                  </div>
                )}

                {/* Admin response */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                    {selected.status === "resuelto" ? "Respuesta enviada" : "Respuesta al usuario (opcional)"}
                  </p>
                  {selected.status === "resuelto" ? (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-[12px] leading-relaxed text-emerald-700 dark:text-emerald-300">
                      {selected.admin_response ?? <span className="italic opacity-60">Sin respuesta escrita</span>}
                    </div>
                  ) : (
                    <Textarea
                      value={adminResponse}
                      onChange={e => setAdminResponse(e.target.value)}
                      placeholder="Explica qué se corrigió o qué acción se tomó..."
                      className="text-[12px] min-h-[100px] resize-none bg-secondary/20 border-border/30"
                    />
                  )}
                </div>

                {/* Actions */}
                {selected.status !== "resuelto" && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {selected.status === "pendiente" && (
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleMarkReviewing}>
                        <AlertTriangle className="w-3 h-3" />
                        Marcar en revisión
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleResolve}
                      disabled={resolving}
                    >
                      {resolving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Marcar como resuelto
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground flex-col gap-3">
              <AlertTriangle className="w-10 h-10 opacity-20" />
              <p className="text-sm">Selecciona un reporte para ver el detalle</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
