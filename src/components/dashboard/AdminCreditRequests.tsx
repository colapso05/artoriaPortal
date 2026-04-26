import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard, RefreshCw, CheckCircle2, X, AlertTriangle, MessageSquare,
  Clock, Loader2, ChevronRight, Building2,
} from "lucide-react";

interface CreditRequest {
  id: string;           // primary key from RPC
  transaction_id?: string; // fallback alias
  company_id: string;
  company_name: string;
  package_name: string;
  messages_count: number;
  price_clp: number;
  status: string;
  admin_message: string | null;
  created_at: string;
  transfer_sent_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:        { label: "Esperando transferencia", color: "text-muted-foreground bg-secondary/50 border-border/30",        icon: Clock },
  transfer_sent:  { label: "Transferencia enviada",   color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",      icon: CheckCircle2 },
  questioned:     { label: "En consulta",             color: "text-amber-500 bg-amber-500/10 border-amber-500/20",            icon: MessageSquare },
  confirmed:      { label: "Confirmado",              color: "text-blue-500 bg-blue-500/10 border-blue-500/20",               icon: CheckCircle2 },
  rejected:       { label: "Rechazado",               color: "text-red-500 bg-red-500/10 border-red-500/20",                  icon: X },
};

function formatCLP(n: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AdminCreditRequests() {
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CreditRequest | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("get_pending_credit_requests");
    if (error) toast({ title: "Error al cargar solicitudes", description: error.message, variant: "destructive" });
    // RPC returns field as "payment_status", normalize to "status"
    const normalized = (data ?? []).map((r: any) => ({
      ...r,
      status: (r.payment_status ?? r.status ?? "pending").trim().toLowerCase(),
    }));
    setRequests(normalized);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Realtime: auto-refresh when any credit transaction changes status
  useEffect(() => {
    const channel = supabase
      .channel("admin-credit-requests-realtime")
      .on("postgres_changes" as any, {
        event: "*",
        schema: "public",
        table: "credit_transactions",
      }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const handleAction = async (action: "confirm" | "reject" | "question") => {
    if (!selected) return;
    if (action === "question" && !actionMsg.trim()) {
      toast({ title: "Escribe un mensaje antes de enviar la consulta", variant: "destructive" });
      return;
    }
    setActing(action);
    const txId = selected.id ?? selected.transaction_id;
    const { error } = await supabase.functions.invoke("admin-credit-action", {
      body: {
        transaction_id: txId,
        action,
        ...(actionMsg.trim() ? { message: actionMsg.trim() } : {}),
      },
    });
    setActing(null);
    if (error) {
      toast({ title: "Error al ejecutar acción", description: error.message, variant: "destructive" });
      return;
    }
    const labels = { confirm: "✅ Créditos confirmados", reject: "❌ Solicitud rechazada", question: "💬 Consulta enviada" };
    toast({ title: labels[action] });
    setActionMsg("");
    setSelected(null);
    load();
  };

  const filtered = requests.filter(r => {
    if (filterStatus === "active") return ["pending", "transfer_sent", "questioned"].includes(r.status);
    if (filterStatus === "done") return ["confirmed", "rejected"].includes(r.status);
    return true;
  });

  const counts = {
    active: requests.filter(r => ["pending", "transfer_sent", "questioned"].includes(r.status)).length,
    done: requests.filter(r => ["confirmed", "rejected"].includes(r.status)).length,
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-border/40 overflow-hidden bg-card shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/30 bg-gradient-to-r from-card to-secondary/20 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold font-['Space_Grotesk']">Solicitudes de Créditos</h2>
            <p className="text-[10px] text-muted-foreground">{counts.active} solicitudes activas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(["active", "done", "all"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${
                filterStatus === f
                  ? "bg-foreground text-background border-foreground"
                  : "text-muted-foreground bg-background/50 border-border/30 hover:border-border/60"
              }`}
            >
              {f === "active" ? `Activas (${counts.active})` : f === "done" ? `Procesadas (${counts.done})` : "Todas"}
            </button>
          ))}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load}>
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
              {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted/20 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
              <CheckCircle2 className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">Sin solicitudes en este filtro</p>
            </div>
          ) : (
            <div className="divide-y divide-border/10">
              {filtered.map(r => {
                const st = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
                const StIcon = st.icon;
                return (
                  <button
                    key={r.id ?? r.transaction_id}
                    onClick={() => { setSelected(r); setActionMsg(""); }}
                    className={`w-full text-left px-4 py-3.5 hover:bg-secondary/30 transition-colors flex items-start gap-3 ${(selected?.id ?? selected?.transaction_id) === (r.id ?? r.transaction_id) ? "bg-primary/5" : ""}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-bold truncate">{r.company_name}</span>
                        <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${st.color}`}>
                          <StIcon className="w-2.5 h-2.5" />
                          {st.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {r.package_name} · {r.messages_count.toLocaleString("es-CL")} msgs · <span className="font-semibold text-foreground">{formatCLP(r.price_clp)}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">{formatDate(r.created_at)}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0 mt-1" />
                  </button>
                );
              })}
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
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7 md:hidden" onClick={() => setSelected(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-sm font-bold truncate">{selected.company_name}</span>
                </div>
                {(() => { const st = STATUS_CONFIG[selected.status] ?? STATUS_CONFIG.pending; const StIcon = st.icon; return (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${st.color}`}>
                    <StIcon className="w-2.5 h-2.5" />{st.label}
                  </span>
                ); })()}
              </div>

              {/* Detail content */}
              <div className="p-5 space-y-5 flex-1">
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
                    <p className="text-muted-foreground font-medium uppercase tracking-wider text-[9px]">Paquete</p>
                    <p className="font-bold">{selected.package_name}</p>
                    <p className="text-muted-foreground">{selected.messages_count.toLocaleString("es-CL")} mensajes</p>
                  </div>
                  <div className="bg-primary/5 border border-primary/15 rounded-lg p-3 space-y-1">
                    <p className="text-muted-foreground font-medium uppercase tracking-wider text-[9px]">Monto</p>
                    <p className="text-xl font-black text-primary">{formatCLP(selected.price_clp)}</p>
                  </div>
                  <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
                    <p className="text-muted-foreground font-medium uppercase tracking-wider text-[9px]">Solicitado</p>
                    <p className="font-semibold">{formatDate(selected.created_at)}</p>
                  </div>
                  {selected.transfer_sent_at && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 space-y-1">
                      <p className="text-emerald-600 dark:text-emerald-400 font-medium uppercase tracking-wider text-[9px]">Transferencia notificada</p>
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatDate(selected.transfer_sent_at)}</p>
                    </div>
                  )}
                  <div className="bg-secondary/30 rounded-lg p-3 space-y-1 col-span-2">
                    <p className="text-muted-foreground font-medium uppercase tracking-wider text-[9px]">ID de transacción</p>
                    <p className="font-mono text-[11px] break-all">{selected.id ?? selected.transaction_id}</p>
                  </div>
                </div>

                {/* Admin message if any */}
                {selected.admin_message && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80">Mensaje previo enviado</p>
                    <p className="text-[12px] leading-relaxed">{selected.admin_message}</p>
                  </div>
                )}

                {/* Actions */}
                {["pending", "transfer_sent", "questioned"].includes(selected.status) && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Acciones</p>

                    {/* Question textarea */}
                    <Textarea
                      value={actionMsg}
                      onChange={e => setActionMsg(e.target.value)}
                      placeholder="Mensaje opcional (obligatorio para 'Preguntar')..."
                      className="text-[12px] min-h-[80px] resize-none bg-secondary/20 border-border/30"
                    />

                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleAction("confirm")}
                        disabled={!!acting}
                      >
                        {acting === "confirm" ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Confirmar pago
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5 text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                        onClick={() => handleAction("question")}
                        disabled={!!acting}
                      >
                        {acting === "question" ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
                        Preguntar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5 text-red-500 border-red-500/30 hover:bg-red-500/10"
                        onClick={() => handleAction("reject")}
                        disabled={!!acting}
                      >
                        {acting === "reject" ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                        Rechazar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground flex-col gap-3">
              <CreditCard className="w-10 h-10 opacity-20" />
              <p className="text-sm">Selecciona una solicitud para ver el detalle</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
