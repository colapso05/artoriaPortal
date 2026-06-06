import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar, Clock, Loader2, ChevronRight, CalendarPlus, Users, History,
  Maximize2, ExternalLink,
} from "lucide-react";
import { format, parseISO, addMinutes, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  type Technician, type Appointment, type AppointmentStatus,
  STATUS_COLORS, STATUS_LABELS,
} from "./types";
import AppointmentForm, { type AppointmentPrefill } from "./AppointmentForm";
import AppointmentCalendar from "./AppointmentCalendar";
import TechAvatar from "./TechAvatar";

interface Props {
  companyId: string;
  userId: string;
  clientPhone?: string;
  clientName?: string;
  clientRut?: string;
  clientAddress?: string;
  conversationId?: string;
  onOpenFullSchedule?: () => void;
}

export default function ScheduleTab({
  companyId, userId,
  clientPhone, clientName, clientRut, clientAddress,
  conversationId, onOpenFullSchedule,
}: Props) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [clientAppts, setClientAppts] = useState<Appointment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [formOpen, setFormOpen]       = useState(false);
  const [editAppt, setEditAppt]       = useState<Appointment | undefined>();

  // Feature 3: history controls
  const [showCancelled, setShowCancelled] = useState(false);

  // Feature 1: availability view
  const [schedView, setSchedView]       = useState<'client' | 'availability'>('client');
  const [todayAppts, setTodayAppts]     = useState<Appointment[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [availLoaded, setAvailLoaded]   = useState(false);

  // Feature 2: inline status change
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Agenda overlay preview
  const [previewOpen,    setPreviewOpen]    = useState(false);
  const [previewDate,    setPreviewDate]    = useState(new Date());
  const [previewAppts,   setPreviewAppts]   = useState<Appointment[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Slot-click defaults passed to AppointmentForm when creating from preview
  const [formDefDate,    setFormDefDate]    = useState<string | undefined>();
  const [formDefTime,    setFormDefTime]    = useState<string | undefined>();
  const [formDefTech,    setFormDefTech]    = useState<string | undefined>();

  useEffect(() => { loadData(); }, [companyId, clientPhone]);

  async function loadData() {
    setLoading(true);
    const [{ data: techs }, { data: appts }] = await Promise.all([
      (supabase as any)
        .from('technicians')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name'),
      clientPhone
        ? (supabase as any)
            .from('appointments')
            .select('*, technician:technician_id(id, name, color)')
            .eq('company_id', companyId)
            .eq('client_phone', clientPhone)
            .order('start_datetime', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ]);
    setTechnicians(techs || []);
    setClientAppts(appts || []);
    setLoading(false);
  }

  async function loadAvailability() {
    if (loadingAvail) return;
    setLoadingAvail(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data } = await (supabase as any)
      .from('appointments')
      .select('*, technician:technician_id(id, name, color)')
      .eq('company_id', companyId)
      .gte('start_datetime', `${today}T00:00:00`)
      .lte('start_datetime', `${today}T23:59:59`)
      .neq('status', 'cancelado')
      .order('start_datetime');
    setTodayAppts(data || []);
    setAvailLoaded(true);
    setLoadingAvail(false);
  }

  async function updateApptStatus(apptId: string, status: AppointmentStatus) {
    setUpdatingId(apptId);
    await (supabase as any).from('appointments').update({ status }).eq('id', apptId);
    await loadData();
    // Refresh availability if that panel was loaded
    if (availLoaded) loadAvailability();
    setUpdatingId(null);
  }

  async function fetchPreviewAppts() {
    setPreviewLoading(true);
    const from = format(addDays(new Date(), -7),  'yyyy-MM-dd');
    const to   = format(addDays(new Date(),  90), 'yyyy-MM-dd');
    const { data } = await (supabase as any)
      .from('appointments')
      .select('*, technician:technician_id(id, name, color)')
      .eq('company_id', companyId)
      .gte('start_datetime', `${from}T00:00:00`)
      .lte('start_datetime', `${to}T23:59:59`)
      .order('start_datetime');
    setPreviewAppts(data || []);
    setPreviewLoading(false);
  }

  function openAgendaPreview() {
    setPreviewOpen(true);
    setPreviewDate(new Date());
    fetchPreviewAppts();
  }

  // Filtered list for display
  const displayAppts = showCancelled
    ? clientAppts
    : clientAppts.filter(a => a.status !== 'cancelado');

  const prefill: AppointmentPrefill = {
    name:           clientName,
    rut:            clientRut,
    address:        clientAddress,
    phone:          clientPhone,
    conversationId,
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
      </div>
    );
  }

  if (technicians.length === 0) {
    return (
      <div className="space-y-3">
        <SectionTitle onOpenPreview={openAgendaPreview} onOpenFull={onOpenFullSchedule} />
        <div className="text-center py-10 space-y-2.5">
          <div className="w-10 h-10 rounded-2xl bg-muted/30 mx-auto flex items-center justify-center">
            <Calendar className="w-5 h-5 text-muted-foreground/40" />
          </div>
          <p className="text-[11px] text-muted-foreground">Sin técnicos configurados</p>
          <p className="text-[10px] text-muted-foreground/60">
            Ve a la sección <strong>Agenda</strong> para crear técnicos
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SectionTitle onOpenPreview={openAgendaPreview} onOpenFull={onOpenFullSchedule} />

      {/* ── View toggle: Historial vs Disponibilidad ── */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted/30 border border-border/40">
        {([
          { v: 'client'       as const, label: 'Historial',      Icon: History },
          { v: 'availability' as const, label: 'Disponibilidad', Icon: Users   },
        ]).map(({ v, label, Icon }) => (
          <button
            key={v}
            onClick={() => {
              setSchedView(v);
              if (v === 'availability' && !availLoaded) loadAvailability();
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-150 ${
              schedView === v
                ? 'bg-card text-primary shadow-sm border border-border/40'
                : 'text-foreground/55 hover:text-foreground'
            }`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Panel content ── */}
      <AnimatePresence mode="wait">
        {schedView === 'client' ? (
          <motion.div
            key="client"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-1.5"
          >
            {displayAppts.length > 0 ? (
              <>
                <div className="flex items-center justify-between px-0.5">
                  <p className="text-[11px] text-muted-foreground font-medium">Citas de este cliente</p>
                  {clientAppts.some(a => a.status === 'cancelado') && (
                    <button
                      onClick={() => setShowCancelled(v => !v)}
                      className={`text-[10px] font-bold transition-colors ${
                        showCancelled
                          ? 'text-primary'
                          : 'text-foreground/50 hover:text-foreground'
                      }`}
                    >
                      {showCancelled ? 'Ocultar canceladas' : 'Ver canceladas'}
                    </button>
                  )}
                </div>

                {displayAppts.map((appt, i) => {
                  const tech  = (appt.technician as any) || technicians.find(t => t.id === appt.technician_id);
                  const start = parseISO(appt.start_datetime);
                  const end   = addMinutes(start, appt.duration_minutes);
                  const isUpd = updatingId === appt.id;
                  const canChangeStatus = appt.status !== 'cancelado' && appt.status !== 'completado';

                  return (
                    <motion.div
                      key={appt.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="rounded-xl border border-border/40 bg-muted/30 overflow-hidden"
                    >
                      {/* Appointment info (clickable → open form) */}
                      <button
                        onClick={() => { setEditAppt(appt); setFormOpen(true); }}
                        className="w-full flex items-start gap-2.5 p-2.5 hover:bg-secondary/20 transition-colors text-left"
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
                          style={{ background: tech?.color || '#6366f1' }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[13px] font-semibold leading-tight">{appt.service_type}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 leading-4 flex-shrink-0 ${STATUS_COLORS[appt.status]}`}
                            >
                              {STATUS_LABELS[appt.status]}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock className="w-2.5 h-2.5 text-muted-foreground/60" />
                            <span className="text-[11px] text-muted-foreground">
                              {format(start, 'EEE d MMM', { locale: es })} · {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground/80 mt-0.5">{tech?.name || '—'}</p>
                        </div>
                      </button>

                      {/* Feature 2: inline status change */}
                      {canChangeStatus && (
                        <div className="px-2.5 pb-2 flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground/70 flex-shrink-0 font-medium">Estado:</span>
                          <Select
                            value={appt.status}
                            disabled={!!isUpd}
                            onValueChange={v => updateApptStatus(appt.id, v as AppointmentStatus)}
                          >
                            <SelectTrigger className="h-7 text-[11px] rounded-lg flex-1 border-border/40 bg-background/70">
                              {isUpd
                                ? <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                                : <SelectValue />
                              }
                            </SelectTrigger>
                            <SelectContent>
                              {(['pendiente', 'en_camino', 'en_espera', 'completado', 'cancelado'] as AppointmentStatus[]).map(s => (
                                <SelectItem key={s} value={s} className="text-[12px]">
                                  {STATUS_LABELS[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground/80 px-0.5">
                Sin citas registradas para este cliente
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="availability"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <AvailabilityView
              technicians={technicians}
              todayAppts={todayAppts}
              loading={loadingAvail}
              onRefresh={loadAvailability}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick booking button */}
      <Button
        onClick={() => { setEditAppt(undefined); setFormOpen(true); }}
        className="w-full justify-center text-[12px] h-10 gap-2 rounded-xl border border-primary/40 text-primary hover:bg-primary/10 font-bold uppercase tracking-wide shadow-none"
        variant="outline"
      >
        <CalendarPlus className="w-3.5 h-3.5" /> Agendar cita
      </Button>

      {/* Form modal */}
      <AppointmentForm
        companyId={companyId}
        userId={userId}
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditAppt(undefined); setFormDefDate(undefined); setFormDefTime(undefined); setFormDefTech(undefined); }}
        onSaved={() => { loadData(); if (availLoaded) loadAvailability(); if (previewOpen) fetchPreviewAppts(); }}
        technicians={technicians}
        appointment={editAppt}
        prefill={editAppt ? undefined : prefill}
        defaultDate={formDefDate}
        defaultTime={formDefTime}
        defaultTechnicianId={formDefTech}
      />

      {/* ── Agenda preview overlay ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl w-[95vw] h-[88vh] flex flex-col p-0 gap-0 overflow-hidden" aria-describedby={undefined}>
          <DialogHeader className="px-5 py-3.5 border-b border-border/50 shrink-0 flex-row items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-sm font-bold leading-tight">Vista previa de agenda</DialogTitle>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                {technicians.length} técnico{technicians.length !== 1 ? 's' : ''}
              </p>
            </div>
            {onOpenFullSchedule && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-xl gap-1.5 text-[11px] font-semibold border-border/40 shrink-0 mr-6"
                onClick={() => { setPreviewOpen(false); onOpenFullSchedule(); }}
              >
                <ExternalLink className="w-3 h-3" /> Ir a agenda completa
              </Button>
            )}
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            {previewLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
              </div>
            ) : (
              <AppointmentCalendar
                technicians={technicians}
                appointments={previewAppts}
                selectedDate={previewDate}
                onDateChange={setPreviewDate}
                onAppointmentClick={appt => {
                  setEditAppt(appt);
                  setFormDefDate(undefined);
                  setFormDefTime(undefined);
                  setFormDefTech(undefined);
                  setFormOpen(true);
                }}
                onSlotClick={(date, time, techId) => {
                  setEditAppt(undefined);
                  setFormDefDate(date);
                  setFormDefTime(time);
                  setFormDefTech(techId);
                  setFormOpen(true);
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Feature 1: Mini availability panel ────────────────────────────────────────
function AvailabilityView({
  technicians,
  todayAppts,
  loading,
  onRefresh,
}: {
  technicians: Technician[];
  todayAppts: Appointment[];
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-primary/40" />
      </div>
    );
  }

  const todayLabel = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[10px] text-muted-foreground/60 capitalize">{todayLabel}</p>
        <button
          onClick={onRefresh}
          className="text-[9px] text-primary/60 hover:text-primary font-bold transition-colors"
        >
          Actualizar
        </button>
      </div>

      {technicians.map(tech => {
        const techAppts = todayAppts
          .filter(a => a.technician_id === tech.id)
          .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));

        return (
          <div
            key={tech.id}
            className="rounded-xl border overflow-hidden bg-secondary/5"
            style={{ borderColor: `${tech.color}25` }}
          >
            {/* Tech header */}
            <div
              className="flex items-center gap-2 px-2.5 py-2"
              style={{ background: `linear-gradient(to right, ${tech.color}12, transparent)` }}
            >
              <TechAvatar tech={tech} size="xs" />
              <span className="text-[11px] font-bold flex-1 truncate">{tech.name}</span>
              {techAppts.length > 0 ? (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: `${tech.color}20`, color: tech.color }}
                >
                  {techAppts.length} cita{techAppts.length > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-[9px] text-emerald-500 font-bold flex-shrink-0">
                  Disponible
                </span>
              )}
            </div>

            {/* Compact appointment list */}
            {techAppts.length > 0 && (
              <div className="px-2.5 pb-2 pt-1 space-y-1">
                {techAppts.map(appt => {
                  const start = parseISO(appt.start_datetime);
                  const end   = addMinutes(start, appt.duration_minutes);
                  return (
                    <div key={appt.id} className="flex items-center gap-2">
                      <span
                        className="text-[9px] font-extrabold tabular-nums flex-shrink-0 w-10"
                        style={{ color: tech.color }}
                      >
                        {format(start, 'HH:mm')}
                      </span>
                      <span className="text-[9px] text-foreground/70 flex-1 truncate">
                        {appt.service_type}
                        {appt.client_name && (
                          <span className="text-muted-foreground/50"> · {appt.client_name}</span>
                        )}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[8px] px-1 py-0 leading-[14px] flex-shrink-0 ${STATUS_COLORS[appt.status]}`}
                      >
                        {STATUS_LABELS[appt.status]}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {technicians.length === 0 && (
        <p className="text-[11px] text-muted-foreground/50 text-center py-4">
          Sin técnicos activos
        </p>
      )}
    </div>
  );
}

// ── Section title ──────────────────────────────────────────────────────────────
function SectionTitle({ onOpenPreview, onOpenFull }: { onOpenPreview?: () => void; onOpenFull?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h4 className="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-2 px-0.5">
        <div className="w-1 h-1 rounded-full bg-primary" /> Agenda
      </h4>
      {onOpenPreview && (
        <button
          onClick={onOpenPreview}
          className="text-[11px] text-foreground/60 hover:text-primary flex items-center gap-1 transition-colors font-semibold"
          title="Ver agenda completa"
        >
          <Maximize2 className="w-3 h-3" /> Ver agenda
        </button>
      )}
    </div>
  );
}
