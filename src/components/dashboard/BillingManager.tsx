import { useState, useEffect, useRef } from "react";
import { initMercadoPago, CardPayment } from "@mercadopago/sdk-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, RefreshCw, Receipt, Clock, CheckCircle2, AlertTriangle,
  X, Calendar, ChevronDown, ChevronUp, CreditCard, Repeat, Ban, Download,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
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
  pending:      { label: "Pendiente de pago",     color: "text-amber-500 bg-amber-500/10 border-amber-500/20",       Icon: Clock },
  under_review: { label: "Pago en procesamiento", color: "text-blue-500 bg-blue-500/10 border-blue-500/20",          Icon: Clock },
  paid:         { label: "Pagado",                color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", Icon: CheckCircle2 },
  overdue:      { label: "Vencido",               color: "text-red-500 bg-red-500/10 border-red-500/20",             Icon: AlertTriangle },
  cancelled:    { label: "Cancelado",             color: "text-muted-foreground bg-secondary/50 border-border/30",   Icon: X },
} as const;

const PAYMENT_STATUS_CFG = {
  pending:   { label: "Procesando",  color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  validated: { label: "Confirmado",  color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  rejected:  { label: "Rechazado",  color: "text-red-500 bg-red-500/10 border-red-500/20" },
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

// ── MP init — rastrea la última key usada para reinicializar si cambia ─────────
let mpInitializedKey = "";


// ── Component ──────────────────────────────────────────────────────────────────

interface Subscription {
  id: string | null;
  status: "pending" | "authorized" | "cancelled" | null;
  init_point?: string | null;
}

interface Props { companyId: string; userId: string; userEmail?: string; }

export default function BillingManager({ companyId, userEmail: userEmailProp }: Props) {
  const { toast } = useToast();
  const [invoices, setInvoices]               = useState<Invoice[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [expanded, setExpanded]               = useState<string | null>(null);
  const [subscription, setSubscription]       = useState<Subscription>({ id: null, status: null });

  // Email resuelto: usa el prop si llega, si no lo obtiene de la sesión activa
  const [resolvedEmail, setResolvedEmail]     = useState(userEmailProp || "");
  useEffect(() => {
    if (!resolvedEmail) {
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user?.email) setResolvedEmail(data.user.email);
      });
    }
  }, []);
  // Alias para el resto del código
  const userEmail = resolvedEmail;

  // Ref para que el onSubmit del brick siempre use el email más reciente
  // (evita race condition donde el closure captura userEmail vacío)
  const userEmailRef = useRef(resolvedEmail);
  useEffect(() => {
    userEmailRef.current = resolvedEmail;
  }, [resolvedEmail]);

  // Estado del brick de pago
  const [brickOpen, setBrickOpen]             = useState(false);
  const [brickInvoice, setBrickInvoice]       = useState<Invoice | null>(null);
  const [brickPrefId, setBrickPrefId]         = useState<string | null>(null);
  const [brickReady, setBrickReady]           = useState(false);
  const [brickError, setBrickError]           = useState<string | null>(null);
  const [submitting, setSubmitting]           = useState(false);
  const [brickKey, setBrickKey]               = useState(0);
  const [isSubscription, setIsSubscription]   = useState(false);

  // ── Detectar retorno desde Mercado Pago (back_url fallback) ──────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billingStatus = params.get("billing");
    if (!billingStatus) return;

    const cleanUrl = window.location.pathname +
      window.location.search.replace(/[?&]billing=[^&]*/g, "").replace(/^&/, "?").replace(/\?$/, "");
    window.history.replaceState({}, "", cleanUrl || window.location.pathname);

    if (billingStatus === "success") {
      toast({ title: "✅ Pago procesado", description: "Tu pago fue exitoso. La boleta se actualizará en unos momentos." });
    } else if (billingStatus === "failure") {
      toast({ title: "Pago no completado", description: "El pago no pudo procesarse. Intenta nuevamente.", variant: "destructive" });
    } else if (billingStatus === "pending") {
      toast({ title: "Pago en proceso", description: "Tu pago está siendo procesado. La boleta se actualizará cuando se confirme." });
    } else if (billingStatus === "subscribed") {
      toast({ title: "✅ Suscripción activada", description: "Tu tarjeta quedó guardada. El cobro se realizará automáticamente cada mes." });
    }
  }, []);

  useEffect(() => { load(); }, [companyId]);

  // ── Realtime: refrescar boletas automáticamente cuando el webhook actualice la BD ──
  useEffect(() => {
    const channel = supabase
      .channel(`invoice-updates-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "invoices",
          filter: `company_id=eq.${companyId}`,
        },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("billing-get-invoices", {
      body: { company_id: companyId },
    });
    if (error) toast({ title: "Error al cargar facturación", description: error.message, variant: "destructive" });
    else {
      setInvoices(data?.invoices || []);
      setSubscription(data?.subscription ?? { id: null, status: null });
    }
    setLoading(false);
  }


  // ── Cancelar suscripción ──────────────────────────────────────────────────────
  async function handleCancelSubscription() {
    if (!subscription.id) return;
    const { error } = await supabase.functions.invoke("billing-mp-cancel-subscription", {
      body: { company_id: companyId },
    });
    if (error) {
      toast({ title: "Error al cancelar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Suscripción cancelada", description: "Volverás al modo de pago manual." });
    load();
  }

  // ── Abrir formulario de pago embebido ─────────────────────────────────────────
  async function handleMercadoPago(invoice: Invoice) {
    setCreatingPayment(true);
    const { data, error } = await supabase.functions.invoke("billing-mp-create-preference", {
      body: { invoice_id: invoice.id },
    });
    setCreatingPayment(false);

    if (error || !data?.preference_id || !data?.public_key) {
      toast({
        title: "Error al iniciar pago",
        description: error?.message ?? "No se pudo generar el formulario de pago.",
        variant: "destructive",
      });
      return;
    }

    // Inicializar SDK de MP (o reinicializar si cambió la key, ej: test → producción)
    if (mpInitializedKey !== data.public_key) {
      initMercadoPago(data.public_key, { locale: "es-CL" });
      mpInitializedKey = data.public_key;
    }

    setBrickInvoice(invoice);
    setBrickPrefId(data.preference_id);
    setBrickReady(false);
    setBrickError(null);
    setIsSubscription(false);
    setBrickOpen(true);
  }

  function closeBrick() {
    setBrickOpen(false);
    // Delay para que termine la animación de cierre del Dialog antes de
    // desmontar el Brick — evita el error "removeChild: parameter is not a Node"
    setTimeout(() => {
      setBrickInvoice(null);
      setBrickPrefId(null);
      setBrickError(null);
    }, 350);
    setSubmitting(false);
    setIsSubscription(false);
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
              {active ? (
                <ActiveInvoiceCard
                  invoice={active}
                  subscription={subscription}
                  creatingPayment={creatingPayment}
                  onMercadoPago={() => handleMercadoPago(active)}
                  onCancelSubscription={handleCancelSubscription}
                />
              ) : (
                !loading && history.length === 0 && <EmptyState />
              )}

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

      {/* ── Dialog con el formulario de pago embebido ── */}
      <Dialog open={brickOpen} onOpenChange={(open) => { if (!open) closeBrick(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" style={{ color: "#009ee3" }} />
              Pagar con Mercado Pago
            </DialogTitle>
            {brickInvoice && (
              <DialogDescription>
                {formatPeriod(brickInvoice.period)} — {formatCLP(brickInvoice.amount)}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="mt-2">
            {/* Toggle renovación mensual */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/30 mb-3">
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-emerald-500" />
                  Renovación mensual
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  {isSubscription
                    ? "Tu tarjeta se cobrará automáticamente cada mes. Podés cancelar cuando quieras."
                    : "Pago único por este período solamente."}
                </p>
              </div>
              <Switch
                checked={isSubscription}
                onCheckedChange={setIsSubscription}
                className="ml-4 flex-shrink-0"
              />
            </div>

            {/* Monto total */}
            {brickInvoice && (
              <div className="flex items-center justify-between px-1 mb-3">
                <span className="text-sm text-muted-foreground">
                  {isSubscription ? "Total mensual" : "Total a pagar"}
                </span>
                <span className="text-xl font-extrabold tabular-nums">
                  {formatCLP(brickInvoice.amount)}
                </span>
              </div>
            )}

            {/* Error de pago rechazado — se muestra dentro del diálogo */}
            {brickError && (
              <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-[13px] text-red-600 dark:text-red-400 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{brickError}</span>
              </div>
            )}

            {/* Spinner mientras carga el brick */}
            {!brickReady && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
              </div>
            )}

            {/* Payment Brick de Mercado Pago */}
            {brickInvoice && (
              <div className={brickReady ? "block" : "hidden"}>
                <CardPayment
                  key={brickKey}
                  initialization={{
                    amount: brickInvoice.amount,
                    payer: {
                      email: userEmail || "",
                    },
                  }}
                  customization={{
                    visual: {
                      hideFormTitle: true,
                      style: {
                        theme: "default",
                      },
                    },
                  }}
                  onReady={() => setBrickReady(true)}
                  onError={(error) => {
                    console.error("MP Brick error:", JSON.stringify(error), error);
                    if ((error as any)?.type === "non_critical") return;
                    setBrickError("Error en el formulario de pago. Intenta de nuevo.");
                  }}
                  onSubmit={async (params) => {
                    const formData = params as any;
                    const selectedPaymentMethod = formData.payment_method_id;

                    setBrickError(null);
                    setSubmitting(true);

                    // Email siempre desde el ref (no el closure, evita race condition)
                    const email = userEmailRef.current || userEmail || "";

                    // Formatear RUT: "213119257" → "21311925-7"
                    const rawRut = formData.payer?.identification?.number ?? "";
                    const formattedRut = rawRut.includes("-")
                      ? rawRut
                      : rawRut.replace(/[.\s]/g, "").replace(/^(.+)(\w)$/, "$1-$2");

                    const enrichedFormData = {
                      ...formData,
                      payer: {
                        ...(formData.payer ?? {}),
                        email,
                        first_name: formData.payer?.first_name || formData.cardholder?.name?.split(" ")[0] || "",
                        last_name:  formData.payer?.last_name  || formData.cardholder?.name?.split(" ").slice(1).join(" ") || "",
                        identification: {
                          type: formData.payer?.identification?.type ?? "RUT",
                          number: formattedRut,
                        },
                      },
                    };

                    try {
                      // ── Suscripción mensual ──
                      if (isSubscription) {
                        const { data: result, error } = await supabase.functions.invoke(
                          "billing-mp-create-subscription",
                          {
                            body: {
                              company_id: companyId,
                              card_token_id: formData.token,
                              payer_email: email,
                            },
                          }
                        );

                        if (error || result?.error) {
                          // Extraer mensaje del body de la respuesta (Supabase lo pone en error.context)
                          let errMsg = result?.error ?? "";
                          if (!errMsg && error) {
                            try {
                              const body = await (error as any).context?.json?.();
                              errMsg = body?.error ?? "";
                            } catch { /* ignore */ }
                          }
                          setBrickError(errMsg || "Error al activar el cobro automático. Intenta nuevamente.");
                          setBrickKey(k => k + 1);
                          setBrickReady(false);
                          setSubmitting(false);
                          return;
                        }

                        const st = result?.status;
                        if (st === "authorized" || st === "pending") {
                          closeBrick();
                          setSubscription({ id: result.preapproval_id ?? null, status: st });
                          toast({
                            title: st === "authorized" ? "✅ Cobro automático activado" : "Suscripción en proceso",
                            description: st === "authorized"
                              ? "Tu tarjeta fue guardada. Se cobrará automáticamente cada mes."
                              : "El cobro automático se activará en breve.",
                          });
                          setTimeout(() => load(), 2000);
                        } else {
                          setBrickError("No se pudo activar el cobro automático. Intenta con otra tarjeta.");
                          setBrickKey(k => k + 1);
                          setBrickReady(false);
                          setSubmitting(false);
                        }
                        return;
                      }

                      // ── Pago único ──
                      const { data: result, error } = await supabase.functions.invoke(
                        "billing-mp-process-payment",
                        {
                          body: {
                            invoice_id: brickInvoice?.id,
                            form_data: enrichedFormData,
                            payment_method: selectedPaymentMethod,
                          },
                        }
                      );

                      const st = result?.status;

                      if (error || result?.error) {
                        setBrickError(error?.message ?? result?.error ?? "Error al procesar el pago. Intenta nuevamente.");
                        setSubmitting(false);
                        return;
                      }

                      if (st === "rejected") {
                        const REJECTION_MESSAGES: Record<string, string> = {
                          cc_rejected_bad_filled_other:    "El banco rechazó la tarjeta. Verifica que tenga compras online habilitadas en tu app del banco.",
                          cc_rejected_bad_filled_date:     "Fecha de vencimiento incorrecta.",
                          cc_rejected_bad_filled_cvv:      "CVV incorrecto.",
                          cc_rejected_bad_filled_card_number: "Número de tarjeta incorrecto.",
                          cc_rejected_insufficient_amount: "Fondos insuficientes en la tarjeta.",
                          cc_rejected_call_for_authorize:  "El banco requiere autorización. Contacta a tu banco o aprueba desde la app.",
                          cc_rejected_card_disabled:       "Tarjeta bloqueada para compras online. Habilítala desde la app de tu banco.",
                          cc_rejected_duplicated_payment:  "Pago duplicado. Ya existe un cobro reciente por este monto.",
                          cc_rejected_high_risk:           "Pago rechazado por seguridad. Intenta con otra tarjeta.",
                        };
                        const detail = result?.status_detail ?? result?.detail;
                        const msg = REJECTION_MESSAGES[detail] ?? `Tarjeta rechazada (${detail ?? "motivo desconocido"}). Intenta con otra tarjeta o habilita compras online desde tu banco.`;
                        setBrickError(msg);
                        // Solo reinicializar cuando el token fue consumido (errores de datos de tarjeta)
                        // Para rechazos del banco/antifraude NO reinicializar — el token sigue siendo válido
                        const needsNewToken = ["cc_rejected_bad_filled_cvv", "cc_rejected_bad_filled_date",
                          "cc_rejected_bad_filled_card_number", "cc_rejected_bad_filled_other"].includes(detail);
                        if (needsNewToken) {
                          setBrickKey(k => k + 1);
                          setBrickReady(false);
                        }
                        setSubmitting(false);
                        return;
                      }

                      // Pago exitoso o en proceso — cerrar y notificar
                      closeBrick();
                      if (st === "approved") {
                        toast({ title: "✅ Pago aprobado", description: "Tu boleta ha sido pagada exitosamente." });
                      } else if (st === "in_process" || st === "pending") {
                        toast({ title: "Pago en proceso", description: "Tu pago está siendo procesado. La boleta se actualizará pronto." });
                      } else {
                        toast({ title: "Pago recibido", description: "La boleta se actualizará en unos momentos." });
                      }
                      setTimeout(() => load(), 2000);

                    } catch (err) {
                      setBrickError("No se pudo conectar con el servidor. Intenta nuevamente.");
                      setSubmitting(false);
                    }
                  }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Comprobante de pago ────────────────────────────────────────────────────────

function downloadReceipt(invoice: Invoice) {
  const period   = formatPeriod(invoice.period);
  const amount   = formatCLP(invoice.amount);
  const issuedAt = format(parseISO(invoice.issued_at), "dd 'de' MMMM 'de' yyyy", { locale: es });
  const paidAt   = invoice.paid_at
    ? format(parseISO(invoice.paid_at), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: es })
    : "—";
  const ref      = invoice.id.split("-")[0].toUpperCase();
  const generatedAt = format(new Date(), "dd/MM/yyyy HH:mm", { locale: es });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Comprobante ${period}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;padding:40px 16px;color:#111827}
  .card{max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.09)}
  .top{background:#059669;padding:36px 32px;text-align:center;color:#fff}
  .icon{width:60px;height:60px;background:rgba(255,255,255,.2);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:30px}
  .top h1{font-size:22px;font-weight:800}
  .top p{font-size:12px;opacity:.8;margin-top:4px}
  .amt{text-align:center;padding:28px 32px;border-bottom:1px solid #f3f4f6}
  .amt-lbl{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280}
  .amt-val{font-size:44px;font-weight:900;color:#059669;margin-top:4px}
  .rows{padding:8px 32px 24px}
  .row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #f9fafb;font-size:13px}
  .row:last-child{border:none}
  .lbl{color:#6b7280}
  .val{font-weight:600;text-align:right}
  .badge{background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  .mono{font-family:monospace;background:#f3f4f6;padding:2px 8px;border-radius:4px;font-size:12px;color:#6b7280}
  .foot{background:#f9fafb;padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6}
  @media print{body{background:#fff;padding:0}.card{box-shadow:none;border-radius:0;max-width:100%}}
</style>
</head>
<body>
<div class="card">
  <div class="top">
    <div class="icon">✓</div>
    <h1>Pago confirmado</h1>
    <p>Comprobante de pago · Portal Artoria</p>
  </div>
  <div class="amt">
    <div class="amt-lbl">Total pagado</div>
    <div class="amt-val">${amount}</div>
  </div>
  <div class="rows">
    <div class="row"><span class="lbl">Período</span><span class="val">${period}</span></div>
    <div class="row"><span class="lbl">Emitida</span><span class="val">${issuedAt}</span></div>
    <div class="row"><span class="lbl">Fecha de pago</span><span class="val">${paidAt}</span></div>
    <div class="row"><span class="lbl">Método</span><span class="val">Mercado Pago</span></div>
    <div class="row"><span class="lbl">Estado</span><span class="val"><span class="badge">Pagado</span></span></div>
    <div class="row"><span class="lbl">Referencia</span><span class="val"><span class="mono">${ref}</span></span></div>
  </div>
  <div class="foot">Portal Artoria · Generado el ${generatedAt}</div>
</div>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");
  if (win) win.onafterprint = () => URL.revokeObjectURL(url);
  else URL.revokeObjectURL(url);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ActiveInvoiceCard({ invoice, subscription, creatingPayment, onMercadoPago, onCancelSubscription }: {
  invoice: Invoice;
  subscription: Subscription;
  creatingPayment: boolean;
  onMercadoPago: () => void;
  onCancelSubscription: () => void;
}) {
  const cfg = STATUS_CFG[invoice.status];
  const { text: dueText, urgent } = daysLabel(invoice.due_date);
  const canPay = invoice.status === "pending" || invoice.status === "overdue";
  const subActive = subscription.status === "authorized";

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
          <p className="text-2xl font-extrabold mt-0.5">{formatCLP(invoice.amount)}</p>
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

      {/* Pago en procesamiento */}
      {invoice.status === "under_review" && (
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[12px] text-blue-600 dark:text-blue-400">
          ⏳ Mercado Pago está procesando tu pago. Esto puede tardar unos minutos.
        </div>
      )}

      {/* Vencido */}
      {invoice.status === "overdue" && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-600 dark:text-red-400 font-medium">
          ⚠️ El servicio ha sido suspendido por falta de pago. Realiza el pago para restablecer el acceso.
        </div>
      )}

      {/* Nota del admin */}
      {invoice.admin_notes && (
        <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-[12px] text-muted-foreground">
          <p className="font-semibold mb-0.5">Nota del administrador:</p>
          <p>{invoice.admin_notes}</p>
        </div>
      )}

      {/* ── Suscripción activa ── */}
      {subActive && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Repeat className="w-4 h-4" />
            Cobro automático mensual activo
          </div>
          {(invoice.status === "pending" || invoice.status === "overdue") ? (
            <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
              Tu pago está siendo procesado por Mercado Pago. La boleta se actualizará automáticamente, puede tardar hasta 24h.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">
              Tu tarjeta será cobrada automáticamente cada mes. No necesitas hacer nada.
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelSubscription}
            className="h-7 text-[11px] text-muted-foreground/60 hover:text-red-500 gap-1 px-2"
          >
            <Ban className="w-3 h-3" /> Cancelar suscripción
          </Button>
        </div>
      )}

      {/* ── Botón de pago (solo si no hay suscripción activa) ── */}
      {canPay && !subActive && (
        <Button
          onClick={onMercadoPago}
          disabled={creatingPayment}
          className="w-full rounded-xl gap-2 font-bold text-white"
          style={{ backgroundColor: creatingPayment ? undefined : "#009ee3" }}
        >
          {creatingPayment
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Cargando formulario...</>
            : <><CreditCard className="w-4 h-4" /> Pagar con Mercado Pago</>
          }
        </Button>
      )}
    </motion.div>
  );
}

function HistoryRow({ invoice, expanded, onToggle }: { invoice: Invoice; expanded: boolean; onToggle: () => void }) {
  const cfg = STATUS_CFG[invoice.status];

  return (
    <motion.div layout className="rounded-xl border border-border/40 bg-card overflow-hidden">
      {/* Fila principal — div clickeable para expandir */}
      <div className="flex items-center gap-2">
        <div
          role="button"
          tabIndex={0}
          onClick={onToggle}
          onKeyDown={(e) => e.key === "Enter" && onToggle()}
          className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer min-w-0"
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
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />}
        </div>

        {/* Botón de descarga — fuera del div expandible para evitar <button> anidado */}
        {invoice.status === "paid" && (
          <button
            onClick={() => downloadReceipt(invoice)}
            title="Descargar comprobante"
            className="mr-2 p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors flex-shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

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
                  <p className="font-semibold">
                    {PAYMENT_STATUS_CFG[p.status].label} — {format(parseISO(p.submitted_at), "dd/MM/yyyy")}
                  </p>
                  {p.payment_notes && (
                    <p className="text-muted-foreground/70 mt-0.5">{p.payment_notes}</p>
                  )}
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
