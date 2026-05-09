import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Loader2, RefreshCw, Receipt, Clock, CheckCircle2, AlertTriangle,
  X, Send, Calendar, ChevronDown, ChevronUp, Copy, Check,
} from "lucide-react";
import { format, parseISO, differenceInDays, isPast } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ──────────────────────────────────────────────────────────────────────

interface InvoicePayment {
  id: string;
  submitted_at: string;
  payment_notes: string;
  status: "pending" | "validated" | "rejected";
  reviewed_at: string | null;
}

interface Invoice {
  id: string;
  period: string;
  amount: number;
  status: "pending" | "under_review" | "paid" | "overdue" | "cancelled";
  issued_at: string;
  due_date: string;
  paid_at: string | null;
  admin_notes: string | null;
  invoice_payments: InvoicePayment[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending:      { label: "Pendiente de pago",          color: "text-amber-500 bg-amber-500/10 border-amber-500/20",   Icon: Clock },
  under_review: { label: "Pago en revisión",            color: "text-blue-500 bg-blue-500/10 border-blue-500/20",     Icon: Clock },
  paid:         { label: "Pagado",                      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", Icon: CheckCircle2 },
  overdue:      { label: "Vencido",                     color: "text-red-500 bg-red-500/10 border-red-500/20",        Icon: AlertTriangle },
  cancelled:    { label: "Cancelado",                   color: "text-muted-foreground bg-secondary/50 border-border/30", Icon: X },
} as const;

const PAYMENT_STATUS_CFG = {
  pending:   { label: "Esperando revisión", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  validated: { label: "Validado",           color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  rejected:  { label: "Rechazado",          color: "text-red-500 bg-red-500/10 border-red-500/20" },
} as const;

function formatPeriod(period: string): string {
  const [y, m] = period.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  const s = format(d, "MMMM yyyy", { locale: es });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatCLP(n: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(n);
}

function daysLabel(dueDate: string): { text: string; urgent: boolean } {
  const days = differenceInDays(parseISO(dueDate), new Date());
  if (days < 0)  return { text: `Venció hace ${Math.abs(days)} día${Math.abs(days) !== 1 ? "s" : ""}`, urgent: true };
  if (days === 0) return { text: "Vence hoy", urgent: true };
  if (days === 1) return { text: "Vence mañana", urgent: true };
  return { text: `Vence en ${days} días`, urgent: days <= 2 };
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props { companyId: string; userId: string; }

export default function BillingManager({ companyId }: Props) {
  const { toast } = useToast();
  const [invoices, setInvoices]       = useState<Invoice[]>([]);
  const [bankDetails, setBankDetails] = useState<string>("");
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [modal, setModal]             = useState<Invoice | null>(null);
  const [notes, setNotes]             = useState("");
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);

  useEffect(() => { load(); }, [companyId]);

  async function load() {
    setLoading(true);
    const [{ data: invData, error }, { data: cfgData }] = await Promise.all([
      supabase.functions.invoke("billing-get-invoices", { body: { company_id: companyId } }),
      (supabase as any)
        .from("billing_config")
        .select("bank_details")
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);
    if (error) toast({ title: "Error al cargar facturación", description: error.message, variant: "destructive" });
    else setInvoices(invData?.invoices || []);
    if (cfgData?.bank_details) setBankDetails(cfgData.bank_details);
    setLoading(false);
  }

  function copyBankDetails() {
    navigator.clipboard.writeText(bankDetails);
    setCopied(true);
    toast({ title: "Datos copiados ✓" });
    setTimeout(() => setCopied(false), 2000);
  }

  async function submitPayment() {
    if (!modal) return;
    if (!notes.trim()) {
      toast({ title: "Agrega una nota", description: "Describe tu transferencia (banco, monto, referencia).", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.functions.invoke("billing-submit-payment", {
      body: { invoice_id: modal.id, payment_notes: notes.trim() },
    });
    if (error) {
      toast({ title: "Error al enviar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Pago declarado ✓", description: "El administrador revisará tu transferencia pronto." });
      setModal(null);
      setNotes("");
      load();
    }
    setSubmitting(false);
  }

  const active  = invoices.find(i => ["pending", "under_review", "overdue"].includes(i.status));
  const history = invoices.filter(i => ["paid", "cancelled"].includes(i.status));

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/20 bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Receipt className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold">Facturación</h1>
            <p className="text-[11px] text-muted-foreground/60">Historial de boletas y pagos</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-xl" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6 max-w-2xl mx-auto">

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
            </div>
          ) : (
            <>
              {/* ── Boleta activa ── */}
              {active ? (
                <ActiveInvoiceCard
                  invoice={active}
                  bankDetails={bankDetails}
                  copied={copied}
                  onCopy={copyBankDetails}
                  onPay={() => { setModal(active); setNotes(""); }}
                />
              ) : (
                !loading && history.length === 0 && (
                  <EmptyState />
                )
              )}

              {/* ── Historial ── */}
              {(history.length > 0 || (invoices.length > 0 && !active)) && (
                <section>
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
                    Historial
                  </h2>
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {[...history].reverse().map(inv => (
                        <HistoryRow
                          key={inv.id}
                          invoice={inv}
                          expanded={expanded === inv.id}
                          onToggle={() => setExpanded(expanded === inv.id ? null : inv.id)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* ── Modal: declarar pago ── */}
      <Dialog open={!!modal} onOpenChange={open => { if (!open) { setModal(null); setNotes(""); } }}>
        <DialogContent className="max-w-md bg-card border-border/30" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" /> Declarar pago
            </DialogTitle>
          </DialogHeader>

          {modal && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/40 flex justify-between items-center">
                <div>
                  <p className="text-xs text-muted-foreground/60">Boleta</p>
                  <p className="text-sm font-bold">{formatPeriod(modal.period)}</p>
                </div>
                <p className="text-lg font-extrabold text-primary">{formatCLP(modal.amount)}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Detalle de tu transferencia
                </label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ej: Transferí $65.000 desde Banco Estado, comprobante Nº 12345, 03/05/2026"
                  rows={4}
                  className="resize-none text-sm rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground/50">
                  Incluye banco, monto, referencia o comprobante para agilizar la validación.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setModal(null); setNotes(""); }} className="rounded-xl">
              Cancelar
            </Button>
            <Button onClick={submitPayment} disabled={submitting || !notes.trim()} className="rounded-xl gap-2">
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Enviar declaración
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ActiveInvoiceCard({ invoice, bankDetails, copied, onCopy, onPay }: {
  invoice: Invoice;
  bankDetails: string;
  copied: boolean;
  onCopy: () => void;
  onPay: () => void;
}) {
  const cfg = STATUS_CFG[invoice.status];
  const { text: dueText, urgent } = daysLabel(invoice.due_date);
  const lastPayment = invoice.invoice_payments?.slice(-1)[0];
  const canPay = invoice.status === "pending" || invoice.status === "overdue";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-5 space-y-4 ${
        invoice.status === "overdue"
          ? "border-red-500/30 bg-red-500/5"
          : invoice.status === "under_review"
          ? "border-blue-500/30 bg-blue-500/5"
          : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">Boleta actual</p>
          <p className="text-xl font-extrabold mt-0.5">{formatCLP(invoice.amount)}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{formatPeriod(invoice.period)}</p>
        </div>
        <Badge className={`text-[11px] border ${cfg.color}`}>
          <cfg.Icon className="w-3 h-3 mr-1" />
          {cfg.label}
        </Badge>
      </div>

      {/* Dates */}
      <div className="flex gap-4 text-[12px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          Emitida: {format(parseISO(invoice.issued_at), "dd/MM/yyyy")}
        </div>
        <div className={`flex items-center gap-1.5 font-semibold ${urgent ? "text-red-500" : "text-muted-foreground"}`}>
          <Clock className="w-3.5 h-3.5" />
          {dueText}
        </div>
      </div>

      {/* Under review notice */}
      {invoice.status === "under_review" && lastPayment && (
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm space-y-1">
          <p className="font-semibold text-blue-600 dark:text-blue-400 text-[12px]">
            ✓ Pago declarado el {format(parseISO(lastPayment.submitted_at), "dd/MM/yyyy HH:mm")}
          </p>
          <p className="text-[11px] text-muted-foreground/70">{lastPayment.payment_notes}</p>
          <p className="text-[10px] text-blue-500/70">El administrador revisará tu transferencia.</p>
        </div>
      )}

      {/* Overdue warning */}
      {invoice.status === "overdue" && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-600 dark:text-red-400 font-medium">
          ⚠️ El servicio ha sido suspendido por falta de pago. Declara tu pago para restablecer el acceso.
        </div>
      )}

      {/* Admin notes */}
      {invoice.admin_notes && (
        <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-[12px] text-muted-foreground">
          <p className="font-semibold mb-0.5">Nota del administrador:</p>
          <p>{invoice.admin_notes}</p>
        </div>
      )}

      {/* Datos bancarios */}
      {bankDetails && canPay && (
        <div className="rounded-xl border border-border/40 bg-background overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/30">
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Datos para transferir
            </span>
            <button
              onClick={onCopy}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              {copied
                ? <><Check className="w-3.5 h-3.5" /> Copiado</>
                : <><Copy className="w-3.5 h-3.5" /> Copiar</>
              }
            </button>
          </div>
          <pre className="px-3 py-2.5 text-[12px] text-foreground/80 font-mono whitespace-pre-wrap leading-relaxed">
            {bankDetails}
          </pre>
        </div>
      )}

      {/* Action */}
      {canPay && (
        <Button onClick={onPay} className="w-full rounded-xl gap-2">
          <Send className="w-3.5 h-3.5" /> Ya realicé el pago
        </Button>
      )}
    </motion.div>
  );
}

function HistoryRow({ invoice, expanded, onToggle }: { invoice: Invoice; expanded: boolean; onToggle: () => void }) {
  const cfg = STATUS_CFG[invoice.status];

  return (
    <motion.div
      layout
      className="rounded-xl border border-border/40 bg-card overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <cfg.Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground/50" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold">{formatPeriod(invoice.period)}</span>
          <span className="text-[11px] text-muted-foreground/60 ml-2">
            {format(parseISO(invoice.issued_at), "dd/MM/yyyy")}
          </span>
        </div>
        <span className="text-sm font-bold">{formatCLP(invoice.amount)}</span>
        <Badge className={`text-[10px] border ${cfg.color} ml-2`}>{cfg.label}</Badge>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-2 border-t border-border/30">
              {invoice.paid_at && (
                <p className="text-[12px] text-emerald-600 dark:text-emerald-400">
                  ✓ Pagado el {format(parseISO(invoice.paid_at), "dd/MM/yyyy HH:mm")}
                </p>
              )}
              {invoice.admin_notes && (
                <p className="text-[12px] text-muted-foreground/70">
                  <span className="font-semibold">Nota admin: </span>{invoice.admin_notes}
                </p>
              )}
              {invoice.invoice_payments?.map(p => (
                <div key={p.id} className={`p-2.5 rounded-lg border text-[11px] ${PAYMENT_STATUS_CFG[p.status].color}`}>
                  <p className="font-semibold">{PAYMENT_STATUS_CFG[p.status].label} — {format(parseISO(p.submitted_at), "dd/MM/yyyy")}</p>
                  {p.payment_notes && <p className="text-muted-foreground/70 mt-0.5">{p.payment_notes}</p>}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center">
        <Receipt className="w-6 h-6 text-muted-foreground/30" />
      </div>
      <p className="text-sm font-semibold text-muted-foreground/60">Sin boletas aún</p>
      <p className="text-[12px] text-muted-foreground/40 max-w-[240px]">
        Las boletas aparecerán aquí cuando el administrador configure tu facturación.
      </p>
    </div>
  );
}
