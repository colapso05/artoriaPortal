import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, RefreshCw, Receipt, CheckCircle2, X, Clock, AlertTriangle,
  Settings2, Building2, Webhook, ChevronDown, ChevronUp, BadgeDollarSign,
  Copy, Check,
} from "lucide-react";
import { format, parseISO } from "date-fns";
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
  company_id: string;
  company_name: string;
  period: string;
  amount: number;
  status: "pending" | "under_review" | "paid" | "overdue" | "cancelled";
  issued_at: string;
  due_date: string;
  paid_at: string | null;
  admin_notes: string | null;
  invoice_payments: InvoicePayment[];
}

interface CompanyConfig {
  id: string;
  company_name: string;
}

interface BillingConfig {
  billing_day: number;
  amount: number;
  currency: string;
  grace_period_days: number;
  bank_details: string;
  billing_enabled: boolean;
}

type Tab = "validaciones" | "boletas" | "configurar";
type StatusFilter = "all" | "pending" | "under_review" | "paid" | "overdue";

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending:      { label: "Pendiente",    color: "text-amber-500 bg-amber-500/10 border-amber-500/20",   Icon: Clock },
  under_review: { label: "En revisión",  color: "text-blue-500 bg-blue-500/10 border-blue-500/20",     Icon: Clock },
  paid:         { label: "Pagado",       color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", Icon: CheckCircle2 },
  overdue:      { label: "Vencido",      color: "text-red-500 bg-red-500/10 border-red-500/20",        Icon: AlertTriangle },
  cancelled:    { label: "Cancelado",    color: "text-muted-foreground bg-secondary/50 border-border/30", Icon: X },
} as const;

function formatPeriod(period: string): string {
  const [y, m] = period.split("-");
  const s = format(new Date(parseInt(y), parseInt(m) - 1, 1), "MMMM yyyy", { locale: es });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatCLP(n: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(n);
}

const EMPTY_CONFIG: BillingConfig = {
  billing_day: 5,
  amount: 0,
  currency: "CLP",
  grace_period_days: 5,
  bank_details: "",
  billing_enabled: false,
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminBillingPanel() {
  const { toast } = useToast();
  const [tab, setTab]           = useState<Tab>("validaciones");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);

  // Validate modal
  const [validateModal, setValidateModal]     = useState<{ invoice: Invoice; payment: InvoicePayment } | null>(null);
  const [adminNotes, setAdminNotes]           = useState("");
  const [validating, setValidating]           = useState(false);

  // Boletas tab
  const [statusFilter, setStatusFilter]       = useState<StatusFilter>("all");
  const [companyFilter, setCompanyFilter]     = useState<string>("all");
  const [expandedInv, setExpandedInv]         = useState<string | null>(null);

  // Config tab
  const [companies, setCompanies]             = useState<CompanyConfig[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [billingCfg, setBillingCfg]           = useState<BillingConfig>(EMPTY_CONFIG);
  const [copiedWebhook, setCopiedWebhook]     = useState(false);
  const [loadingCfg, setLoadingCfg]           = useState(false);
  const [savingCfg, setSavingCfg]             = useState(false);

  const BILLING_WEBHOOK_URL = "https://bot.artoria.cl/webhook/billing-events";

  useEffect(() => { loadInvoices(); loadCompanies(); }, []);

  useEffect(() => {
    if (selectedCompanyId) loadBillingConfig(selectedCompanyId);
  }, [selectedCompanyId]);

  async function loadInvoices() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("billing-get-invoices");
    if (error) toast({ title: "Error al cargar boletas", description: error.message, variant: "destructive" });
    else setInvoices(data?.invoices || []);
    setLoading(false);
  }

  async function loadCompanies() {
    const { data } = await (supabase as any)
      .from("company_config")
      .select("id, company_name")
      .order("company_name");
    setCompanies(data || []);
  }

  function copyWebhookUrl() {
    navigator.clipboard.writeText(BILLING_WEBHOOK_URL);
    setCopiedWebhook(true);
    toast({ title: "URL copiada ✓" });
    setTimeout(() => setCopiedWebhook(false), 2000);
  }

  async function loadBillingConfig(companyId: string) {
    setLoadingCfg(true);
    const { data } = await (supabase as any)
      .from("billing_config")
      .select("billing_day, amount, currency, grace_period_days, bank_details, billing_enabled")
      .eq("company_id", companyId)
      .maybeSingle();
    setBillingCfg(data ? {
      billing_day:      data.billing_day       ?? 5,
      amount:           data.amount            ?? 0,
      currency:         data.currency          ?? "CLP",
      grace_period_days: data.grace_period_days ?? 5,
      bank_details:     data.bank_details      ?? "",
      billing_enabled:  data.billing_enabled   ?? false,
    } : EMPTY_CONFIG);
    setLoadingCfg(false);
  }

  async function saveConfig() {
    if (!selectedCompanyId) {
      toast({ title: "Selecciona una empresa", variant: "destructive" });
      return;
    }
    if (billingCfg.amount <= 0) {
      toast({ title: "El monto debe ser mayor a 0", variant: "destructive" });
      return;
    }
    setSavingCfg(true);
    const { error } = await supabase.functions.invoke("billing-save-config", {
      body: {
        company_id:        selectedCompanyId,
        billing_day:       billingCfg.billing_day,
        amount:            billingCfg.amount,
        currency:          billingCfg.currency,
        grace_period_days: billingCfg.grace_period_days,
        billing_enabled:   billingCfg.billing_enabled,
      },
    });
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuración guardada ✓" });
    }
    setSavingCfg(false);
  }

  async function handleValidate(action: "approve" | "reject") {
    if (!validateModal) return;
    setValidating(true);
    const { error } = await supabase.functions.invoke("billing-validate-payment", {
      body: {
        invoice_id: validateModal.invoice.id,
        payment_id: validateModal.payment.id,
        action,
        admin_notes: adminNotes.trim() || null,
      },
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: action === "approve" ? "Pago aprobado ✓" : "Pago rechazado" });
      setValidateModal(null);
      setAdminNotes("");
      loadInvoices();
    }
    setValidating(false);
  }

  // Enriquece facturas con company_name desde companies cuando la API no lo trae
  const enrichedInvoices = useMemo(() => invoices.map(inv => ({
    ...inv,
    company_name: inv.company_name
      || companies.find(c => c.id === inv.company_id)?.company_name
      || "—",
  })), [invoices, companies]);

  const pendingValidations = enrichedInvoices.filter(i =>
    i.status === "under_review" && i.invoice_payments?.some(p => p.status === "pending")
  );

  const filteredInvoices = enrichedInvoices.filter(i => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (companyFilter !== "all" && i.company_id !== companyFilter) return false;
    return true;
  });

  // Usa companies directamente para el selector (no depende de que la API traiga company_name)
  const companiesWithInvoices = useMemo(() =>
    companies.filter(c => enrichedInvoices.some(i => i.company_id === c.id)),
    [companies, enrichedInvoices]
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/20 bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <BadgeDollarSign className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold">Facturación</h1>
            <p className="text-[11px] text-muted-foreground/60">Gestión de boletas y configuración</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-xl" onClick={loadInvoices} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 pb-0 flex-shrink-0 border-b border-border/10">
        {(["validaciones", "boletas", "configurar"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative pb-3 px-1 text-[12px] font-semibold capitalize transition-colors ${
              tab === t ? "text-primary" : "text-muted-foreground/60 hover:text-foreground"
            }`}
          >
            {t === "validaciones" ? "Validaciones" : t === "boletas" ? "Boletas" : "Configurar"}
            {t === "validaciones" && pendingValidations.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                {pendingValidations.length}
              </span>
            )}
            {tab === t && (
              <motion.div layoutId="billing-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6">

          {/* ── Tab: Validaciones ── */}
          {tab === "validaciones" && (
            loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
              </div>
            ) : pendingValidations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500/30" />
                <p className="text-sm font-semibold text-muted-foreground/60">Sin pagos pendientes</p>
                <p className="text-[12px] text-muted-foreground/40">Los pagos de Mercado Pago se confirman automáticamente. Aparecerán aquí solo si requieren revisión manual.</p>
              </div>
            ) : (
              <div className="space-y-3 max-w-2xl mx-auto">
                {pendingValidations.map(inv => {
                  const pending = inv.invoice_payments.filter(p => p.status === "pending");
                  return pending.map(pmt => (
                    <ValidationCard
                      key={pmt.id}
                      invoice={inv}
                      payment={pmt}
                      onValidate={() => { setValidateModal({ invoice: inv, payment: pmt }); setAdminNotes(""); }}
                    />
                  ));
                })}
              </div>
            )
          )}

          {/* ── Tab: Boletas ── */}
          {tab === "boletas" && (
            <div className="space-y-4 max-w-3xl mx-auto">
              {/* Filters */}
              <div className="flex gap-2 flex-wrap">
                <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="h-8 text-sm rounded-xl w-auto min-w-[130px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border/40">
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="under_review">En revisión</SelectItem>
                    <SelectItem value="paid">Pagado</SelectItem>
                    <SelectItem value="overdue">Vencido</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="h-8 text-sm rounded-xl w-auto min-w-[160px]">
                    <SelectValue placeholder="Empresa" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border/40">
                    <SelectItem value="all">Todas las empresas</SelectItem>
                    {companiesWithInvoices.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
                </div>
              ) : filteredInvoices.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-2 text-center">
                  <Receipt className="w-8 h-8 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground/50">Sin resultados</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredInvoices.map(inv => {
                    const cfg = STATUS_CFG[inv.status];
                    const exp = expandedInv === inv.id;
                    return (
                      <motion.div key={inv.id} layout className="rounded-xl border border-border/40 bg-card overflow-hidden">
                        <button
                          onClick={() => setExpandedInv(exp ? null : inv.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                        >
                          <Building2 className="w-4 h-4 flex-shrink-0 text-muted-foreground/40" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold leading-tight truncate">{inv.company_name}</p>
                            <p className="text-[11px] text-muted-foreground/60 mt-0.5">{formatPeriod(inv.period)}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-sm font-bold">{formatCLP(inv.amount)}</span>
                            <Badge className={`text-[10px] border ${cfg.color}`}>
                              <cfg.Icon className="w-3 h-3 mr-1" />{cfg.label}
                            </Badge>
                            {exp ? <ChevronUp className="w-4 h-4 text-muted-foreground/30" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/30" />}
                          </div>
                        </button>
                        <AnimatePresence initial={false}>
                          {exp && (
                            <motion.div
                              initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                              transition={{ duration: 0.15 }} className="overflow-hidden"
                            >
                              <div className="px-4 pb-4 pt-1 border-t border-border/20 space-y-2 text-[12px]">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground/70">
                                  <span>Emitida: {format(parseISO(inv.issued_at), "dd/MM/yyyy")}</span>
                                  <span>Vence: {format(parseISO(inv.due_date), "dd/MM/yyyy")}</span>
                                  {inv.paid_at && <span className="text-emerald-600">Pagada: {format(parseISO(inv.paid_at), "dd/MM/yyyy")}</span>}
                                </div>
                                {inv.admin_notes && (
                                  <p className="text-muted-foreground/70"><span className="font-semibold">Nota: </span>{inv.admin_notes}</p>
                                )}
                                {inv.invoice_payments?.map(p => (
                                  <div key={p.id} className={`p-2 rounded-lg border text-[11px] ${
                                    p.status === "pending" ? "text-blue-500 bg-blue-500/10 border-blue-500/20" :
                                    p.status === "validated" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" :
                                    "text-red-500 bg-red-500/10 border-red-500/20"
                                  }`}>
                                    <p className="font-semibold">{p.status === "pending" ? "Pago declarado" : p.status === "validated" ? "Pago validado" : "Pago rechazado"} — {format(parseISO(p.submitted_at), "dd/MM/yyyy HH:mm")}</p>
                                    {p.payment_notes && <p className="mt-0.5 text-muted-foreground/70">{p.payment_notes}</p>}
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Configurar ── */}
          {tab === "configurar" && (
            <div className="max-w-lg mx-auto space-y-6">
              {/* Webhook global */}
              <section className="rounded-2xl border border-border/40 bg-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Webhook className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-[12px] font-bold uppercase tracking-widest">Webhook — n8n</h3>
                    <p className="text-[10px] text-muted-foreground/50">
                      Copia esta URL y pégala como nodo <strong>Webhook</strong> en n8n
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/40 bg-muted/30 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">URL del webhook</span>
                    <button
                      onClick={copyWebhookUrl}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      {copiedWebhook ? <><Check className="w-3.5 h-3.5" /> Copiada</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                    </button>
                  </div>
                  <p className="px-3 py-2.5 text-[12px] font-mono text-foreground/80 break-all select-all">
                    {BILLING_WEBHOOK_URL}
                  </p>
                </div>

                <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
                  Eventos: <code className="font-mono">invoice_issued · payment_reminder · service_suspended · payment_submitted · payment_validated · payment_rejected</code>
                </p>
              </section>

              {/* Config por empresa */}
              <section className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Settings2 className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-[12px] font-bold uppercase tracking-widest">Configuración por empresa</h3>
                    <p className="text-[10px] text-muted-foreground/50">Monto, día de facturación y datos de transferencia</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Empresa</Label>
                  <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                    <SelectTrigger className="h-9 text-sm rounded-xl">
                      <SelectValue placeholder="Seleccionar empresa..." />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border/40">
                      {companies.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedCompanyId && (
                  loadingCfg ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-4 h-4 animate-spin text-primary/40" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Enabled toggle */}
                      <div className="flex items-center justify-between py-2 border-t border-border/20">
                        <div>
                          <Label className="text-sm font-semibold">Facturación activa</Label>
                          <p className="text-[10px] text-muted-foreground/50">Genera boletas automáticamente</p>
                        </div>
                        <Switch
                          checked={billingCfg.billing_enabled}
                          onCheckedChange={v => setBillingCfg(p => ({ ...p, billing_enabled: v }))}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Billing day */}
                        <div className="space-y-1.5">
                          <Label className="text-[11px] text-muted-foreground">Día de facturación</Label>
                          <Input
                            type="number"
                            min={1} max={31}
                            value={billingCfg.billing_day}
                            onChange={e => setBillingCfg(p => ({ ...p, billing_day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) }))}
                            className="h-9 text-sm rounded-xl"
                          />
                          <p className="text-[10px] text-muted-foreground/40">Día del mes (1–31). Usa 28 para evitar problemas en febrero.</p>
                        </div>

                        {/* Grace period */}
                        <div className="space-y-1.5">
                          <Label className="text-[11px] text-muted-foreground">Días de gracia</Label>
                          <Input
                            type="number"
                            min={1} max={30}
                            value={billingCfg.grace_period_days}
                            onChange={e => setBillingCfg(p => ({ ...p, grace_period_days: Math.min(30, Math.max(1, parseInt(e.target.value) || 5)) }))}
                            className="h-9 text-sm rounded-xl"
                          />
                          <p className="text-[10px] text-muted-foreground/40">Días hasta el corte</p>
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Monto mensual (CLP)</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            value={billingCfg.amount || ""}
                            onChange={e => setBillingCfg(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                            placeholder="65000"
                            className="h-9 text-sm rounded-xl pr-14"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/50 font-medium">CLP</span>
                        </div>
                        {billingCfg.amount > 0 && (
                          <p className="text-[11px] text-primary font-semibold px-0.5">
                            {new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(billingCfg.amount)} / mes
                          </p>
                        )}
                      </div>

                      {/* Método de pago */}
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-[#009ee3]/10 border border-[#009ee3]/20">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#009ee3]/20 flex-shrink-0">
                          <Webhook className="w-4 h-4 text-[#009ee3]" />
                        </div>
                        <div>
                          <p className="text-[12px] font-semibold text-foreground">Mercado Pago (Checkout Pro)</p>
                          <p className="text-[11px] text-muted-foreground/60">Los pagos se confirman automáticamente vía webhook.</p>
                        </div>
                      </div>

                      {/* Summary preview */}
                      {billingCfg.billing_enabled && billingCfg.amount > 0 && (
                        <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 text-[11px] text-muted-foreground space-y-0.5">
                          <p>Boleta emitida el <strong className="text-foreground">día {billingCfg.billing_day}</strong> de cada mes</p>
                          <p>Corte de servicio <strong className="text-foreground">{billingCfg.grace_period_days} días después</strong> si no se paga</p>
                          <p>Monto: <strong className="text-foreground">{new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(billingCfg.amount)}</strong></p>
                        </div>
                      )}

                      <Button onClick={saveConfig} disabled={savingCfg} className="w-full rounded-xl gap-2">
                        {savingCfg && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Guardar configuración
                      </Button>
                    </div>
                  )
                )}
              </section>
            </div>
          )}

        </div>
      </ScrollArea>

      {/* ── Modal: validar pago ── */}
      <Dialog open={!!validateModal} onOpenChange={open => { if (!open) { setValidateModal(null); setAdminNotes(""); } }}>
        <DialogContent className="max-w-md bg-card border-border/30" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary" /> Revisar declaración de pago
            </DialogTitle>
          </DialogHeader>

          {validateModal && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/40 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground/70">Empresa</span>
                  <span className="font-semibold">{validateModal.invoice.company_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground/70">Período</span>
                  <span className="font-semibold">{formatPeriod(validateModal.invoice.period)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground/70">Monto</span>
                  <span className="font-bold text-primary">{formatCLP(validateModal.invoice.amount)}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1 text-[12px]">
                <p className="font-semibold text-blue-600 dark:text-blue-400">
                  Declarado el {format(parseISO(validateModal.payment.submitted_at), "dd/MM/yyyy 'a las' HH:mm")}
                </p>
                <p className="text-muted-foreground/80 whitespace-pre-line">{validateModal.payment.payment_notes}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Nota para la empresa (opcional)</Label>
                <Textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="Ej: Transferencia recibida, gracias."
                  rows={2}
                  className="resize-none text-sm rounded-xl"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl border-red-500/30 text-red-500 hover:bg-red-500/10 gap-1.5"
              onClick={() => handleValidate("reject")}
              disabled={validating}
            >
              {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Rechazar
            </Button>
            <Button
              className="flex-1 rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleValidate("approve")}
              disabled={validating}
            >
              {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Aprobar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── ValidationCard ─────────────────────────────────────────────────────────────

function ValidationCard({ invoice, payment, onValidate }: {
  invoice: Invoice;
  payment: InvoicePayment;
  onValidate: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/40 bg-card p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{invoice.company_name}</p>
          <p className="text-[12px] text-muted-foreground/60">{formatPeriod(invoice.period)} — {formatCLP(invoice.amount)}</p>
        </div>
        <Badge className="text-[10px] border text-blue-500 bg-blue-500/10 border-blue-500/20 flex-shrink-0">
          <Clock className="w-3 h-3 mr-1" /> En revisión
        </Badge>
      </div>

      <div className="p-3 rounded-xl bg-muted/40 border border-border/30 space-y-0.5 text-[12px]">
        <p className="text-muted-foreground/60">
          Declarado el {format(parseISO(payment.submitted_at), "dd/MM/yyyy 'a las' HH:mm")}
        </p>
        <p className="text-foreground/80 whitespace-pre-line">{payment.payment_notes}</p>
      </div>

      <Button onClick={onValidate} className="w-full rounded-xl gap-2 h-9" variant="outline">
        <Receipt className="w-3.5 h-3.5" /> Revisar y validar
      </Button>
    </motion.div>
  );
}
