import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Loader2, ChevronRight, CalendarPlus } from "lucide-react";
import { format, parseISO, addMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { type Technician, type Appointment, STATUS_COLORS, STATUS_LABELS } from "./types";
import AppointmentForm, { type AppointmentPrefill } from "./AppointmentForm";

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
  const [technicians, setTechnicians]     = useState<Technician[]>([]);
  const [clientAppts, setClientAppts]     = useState<Appointment[]>([]);
  const [loading, setLoading]             = useState(true);
  const [formOpen, setFormOpen]           = useState(false);
  const [editAppt, setEditAppt]           = useState<Appointment | undefined>();

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
            .neq('status', 'cancelado')
            .order('start_datetime', { ascending: false })
            .limit(6)
        : Promise.resolve({ data: [] }),
    ]);
    setTechnicians(techs || []);
    setClientAppts(appts || []);
    setLoading(false);
  }

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
        <SectionTitle onOpenFull={onOpenFullSchedule} />
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
    <div className="space-y-4">
      <SectionTitle onOpenFull={onOpenFullSchedule} />

      {/* Client appointment history */}
      {clientAppts.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground/60 px-0.5">Citas de este cliente</p>
          <AnimatePresence>
            {clientAppts.map((appt, i) => {
              const tech   = (appt.technician as any) || technicians.find(t => t.id === appt.technician_id);
              const start  = parseISO(appt.start_datetime);
              const end    = addMinutes(start, appt.duration_minutes);
              return (
                <motion.button
                  key={appt.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => { setEditAppt(appt); setFormOpen(true); }}
                  className="w-full flex items-start gap-2.5 p-2.5 rounded-xl border border-border/20 bg-secondary/10 hover:bg-secondary/20 transition-colors text-left"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
                    style={{ background: tech?.color || '#6366f1' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold leading-tight">{appt.service_type}</span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 leading-4 flex-shrink-0 ${STATUS_COLORS[appt.status as keyof typeof STATUS_COLORS]}`}
                      >
                        {STATUS_LABELS[appt.status as keyof typeof STATUS_LABELS]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="w-2.5 h-2.5 text-muted-foreground/40" />
                      <span className="text-[10px] text-muted-foreground">
                        {format(start, 'EEE d MMM', { locale: es })} · {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{tech?.name || '—'}</p>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/50 px-0.5">
          Sin citas registradas para este cliente
        </p>
      )}

      {/* Quick booking button */}
      <Button
        onClick={() => { setEditAppt(undefined); setFormOpen(true); }}
        className="w-full justify-center text-[11px] h-10 gap-2 rounded-xl border border-primary/30 text-primary hover:bg-primary/10 font-bold uppercase tracking-wider shadow-none"
        variant="outline"
      >
        <CalendarPlus className="w-3.5 h-3.5" /> Agendar cita
      </Button>

      {/* Form modal */}
      <AppointmentForm
        companyId={companyId}
        userId={userId}
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditAppt(undefined); }}
        onSaved={loadData}
        technicians={technicians}
        appointment={editAppt}
        prefill={editAppt ? undefined : prefill}
      />
    </div>
  );
}

function SectionTitle({ onOpenFull }: { onOpenFull?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2 px-0.5">
        <div className="w-1 h-1 rounded-full bg-primary" /> Agenda
      </h4>
      {onOpenFull && (
        <button
          onClick={onOpenFull}
          className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-0.5 transition-colors"
        >
          Ver agenda <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
