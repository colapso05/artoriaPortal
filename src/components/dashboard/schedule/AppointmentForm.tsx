import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Clock, User, MapPin, Wrench, AlertCircle, CheckCircle2,
  SlidersHorizontal, CalendarX, BanIcon, ChevronDown, HelpCircle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO, addMinutes } from "date-fns";
import { es } from "date-fns/locale";
import {
  type Technician, type Appointment,
  DEFAULT_SERVICE_TYPES, STATUS_LABELS,
} from "./types";
import { type ScheduleConfig } from "./ScheduleConfigManager";
import TechAvatar from "./TechAvatar";

export interface AppointmentPrefill {
  name?: string;
  rut?: string;
  address?: string;
  phone?: string;
  conversationId?: string;
}

interface Props {
  companyId: string;
  userId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  technicians: Technician[];
  appointment?: Appointment;
  prefill?: AppointmentPrefill;
  defaultDate?: string;
  defaultTime?: string;
  defaultTechnicianId?: string;
  scheduleConfig?: ScheduleConfig | null;
}

// ── Availability types ─────────────────────────────────────────────────────────
type TechState = 'idle' | 'checking' | 'free' | 'busy' | 'dayoff' | 'exception' | 'outside';

interface TechStatus {
  state: TechState;
  detail?: string; // busy → "10:00 – 11:30" | outside → "08:00 – 17:00" | exception → reason
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hora${h > 1 ? 's' : ''}` : `${h}h ${m}min`;
}

function endTime(startDatetime: string, mins: number): string {
  try { return format(addMinutes(parseISO(startDatetime), mins), 'HH:mm'); }
  catch { return ''; }
}

const STATUS_CONFIG: Record<TechState, { label: string; color: string; icon: React.ReactNode }> = {
  idle:      { label: 'Sin datos',       color: 'text-muted-foreground/40',               icon: null },
  checking:  { label: 'Verificando',     color: 'text-muted-foreground/60',               icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  free:      { label: 'Disponible',      color: 'text-emerald-600 dark:text-emerald-400', icon: <CheckCircle2 className="w-3 h-3" /> },
  busy:      { label: 'Ocupado',         color: 'text-red-500',                           icon: <BanIcon className="w-3 h-3" /> },
  dayoff:    { label: 'Día libre',       color: 'text-amber-500',                         icon: <CalendarX className="w-3 h-3" /> },
  exception: { label: 'No disponible',   color: 'text-amber-500',                         icon: <AlertCircle className="w-3 h-3" /> },
  outside:   { label: 'Fuera de jornada', color: 'text-orange-500',                       icon: <Clock className="w-3 h-3" /> },
};

const DOT_COLOR: Record<TechState, string> = {
  idle:      'bg-muted-foreground/20',
  checking:  'bg-muted-foreground/40',
  free:      'bg-emerald-500',
  busy:      'bg-red-500',
  dayoff:    'bg-amber-400',
  exception: 'bg-amber-400',
  outside:   'bg-orange-400',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function AppointmentForm({
  companyId, userId, open, onClose, onSaved, technicians,
  appointment, prefill, defaultDate, defaultTime, defaultTechnicianId,
  scheduleConfig,
}: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [clientName,    setClientName]    = useState('');
  const [clientRut,     setClientRut]     = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientPhone,   setClientPhone]   = useState('');
  const [serviceType,   setServiceType]   = useState(DEFAULT_SERVICE_TYPES[0]);
  const [techId,        setTechId]        = useState('');
  const [date,          setDate]          = useState('');
  const [time,          setTime]          = useState('08:00');
  const [duration,      setDuration]      = useState(60);
  const [notes,         setNotes]         = useState('');
  const [status,        setStatus]        = useState('pendiente');

  const [customDuration,    setCustomDuration]    = useState(false);
  const [customMins,        setCustomMins]        = useState('');
  const [customServiceType, setCustomServiceType] = useState(false);
  const [forceEnEspera,     setForceEnEspera]     = useState(false);

  // ── Availability state ──
  const [avail,        setAvail]        = useState<Record<string, TechStatus>>({});
  const [checkingAll,  setCheckingAll]  = useState(false);

  const activeTechs  = technicians.filter(t => t.is_active);
  const serviceTypes = scheduleConfig?.serviceTypes    ?? DEFAULT_SERVICE_TYPES;
  const durationOpts = scheduleConfig?.durationOptions ?? [30, 60, 90, 120, 180, 240, 300, 360];

  const selectedStatus: TechState = (techId && avail[techId]?.state) || 'idle';
  const isBlocked = ['busy', 'dayoff', 'exception', 'outside'].includes(selectedStatus);

  // ── Populate form on open ──
  useEffect(() => {
    if (!open) return;
    setAvail({});
    if (appointment) {
      const dt = parseISO(appointment.start_datetime);
      setClientName(appointment.client_name);
      setClientRut(appointment.client_rut || '');
      setClientAddress(appointment.client_address || '');
      setClientPhone(appointment.client_phone || '');
      setServiceType(appointment.service_type);
      setTechId(appointment.technician_id);
      setDate(format(dt, 'yyyy-MM-dd'));
      setTime(format(dt, 'HH:mm'));
      setDuration(appointment.duration_minutes);
      setNotes(appointment.notes || '');
      setStatus(appointment.status);
    } else {
      setClientName(prefill?.name || '');
      setClientRut(prefill?.rut || '');
      setClientAddress(prefill?.address || '');
      setClientPhone(prefill?.phone || '');
      setServiceType(serviceTypes[0] || DEFAULT_SERVICE_TYPES[0]);
      setTechId(defaultTechnicianId || activeTechs[0]?.id || '');
      setDate(defaultDate || format(new Date(), 'yyyy-MM-dd'));
      setTime(defaultTime || '08:00');
      setDuration(60);
      setNotes('');
      setStatus('pendiente');
    }
    setCustomDuration(false);
    setCustomMins('');
    setCustomServiceType(false);
    setForceEnEspera(false);
  }, [open]);

  // ── Recheck whenever scheduling params change ──
  useEffect(() => {
    if (date && time && activeTechs.length > 0) {
      checkAllAvailability();
    } else {
      setAvail({});
    }
  }, [date, time, duration, activeTechs.length]);

  // ── Batch availability check ───────────────────────────────────────────────
  async function checkAllAvailability() {
    if (!date || !time || activeTechs.length === 0) return;

    // Mark all as checking
    const init: Record<string, TechStatus> = {};
    for (const t of activeTechs) init[t.id] = { state: 'checking' };
    setAvail(init);
    setCheckingAll(true);

    const startDt  = new Date(`${date}T${time}`);
    const endDt    = addMinutes(startDt, duration);
    const dow      = startDt.getDay();
    const techIds  = activeTechs.map(t => t.id);

    // 3 parallel batch queries
    const [{ data: schedules }, { data: exceptions }, { data: existing }] = await Promise.all([
      (supabase as any)
        .from('technician_schedules')
        .select('technician_id, is_day_off, start_time, end_time')
        .in('technician_id', techIds)
        .eq('day_of_week', dow),
      (supabase as any)
        .from('technician_exceptions')
        .select('technician_id, is_available, reason')
        .in('technician_id', techIds)
        .eq('exception_date', date),
      (supabase as any)
        .from('appointments')
        .select('id, technician_id, start_datetime, duration_minutes')
        .in('technician_id', techIds)
        .gte('start_datetime', new Date(`${date}T00:00:00`).toISOString())
        .lte('start_datetime', new Date(`${date}T23:59:59.999`).toISOString())
        .neq('status', 'cancelado'),
    ]);

    const result: Record<string, TechStatus> = {};

    for (const tech of activeTechs) {
      const sched = schedules?.find((s: any) => s.technician_id === tech.id);
      const exc   = exceptions?.find((e: any) => e.technician_id === tech.id);

      // Sin horario configurado para este día = no trabaja
      if (!sched || sched.is_day_off) {
        result[tech.id] = { state: 'dayoff' };
        continue;
      }
      // Check work hours — normalize to HH:mm to avoid "10:00" < "10:00:00" bug
      if (sched && sched.start_time && sched.end_time) {
        const schedStart  = sched.start_time.slice(0, 5);
        const schedEnd    = sched.end_time.slice(0, 5);
        const apptEndHHmm = format(endDt, 'HH:mm');
        if (time < schedStart || apptEndHHmm > schedEnd) {
          result[tech.id] = {
            state: 'outside',
            detail: `${schedStart} – ${schedEnd}`,
          };
          continue;
        }
      }
      if (exc && !exc.is_available) {
        result[tech.id] = { state: 'exception', detail: exc.reason || undefined };
        continue;
      }

      const techAppts = (existing || []).filter(
        (a: any) => a.technician_id === tech.id
      );
      let conflictDetail: string | undefined;
      for (const a of techAppts) {
        if (appointment && a.id === appointment.id) continue;
        const s = new Date(a.start_datetime);
        const e = addMinutes(s, a.duration_minutes);
        if (startDt < e && endDt > s) {
          conflictDetail = `${format(s, 'HH:mm')} – ${format(e, 'HH:mm')}`;
          break;
        }
      }

      result[tech.id] = conflictDetail
        ? { state: 'busy', detail: conflictDetail }
        : { state: 'free' };
    }

    setAvail(result);
    setCheckingAll(false);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!clientName.trim())    { toast({ title: 'El nombre del cliente es obligatorio', variant: 'destructive' }); return; }
    if (!clientAddress.trim()) { toast({ title: 'La dirección es obligatoria', variant: 'destructive' }); return; }
    if (!techId && !forceEnEspera) { toast({ title: 'Selecciona un técnico', variant: 'destructive' }); return; }
    if (!date)                 { toast({ title: 'Selecciona una fecha', variant: 'destructive' }); return; }
    if (isPast) {
      toast({ title: 'No puedes agendar en el pasado', description: 'Elige una fecha y hora futura.', variant: 'destructive' });
      return;
    }
    if (isBlocked && !forceEnEspera) {
      toast({ title: 'El técnico no está disponible en ese horario', variant: 'destructive' });
      return;
    }

    setSaving(true);
    // Convertir a ISO UTC para evitar desfase de zona horaria en DB timestamptz
    const effectiveStatus   = forceEnEspera ? 'en_espera' : status;
    const startDatetimeISO  = new Date(`${date}T${time}:00`).toISOString();

    const payload = {
      company_id:       companyId,
      technician_id:    effectiveStatus === 'en_espera' ? null : techId,
      conversation_id:  prefill?.conversationId || appointment?.conversation_id || null,
      client_name:      clientName.trim(),
      client_rut:       clientRut.trim()     || null,
      client_address:   clientAddress.trim(),
      client_phone:     clientPhone.trim()   || null,
      service_type:     serviceType,
      notes:            notes.trim()         || null,
      start_datetime:   startDatetimeISO,
      duration_minutes: duration,
      status:           effectiveStatus,
      created_by:       userId,
    };

    if (appointment) {
      const { error } = await (supabase as any).from('appointments').update(payload).eq('id', appointment.id);
      if (error) { toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' }); }
      else       { toast({ title: 'Cita actualizada ✓' }); onSaved(); onClose(); }
    } else {
      const { error } = await (supabase as any).from('appointments').insert(payload);
      if (error) { toast({ title: 'Error al crear cita', description: error.message, variant: 'destructive' }); }
      else {
        toast({ title: forceEnEspera ? '⏳ Cita en espera creada' : '¡Cita agendada! 📅' });
        onSaved();
        onClose();
      }
    }
    setSaving(false);
  }

  const preview       = date && time ? endTime(`${date}T${time}:00`, duration) : null;
  const hasDatetime   = !!(date && time);
  const freeCount     = Object.values(avail).filter(s => s.state === 'free').length;
  const busyCount     = Object.values(avail).filter(s => ['busy','dayoff','exception'].includes(s.state)).length;
  const allBusy       = activeTechs.length > 0 && freeCount === 0 && !checkingAll && hasDatetime;
  const isPast        = !appointment && date && time
    ? new Date(`${date}T${time}:00`) < new Date()
    : false;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border shadow-2xl rounded-2xl p-0 overflow-hidden" aria-describedby={undefined}>
      <TooltipProvider delayDuration={200}>
        <DialogHeader className="px-6 py-4 border-b border-border bg-gradient-to-r from-primary/8 to-transparent">
          <DialogTitle className="text-sm font-bold flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            {appointment ? 'Editar Cita' : 'Nueva Cita'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[72vh]">
          <div className="p-5 space-y-5">

            {/* ── Cliente ── */}
            <div className="space-y-3 p-4 rounded-xl bg-muted/30 border border-border/60">
              <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                <User className="w-3 h-3" /> Datos del Cliente
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="col-span-2 space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Nombre *</Label>
                  <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nombre completo" className="h-9 text-sm rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">RUT</Label>
                  <Input value={clientRut} onChange={e => setClientRut(e.target.value)} placeholder="12.345.678-9" className="h-9 text-sm rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Teléfono</Label>
                  <Input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+56 9..." className="h-9 text-sm rounded-xl" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Dirección *
                  </Label>
                  <Input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Dirección del servicio" className="h-9 text-sm rounded-xl" />
                </div>
              </div>
            </div>

            {/* ── Servicio ── */}
            <div className="space-y-3 p-4 rounded-xl bg-muted/30 border border-border/60">
              <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                <Wrench className="w-3 h-3" /> Servicio
              </h3>
              <div className="grid grid-cols-2 gap-2.5">

                {/* Tipo servicio */}
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Tipo de servicio</Label>
                  {!customServiceType ? (
                    <Select
                      value={serviceType}
                      onValueChange={v => {
                        if (v === '__custom__') {
                          setCustomServiceType(true);
                          setServiceType('');
                        } else {
                          setServiceType(v);
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm rounded-xl">
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {serviceTypes.map(s => (
                          <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value="__custom__" className="text-sm text-primary">
                          ✏️ Escribir otro...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex gap-1.5">
                      <Input
                        value={serviceType}
                        onChange={e => setServiceType(e.target.value)}
                        placeholder="Describe el servicio..."
                        autoFocus
                        className="flex-1 h-9 text-sm rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCustomServiceType(false);
                          setServiceType(serviceTypes[0] || DEFAULT_SERVICE_TYPES[0]);
                        }}
                        className="w-9 h-9 rounded-xl border border-input bg-background flex items-center justify-center hover:bg-muted/50 transition-colors flex-shrink-0"
                        title="Volver a lista"
                      >
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Técnico con dot de estado */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[11px] text-muted-foreground">Técnico</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs font-medium">
                        El sistema verifica en tiempo real la disponibilidad de los técnicos considerando sus jornadas laborales, permisos y citas programadas.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {forceEnEspera || status === 'en_espera' ? (
                    <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-input bg-muted/50 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4 text-violet-500" /> A espera de asignar técnico
                    </div>
                  ) : (
                    <Select value={techId} onValueChange={v => { setTechId(v); }}>
                      <SelectTrigger className={`h-9 text-sm rounded-xl ${
                        isBlocked ? 'border-red-500/50 bg-red-500/5' : ''
                      }`}>
                        <SelectValue placeholder="Seleccionar...">
                          {techId && (() => {
                            const t = activeTechs.find(t => t.id === techId);
                            const s = avail[techId];
                            return t ? (
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLOR[s?.state || 'idle']}`} />
                                <span className="truncate">{t.name}</span>
                              </div>
                            ) : null;
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {activeTechs.length === 0 && (
                          <div className="px-3 py-2 text-[11px] text-muted-foreground">Sin técnicos activos</div>
                        )}
                        {activeTechs.map(t => {
                          const s = avail[t.id];
                          const cfg = STATUS_CONFIG[s?.state || 'idle'];
                          return (
                            <SelectItem key={t.id} value={t.id} className="text-sm">
                              <div className="flex items-center gap-2.5 w-full">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLOR[s?.state || 'idle']}`} />
                                <span className="flex-1">{t.name}</span>
                                {s && s.state !== 'idle' && (
                                  <span className={`text-[10px] font-semibold ml-auto ${cfg.color}`}>
                                    {s.state === 'busy' && s.detail ? s.detail : cfg.label}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Fecha */}
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Fecha</Label>
                  <input
                    type="date"
                    value={date}
                    min={!appointment ? format(new Date(), 'yyyy-MM-dd') : undefined}
                    onChange={e => setDate(e.target.value)}
                    className="w-full h-9 text-sm rounded-xl border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>

                {/* Hora */}
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Hora inicio</Label>
                  <input
                    type="time"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="w-full h-9 text-sm rounded-xl border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>

                {/* Duración */}
                <div className="col-span-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-muted-foreground">Duración estimada</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomDuration(!customDuration);
                        if (!customDuration) setCustomMins(String(duration));
                      }}
                      className="flex items-center gap-1 text-[10px] font-semibold text-primary/70 hover:text-primary transition-colors"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      {customDuration ? 'Usar presets' : 'Manual'}
                    </button>
                  </div>
                  {!customDuration ? (
                    <Select value={String(duration)} onValueChange={v => setDuration(Number(v))}>
                      <SelectTrigger className="h-9 text-sm rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {durationOpts.map(d => (
                          <SelectItem key={d} value={String(d)} className="text-sm">{fmtDuration(d)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <input
                          type="number" min={5} max={720} step={5}
                          value={customMins}
                          onChange={e => {
                            setCustomMins(e.target.value);
                            const v = parseInt(e.target.value);
                            if (v >= 5 && v <= 720) setDuration(v);
                          }}
                          placeholder="Minutos..."
                          className="w-full h-9 text-sm rounded-xl border border-input bg-background px-3 pr-12 focus:outline-none focus:ring-2 focus:ring-ring/30"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/50 font-medium pointer-events-none">min</span>
                      </div>
                      {parseInt(customMins) >= 5 && (
                        <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap">
                          = {fmtDuration(parseInt(customMins))}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Time preview */}
              {preview && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/25">
                  <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span className="text-[11px] text-primary font-medium">
                    {time} — {preview}
                    &nbsp;·&nbsp;{fmtDuration(duration)}
                  </span>
                </div>
              )}

              {/* ── Availability panel ── */}
              {hasDatetime && activeTechs.length > 0 && (
                <div className="rounded-xl border border-border/60 overflow-hidden bg-background">
                  {/* Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30">
                    <span className="text-[10px] font-bold text-foreground/70 uppercase tracking-widest">
                      Disponibilidad
                    </span>
                    {checkingAll ? (
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/50" />
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50">
                        {freeCount > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{freeCount} libre{freeCount > 1 ? 's' : ''}</span>}
                        {freeCount > 0 && busyCount > 0 && <span className="mx-1">·</span>}
                        {busyCount > 0 && <span className="text-red-500 font-semibold">{busyCount} ocupado{busyCount > 1 ? 's' : ''}</span>}
                      </span>
                    )}
                  </div>

                  {/* Tech rows */}
                  {activeTechs.map((t, i) => {
                    const s   = avail[t.id] || { state: 'idle' as TechState };
                    const cfg = STATUS_CONFIG[s.state];
                    const isSelected = t.id === techId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => s.state !== 'busy' && s.state !== 'dayoff' && s.state !== 'exception'
                          ? setTechId(t.id)
                          : setTechId(t.id) /* allow but blocked on save */
                        }
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors
                          border-b border-border/40 last:border-0
                          ${isSelected
                            ? 'bg-primary/8 dark:bg-primary/10'
                            : 'hover:bg-muted/40'}
                        `}
                      >
                        {/* Selected ring */}
                        <div className="relative flex-shrink-0">
                          <TechAvatar tech={t} size="xs" />
                          {isSelected && (
                            <div className="absolute -inset-0.5 rounded-full border-2 border-primary pointer-events-none" />
                          )}
                        </div>

                        <span className={`flex-1 text-[11px] font-semibold truncate ${
                          ['busy','dayoff','exception'].includes(s.state) ? 'text-foreground/50' : 'text-foreground'
                        }`}>
                          {t.name}
                        </span>

                        {/* Status */}
                        <div className={`flex items-center gap-1 ${cfg.color}`}>
                          {cfg.icon}
                          <span className="text-[10px] font-semibold whitespace-nowrap">
                            {s.state === 'busy' && s.detail
                              ? `Ocupado ${s.detail}`
                              : s.state === 'exception' && s.detail
                              ? s.detail
                              : cfg.label}
                          </span>
                        </div>

                        {/* "Seleccionar" hint on free, not selected */}
                        {s.state === 'free' && !isSelected && (
                          <span className="text-[9px] text-primary/40 font-medium">Seleccionar</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Past-time warning */}
              {isPast && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
                    Esta hora ya pasó — elige un horario futuro
                  </span>
                </div>
              )}

              {/* Blocked warning for selected tech */}
              {isBlocked && techId && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[11px] text-red-600 dark:text-red-400 leading-snug">
                    {avail[techId]?.state === 'busy'
                      ? `Conflicto: el técnico ya tiene cita de ${avail[techId]?.detail}`
                      : avail[techId]?.state === 'dayoff'
                      ? 'El técnico no trabaja este día'
                      : avail[techId]?.state === 'outside'
                      ? `Fuera de jornada laboral (trabaja ${avail[techId]?.detail})`
                      : `Técnico no disponible${avail[techId]?.detail ? ': ' + avail[techId]?.detail : ''}`}
                  </span>
                </div>
              )}
            </div>

            {/* Estado (solo edición) */}
            {appointment && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Estado</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 text-sm rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-sm">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Notas */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Notas para el técnico</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Detalles, acceso, referencias..."
                className="text-sm rounded-xl resize-none min-h-[56px]"
              />
            </div>

          </div>
        </ScrollArea>

        {/* Banner en espera */}
        {allBusy && !appointment && (
          <div className="px-5 pb-3">
            {!forceEnEspera ? (
              <button
                type="button"
                onClick={() => setForceEnEspera(true)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-violet-500/40 bg-violet-500/8 text-left hover:bg-violet-500/14 transition-colors"
              >
                <Clock className="w-4 h-4 text-violet-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-violet-500">Todos los técnicos están ocupados</p>
                  <p className="text-[10px] text-muted-foreground/70">Clic para agregar a lista de espera</p>
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-violet-500/40 bg-violet-500/10">
                <Clock className="w-4 h-4 text-violet-500 flex-shrink-0" />
                <p className="text-[11px] text-violet-600 dark:text-violet-400 flex-1">
                  Se guardará como <strong>En espera</strong> — recibirás aviso cuando el técnico esté disponible
                </p>
                <button
                  type="button"
                  onClick={() => setForceEnEspera(false)}
                  className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="px-5 py-4 border-t border-border gap-2 bg-muted/20">
          <Button variant="ghost" onClick={onClose} disabled={saving} className="rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || (isBlocked && !forceEnEspera) || checkingAll || (!!isPast && !appointment)}
            className={`rounded-xl gap-2 min-w-[130px] ${forceEnEspera ? 'bg-violet-600 hover:bg-violet-700' : ''}`}
          >
            {(saving || checkingAll) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {appointment ? 'Guardar cambios' : forceEnEspera ? 'Agregar en espera' : 'Confirmar cita'}
          </Button>
        </DialogFooter>
      </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
