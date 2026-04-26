import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Zap, AlertTriangle, CheckCircle2,
  Clock, RefreshCw, X, CreditCard, Copy, Loader2, Send, MessageSquare,
} from "lucide-react";

interface PendingRequest {
  id: string;
  package_name: string;
  messages_count: number;
  price_clp: number;
  payment_status: string;
  admin_message: string | null;
  created_at: string;
  transfer_sent_at: string | null;
}

const REQUEST_STATUS: Record<string, { label: string; color: string; icon: any }> = {
  pending:       { label: "Esperando transferencia", color: "text-muted-foreground bg-secondary/50 border-border/30", icon: Clock },
  transfer_sent: { label: "Transferencia enviada — en revisión", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: Clock },
  questioned:    { label: "En consulta — revisa el mensaje", color: "text-amber-500 bg-amber-500/10 border-amber-500/20", icon: MessageSquare },
  confirmed:     { label: "Confirmado", color: "text-blue-500 bg-blue-500/10 border-blue-500/20", icon: CheckCircle2 },
  rejected:      { label: "Rechazado", color: "text-red-500 bg-red-500/10 border-red-500/20", icon: X },
};

interface Credits {
  balance: number;
  total_purchased: number;
  total_used: number;
}

interface Package {
  id: string;
  name: string;
  messages_count: number;
  price_clp: number;
  sort_order: number;
  is_active: boolean;
}

interface Transaction {
  id: string;
  created_at: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  status: string;
  admin_message?: string | null;
}

interface PurchaseModal {
  transaction_id: string;
  package_name: string;
  messages_count: number;
  price_clp: number;
  sent: boolean; // true after mark-transfer-sent
}

interface Props {
  companyId: string;
  userId: string;
}

function formatCLP(n: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const BANK_DETAILS = [
  { label: "Nombre",          value: "DEMIS ALEJANDRO ZUNIGA" },
  { label: "RUT",             value: "21.311.925-7" },
  { label: "Banco",           value: "Banco BCI" },
  { label: "Tipo de cuenta",  value: "Cuenta Corriente" },
  { label: "N° de cuenta",    value: "50458931" },
];

export default function CreditsManager({ companyId, userId }: Props) {
  const [credits, setCredits] = useState<Credits | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [loadingPkgs, setLoadingPkgs] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [modal, setModal] = useState<PurchaseModal | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { toast } = useToast();

  const loadCredits = useCallback(async () => {
    setLoadingCredits(true);
    const { data } = await (supabase as any)
      .rpc("get_company_credits", { p_company_id: companyId });
    const row = Array.isArray(data) ? data[0] : data;
    setCredits(row ?? { balance: 0, total_purchased: 0, total_used: 0 });
    setLoadingCredits(false);
  }, [companyId]);

  const loadPackages = useCallback(async () => {
    setLoadingPkgs(true);
    const { data } = await (supabase as any)
      .from("credit_packages")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    setPackages(data ?? []);
    setLoadingPkgs(false);
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await (supabase as any)
      .rpc("get_my_credit_transactions", { p_company_id: companyId });
    setHistory(data ?? []);
    setLoadingHistory(false);
  }, [companyId]);

  const loadPendingRequests = useCallback(async () => {
    const { data } = await (supabase as any)
      .rpc("get_my_pending_credit_requests", { p_company_id: companyId });
    setPendingRequests(data ?? []);
  }, [companyId]);

  useEffect(() => { loadCredits(); loadPackages(); loadHistory(); loadPendingRequests(); }, [loadCredits, loadPackages, loadHistory, loadPendingRequests]);

  // Realtime: balance updates
  useEffect(() => {
    const channel = supabase
      .channel(`credits-${companyId}`)
      .on("postgres_changes" as any,
        { event: "*", schema: "public", table: "company_credits", filter: `company_id=eq.${companyId}` },
        (payload: any) => {
          const row = payload.new ?? payload.old;
          if (row?.balance != null) {
            setCredits({ balance: row.balance, total_purchased: row.total_purchased, total_used: row.total_used });
            toast({ title: "✅ ¡Saldo actualizado!", description: `Tienes ${row.balance} mensajes disponibles.` });
          } else {
            // fallback: refetch if payload doesn't have expected fields
            loadCredits();
          }
          loadHistory();
          loadPendingRequests();
        }
      )
      .on("postgres_changes" as any,
        { event: "*", schema: "public", table: "credit_transactions", filter: `company_id=eq.${companyId}` },
        () => { loadPendingRequests(); loadHistory(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, toast, loadHistory, loadCredits, loadPendingRequests]);

  const handleBuy = async (pkg: Package) => {
    setRequesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-credits", {
        body: { company_id: companyId, package_id: pkg.id },
      });
      if (error) throw new Error(error.message ?? JSON.stringify(error));
      if (data?.error) throw new Error(data.error);
      const txId = data?.transaction_id ?? data?.id;
      if (!txId) throw new Error("Respuesta inválida del servidor");
      setModal({
        transaction_id: txId,
        package_name: data.package?.name ?? pkg.name,
        messages_count: data.package?.messages_count ?? pkg.messages_count,
        price_clp: data.package?.price_clp ?? pkg.price_clp,
        sent: false,
      });
    } catch (err: any) {
      toast({ title: "Error al iniciar solicitud", description: err.message ?? "Error desconocido", variant: "destructive" });
    }
    setRequesting(false);
  };

  const handleMarkSent = async () => {
    if (!modal) return;
    setMarkingSent(true);
    try {
      const { data: sentData, error } = await supabase.functions.invoke("mark-transfer-sent", {
        body: { transaction_id: modal.transaction_id },
      });
      if (error) throw new Error(error.message ?? JSON.stringify(error));
      if (sentData?.error) throw new Error(sentData.error);
      setModal(prev => prev ? { ...prev, sent: true } : null);
      loadHistory();
    } catch (err: any) {
      toast({ title: "Error al notificar", description: err.message, variant: "destructive" });
    }
    setMarkingSent(false);
  };

  const handleCopy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCopyAll = async () => {
    if (!modal) return;
    const lines = [
      ...BANK_DETAILS.map(d => `${d.label}: ${d.value}`),
      `Monto: ${formatCLP(modal.price_clp)}`,
      `Comentario (ID): ${modal.transaction_id}`,
    ].join("\n");
    await navigator.clipboard.writeText(lines);
    setCopied("all");
    setTimeout(() => setCopied(null), 2000);
  };

  const balancePct = credits && credits.total_purchased > 0
    ? Math.min(100, Math.round((credits.balance / credits.total_purchased) * 100))
    : 0;
  const lowBalance = credits && credits.balance < 100;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-6 p-1">

      {/* Balance card */}
      <div className="rounded-xl border border-border/40 bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold font-['Space_Grotesk']">Créditos WhatsApp</h2>
              <p className="text-[10px] text-muted-foreground">Mensajes disponibles para envío</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { loadCredits(); loadHistory(); }}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="p-5 space-y-4">
          {loadingCredits ? (
            <div className="h-16 rounded-xl bg-muted/20 animate-pulse" />
          ) : (
            <>
              {lowBalance && (
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-amber-600 dark:text-amber-400 font-medium leading-snug">
                    ⚠️ Te quedan pocos mensajes. Carga más para no interrumpir la atención a tus clientes.
                  </p>
                </div>
              )}
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className={`text-3xl font-black tabular-nums tracking-tight ${lowBalance ? "text-amber-500" : ""}`}>
                    {credits?.balance.toLocaleString("es-CL")}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">mensajes disponibles</p>
                </div>
                <div className="text-right text-[11px] text-muted-foreground space-y-0.5">
                  <p>Comprados: <span className="font-semibold text-foreground">{credits?.total_purchased.toLocaleString("es-CL")}</span></p>
                  <p>Usados: <span className="font-semibold text-foreground">{credits?.total_used.toLocaleString("es-CL")}</span></p>
                </div>
              </div>
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${lowBalance ? "bg-amber-500" : "bg-primary"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${balancePct}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-right">{balancePct}% restante</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Packages */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">Cargar créditos</h3>
        {loadingPkgs ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-xl bg-muted/20 animate-pulse" />)}
          </div>
        ) : packages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No hay paquetes disponibles</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {packages.map(pkg => {
              const perMsg = pkg.messages_count > 0 ? Math.round(pkg.price_clp / pkg.messages_count) : 0;
              return (
                <div key={pkg.id} className="rounded-xl border border-border/30 bg-card hover:border-primary/30 hover:shadow-md transition-all p-4 flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-bold">{pkg.messages_count.toLocaleString("es-CL")} mensajes</p>
                    <p className="text-xl font-black text-primary mt-0.5">{formatCLP(pkg.price_clp)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">({formatCLP(perMsg)} por mensaje)</p>
                  </div>
                  <Button size="sm" className="h-8 text-xs w-full mt-auto" onClick={() => handleBuy(pkg)} disabled={requesting}>
                    {requesting ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <CreditCard className="w-3 h-3 mr-1.5" />}
                    Solicitar
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">Solicitudes en proceso</h3>
          <div className="rounded-xl border border-border/30 bg-card overflow-hidden divide-y divide-border/10">
            {pendingRequests.map(req => {
              const st = REQUEST_STATUS[req.payment_status] ?? REQUEST_STATUS.pending;
              const StIcon = st.icon;
              return (
                <div key={req.id} className="px-4 py-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold">
                        {req.package_name
                          ? req.package_name
                          : req.messages_count != null
                            ? `${req.messages_count.toLocaleString("es-CL")} mensajes`
                            : "Solicitud de créditos"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{formatCLP(req.price_clp)} · {formatDate(req.created_at)}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded-full border flex-shrink-0 ${st.color}`}>
                      <StIcon className="w-2.5 h-2.5" />
                      {st.label}
                    </span>
                  </div>
                  {req.admin_message && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug">{req.admin_message}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History — only finalized transactions */}
      {!loadingHistory && history.filter((tx: any) => !["pending","transfer_sent","questioned"].includes(tx.payment_status ?? tx.status ?? "")).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">Historial de transacciones</h3>
          <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
            <div className="divide-y divide-border/10">
              {history.filter((tx: any) => !["pending","transfer_sent","questioned"].includes(tx.payment_status ?? tx.status ?? "")).map((tx: any) => {
                const ps = tx.payment_status ?? tx.status ?? "";
                const isRejected = ps === "rejected";
                const isUsage = tx.type === "usage" || tx.amount < 0;
                const isConfirmed = ps === "confirmed" || (tx.amount > 0 && !isRejected);

                let iconEl, iconBg, amountColor, amountLabel, descLabel;
                if (isRejected) {
                  iconEl = <X className="w-3.5 h-3.5 text-red-500" />;
                  iconBg = "bg-red-500/10";
                  amountColor = "text-red-500";
                  amountLabel = "Rechazado";
                  descLabel = tx.description ?? "Solicitud rechazada";
                } else if (isUsage) {
                  iconEl = <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />;
                  iconBg = "bg-secondary/50";
                  amountColor = "text-muted-foreground";
                  amountLabel = Math.abs(tx.amount ?? 0).toLocaleString("es-CL");
                  descLabel = tx.description ?? "Uso de mensajes";
                } else {
                  iconEl = <Zap className="w-3.5 h-3.5 text-emerald-500" />;
                  iconBg = "bg-emerald-500/10";
                  amountColor = "text-emerald-500";
                  amountLabel = `+${(tx.amount ?? 0).toLocaleString("es-CL")}`;
                  descLabel = tx.description ?? "Recarga de créditos";
                }

                return (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                      {iconEl}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate">{descLabel}</p>
                      {tx.admin_message && (
                        <p className="text-[10px] text-amber-500 truncate mt-0.5">💬 {tx.admin_message}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">{formatDate(tx.created_at)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-[12px] font-bold tabular-nums ${amountColor}`}>
                        {isRejected ? amountLabel : amountLabel}
                      </p>
                      {!isRejected && tx.balance_after != null && (
                        <p className="text-[10px] text-muted-foreground">saldo: {tx.balance_after.toLocaleString("es-CL")}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Purchase modal */}
      <AnimatePresence>
        {modal && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !markingSent && setModal(null)}
          >
            <motion.div
              className="bg-card border border-border/40 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5"
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              onClick={e => e.stopPropagation()}
            >
              {modal.sent ? (
                /* Confirmation state */
                <div className="text-center space-y-4 py-2">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold">¡Solicitud enviada!</h3>
                    <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                      Tu transferencia fue notificada. El administrador la revisará y acreditará los mensajes en breve.
                    </p>
                  </div>
                  <Button className="w-full h-10" onClick={() => setModal(null)}>Cerrar</Button>
                </div>
              ) : (
                /* Transfer details state */
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-bold">Paga con transferencia bancaria</h3>
                      <p className="text-[12px] text-muted-foreground mt-0.5">{modal.package_name} · {modal.messages_count.toLocaleString("es-CL")} msgs</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 -mt-1 -mr-1" onClick={() => setModal(null)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Amount */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">Monto a transferir</p>
                    <p className="text-3xl font-black text-primary">{formatCLP(modal.price_clp)}</p>
                  </div>

                  {/* Bank details */}
                  <div className="bg-secondary/30 rounded-xl divide-y divide-border/10 overflow-hidden">
                    {BANK_DETAILS.map(d => (
                      <div key={d.label} className="flex items-center justify-between px-4 py-2.5">
                        <div>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">{d.label}</p>
                          <p className="text-[12px] font-semibold">{d.value}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => handleCopy(d.label, d.value)}>
                          {copied === d.label ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Transaction ID comment */}
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500/80 mb-1">Escribe esto en el comentario de la transferencia</p>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-[11px] font-bold tracking-wide break-all text-foreground">{modal.transaction_id}</code>
                      <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => handleCopy("tid", modal.transaction_id)}>
                        {copied === "tid" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-10 text-xs gap-1.5" onClick={handleCopyAll}>
                      {copied === "all" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      Copiar todos los datos
                    </Button>
                    <Button className="flex-1 h-10 text-xs gap-1.5" onClick={handleMarkSent} disabled={markingSent}>
                      {markingSent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Ya realicé la transferencia
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
