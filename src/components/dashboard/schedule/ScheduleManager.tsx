import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, Settings2, Calendar, Clock, MapPin,
  User, Wrench, Loader2, Pencil, Trash2,
  CheckCircle2, Truck, XCircle, Circle, X,
} from "lucide-react";
import { format, parseISO, addMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { type Technician, type Appointment, STATUS_COLORS, STATUS_LABELS } from "./types";
import AppointmentCalendar  from "./AppointmentCalendar";
import AppointmentForm       from "./AppointmentForm";
import TechnicianManager     from "./TechnicianManager";
import TechAvatar            from "./TechAvatar";
import ScheduleConfigManager, { type ScheduleConfig } from "./ScheduleConfigManager";

interface Props {
  companyId: string;
  userId: string;
  isAdmin?: boolean;
}

const STATUS_ICONS: Record<string, React.ElementType> = {
  pendiente:  Circle,
  en_camino:  Truck,
  completado: CheckCircle2,
  cancelado:  XCircle,
};

export default function ScheduleManager({ companyId, userId, isAdmin = false }: Props) {
  const { toast } = useToast();
  const [technicians,  setTechnicians]  = useState<Technician[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null);

  // Modals / panels
  const [techOpen,   setTechOpen]   = useState(false);
  const [cfgOpen,    setCfgOpen]    = useState(false);
  const [formOpen,   setFormOpen]   = useState(false);
  const [editAppt, setEditAppt]  = useState<Appointment | undefined>();
  const [defDate,  setDefDate]   = useState<string | undefined>();
  const [defTime,  setDefTime]   = useState<string | undefined>();
  const [defTech,  setDefTech]   = useState<string | undefined>();
  const [detail,   setDetail]    = useState<Appointment | null>(null);

  useEffect(() => { loadData(); loadConfig(); }, [companyId]);

  async function loadConfig() {
    const { data } = await (supabase as any)
      .from('schedule_settings')
      .select('service_types, duration_options')
      .eq('company_id', companyId)
      .maybeSingle();
    if (data) {
      setScheduleConfig({
        serviceTypes:    data.service_types,
        durationOptions: data.duration_options,
      });
    }
  }

  // Realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel(`schedule:${companyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'appointments',
        filter: `company_id=eq.${companyId}`,
      }, () => loadAppointments())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId]);

  async function loadData() {
    setLoading(true);
    await Promise.all([loadTechnicians(), loadAppointments()]);
    setLoading(false);
  }

  async function loadTechnicians() {
    const { data } = await (supabase as any)
      .from('technicians')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('created_at');
    setTechnicians(data || []);
  }

  async function loadAppointments() {
    const now  = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const to   = new Date(now.getFullYear(), now.getMonth() + 2, 28).toISOString();

    const { data } = await (supabase as any)
      .from('appointments')
      .select('*, technician:technician_id(id, name, color, photo_url)')
      .eq('company_id', companyId)
      .gte('start_datetime', from)
      .lte('start_datetime', to)
      .neq('status', 'cancelado')
      .order('start_datetime');
    setAppointments(data || []);
  }

  function openNew(date?: string, time?: string, techId?: string) {
    setEditAppt(undefined);
    setDefDate(date);
    setDefTime(time);
    setDefTech(techId);
    setFormOpen(true);
  }

  function openEdit(a: Appointment) {
    setDetail(null);
    setEditAppt(a);
    setFormOpen(true);
  }

  async function cancelAppt(a: Appointment) {
    await (supabase as any).from('appointments').update({ status: 'cancelado' }).eq('id', a.id);
    toast({ title: 'Cita cancelada' });
    setDetail(null);
    loadAppointments();
  }

  async function updateStatus(a: Appointment, newStatus: string) {
    await (supabase as any).from('appointments').update({ status: newStatus }).eq('id', a.id);
    setDetail(prev => prev ? { ...prev, status: newStatus } : null);
    loadAppointments();
  }

  // Stats
  const todayStr   = format(new Date(), 'yyyy-MM-dd');
  const todayAppts = appointments.filter(a => a.start_datetime.startsWith(todayStr));
  const pending    = appointments.filter(a => a.status === 'pendiente').length;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 relative overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm">
            <Calendar className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">Agenda</h1>
            <p className="text-[11px] text-muted-foreground leading-none">
              {pending > 0
                ? `${pending} cita${pending > 1 ? 's' : ''} pendiente${pending > 1 ? 's' : ''}`
                : 'Sin citas pendientes'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl gap-2 text-[11px] font-semibold border-border/30"
              onClick={() => setCfgOpen(true)}
            >
              <Settings2 className="w-3.5 h-3.5" />
              Configurar
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl gap-2 text-[11px] font-semibold border-border/30"
              onClick={() => setTechOpen(true)}
            >
              <Settings2 className="w-3.5 h-3.5" />
              Técnicos
              {technicians.length > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-0.5">
                  {technicians.length}
                </Badge>
              )}
            </Button>
          )}
          <Button
            size="sm"
            className="h-9 rounded-xl gap-2 text-[11px] font-semibold"
            onClick={() => openNew()}
          >
            <Plus className="w-3.5 h-3.5" /> Nueva Cita
          </Button>
        </div>
      </div>

      {/* ── Today's stats chips ── */}
      {todayAppts.length > 0 && (
        <div className="flex gap-2 shrink-0 overflow-x-auto pb-0.5">
          {technicians.map((tech, i) => {
            const n = todayAppts.filter(a => a.technician_id === tech.id).length;
            if (!n) return null;
            return (
              <motion.button
                key={tech.id}
                initial={{ opacity: 0, y: 6, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  const first = todayAppts.find(a => a.technician_id === tech.id);
                  if (first) setDetail(first);
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl shrink-0 cursor-pointer"
                style={{
                  background:  `linear-gradient(135deg, ${tech.color}18, ${tech.color}08)`,
                  border:      `1px solid ${tech.color}30`,
                  boxShadow:   `0 2px 8px ${tech.color}15`,
                }}
              >
                <TechAvatar tech={tech} size="xs" />
                <span className="text-[11px] font-semibold truncate max-w-[80px]">{tech.name}</span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg"
                  style={{ background: `${tech.color}20`, color: tech.color }}
                >
                  {n} hoy
                </span>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* ── Calendar or empty state ── */}
      <div className="flex-1 min-h-0">
        {technicians.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full gap-5 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center">
              <Settings2 className="w-8 h-8 text-primary/25" />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Sin técnicos configurados</p>
              <p className="text-xs text-muted-foreground max-w-[240px]">
                Crea técnicos para comenzar a gestionar la agenda de visitas
              </p>
            </div>
            {isAdmin && (
              <Button onClick={() => setTechOpen(true)} className="rounded-xl gap-2">
                <Plus className="w-4 h-4" /> Crear primer técnico
              </Button>
            )}
          </motion.div>
        ) : (
          <AppointmentCalendar
            technicians={technicians}
            appointments={appointments}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onAppointmentClick={setDetail}
            onSlotClick={(date, time, techId) => openNew(date, time, techId)}
          />
        )}
      </div>

      {/* ── Backdrop for detail panel ── */}
      <AnimatePresence>
        {detail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/20 z-20 backdrop-blur-[1px]"
            onClick={() => setDetail(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Detail slide panel ── */}
      <AnimatePresence>
        {detail && (() => {
          const tech  = technicians.find(t => t.id === detail.technician_id)
            || (detail.technician as any);
          const start = parseISO(detail.start_datetime);
          const end   = addMinutes(start, detail.duration_minutes);
          return (
            <motion.div
              key="detail-panel"
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="absolute top-0 right-0 bottom-0 w-[320px] z-30 flex flex-col"
              style={{
                background:   'hsl(var(--card) / 0.97)',
                backdropFilter: 'blur(20px)',
                borderLeft:   `1px solid ${tech?.color || '#6366f1'}25`,
                boxShadow:    `-8px 0 40px rgba(0,0,0,0.3), -2px 0 8px rgba(0,0,0,0.15)`,
              }}
            >
              {/* Color strip */}
              <div
                className="h-1.5 w-full flex-shrink-0"
                style={{
                  background: `linear-gradient(to right, ${tech?.color || '#6366f1'}, ${tech?.color || '#6366f1'}60)`,
                }}
              />

              {/* Panel header */}
              <div
                className="flex items-center gap-3 px-4 py-3.5 flex-shrink-0"
                style={{
                  borderBottom: `1px solid ${tech?.color || '#6366f1'}15`,
                  background:   `linear-gradient(180deg, ${tech?.color || '#6366f1'}10 0%, transparent 100%)`,
                }}
              >
                {tech
                  ? <TechAvatar tech={tech} size="sm" />
                  : <div className="w-7 h-7 rounded-full bg-muted/40 flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{detail.service_type}</p>
                  <p className="text-[11px] text-muted-foreground">{tech?.name || '—'}</p>
                </div>
                <button
                  onClick={() => setDetail(null)}
                  className="w-7 h-7 rounded-lg hover:bg-secondary/60 flex items-center justify-center transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable body */}
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {/* Quick status change */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-widest">Estado</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {(Object.entries(STATUS_LABELS) as [string, string][]).map(([k, v]) => {
                        const StatusIcon = STATUS_ICONS[k] || Circle;
                        const isActive   = detail.status === k;
                        return (
                          <button
                            key={k}
                            onClick={() => updateStatus(detail, k)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                              isActive
                                ? `${STATUS_COLORS[k as keyof typeof STATUS_COLORS]} border-current/30 bg-current/8`
                                : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground'
                            }`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Detail rows */}
                  <div className="space-y-3.5">
                    {([
                      { Icon: User,   label: 'Cliente',   value: detail.client_name },
                      { Icon: Clock,  label: 'Horario',   value: `${format(start, "EEE d MMM, HH:mm", { locale: es })} — ${format(end, 'HH:mm')}` },
                      { Icon: MapPin, label: 'Dirección', value: detail.client_address },
                      { Icon: Wrench, label: 'Técnico',   value: tech?.name || '—' },
                    ] as const).map(({ Icon: IcComp, label, value }) => value ? (
                      <div key={label} className="flex items-start gap-3">
                        <IcComp className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] text-muted-foreground/60 leading-none mb-0.5">{label}</p>
                          <p className="text-[12px] font-medium leading-snug">{value}</p>
                        </div>
                      </div>
                    ) : null)}

                    {detail.client_rut && (
                      <div className="flex items-start gap-3">
                        <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] text-muted-foreground/60 leading-none mb-0.5">RUT</p>
                          <p className="text-[12px] font-medium">{detail.client_rut}</p>
                        </div>
                      </div>
                    )}

                    {detail.notes && (
                      <div className="px-3 py-2.5 rounded-xl bg-secondary/20 text-[11px] text-muted-foreground leading-relaxed">
                        {detail.notes}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>

              {/* Action buttons */}
              <div className="p-4 border-t border-border/40 flex gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  className="flex-1 h-9 rounded-xl gap-1.5 text-[11px] font-semibold"
                  onClick={() => openEdit(detail)}
                >
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </Button>
                <Button
                  variant="outline"
                  className="h-9 rounded-xl gap-1.5 text-[11px] font-semibold text-red-500 border-red-500/20 hover:bg-red-500/10"
                  onClick={() => cancelAppt(detail)}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Cancelar
                </Button>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── FAB ── */}
      <AnimatePresence>
        {!detail && technicians.length > 0 && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.93 }}
            onClick={() => openNew()}
            className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center z-10 text-primary-foreground"
          >
            <Plus className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Appointment form ── */}
      <AppointmentForm
        companyId={companyId}
        userId={userId}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadAppointments}
        technicians={technicians}
        appointment={editAppt}
        defaultDate={defDate}
        defaultTime={defTime}
        defaultTechnicianId={defTech}
        scheduleConfig={scheduleConfig}
      />

      {/* ── Schedule config manager ── */}
      {isAdmin && (
        <ScheduleConfigManager
          companyId={companyId}
          open={cfgOpen}
          onClose={() => setCfgOpen(false)}
          onChanged={cfg => setScheduleConfig(cfg)}
        />
      )}

      {/* ── Technician manager ── */}
      {isAdmin && (
        <TechnicianManager
          companyId={companyId}
          open={techOpen}
          onClose={() => setTechOpen(false)}
          onChanged={loadTechnicians}
        />
      )}
    </div>
  );
}
