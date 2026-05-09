import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Minus, Settings2, Calendar, Clock, MapPin,
  User, Wrench, Loader2, Pencil, Trash2, Send, MessageCircle, Search,
  CheckCircle2, Truck, XCircle, Circle, X, UserCheck, HelpCircle, Phone, Inbox,
  MessageSquare, TicketX,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO, addMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { type Technician, type Appointment, STATUS_COLORS, STATUS_LABELS, type AppointmentStatus } from "./types";
import AppointmentCalendar  from "./AppointmentCalendar";
import AppointmentForm       from "./AppointmentForm";
import TechnicianManager     from "./TechnicianManager";
import TechAvatar            from "./TechAvatar";
import TechScheduleBoard     from "./TechScheduleBoard";
import ScheduleConfigManager, { type ScheduleConfig } from "./ScheduleConfigManager";

interface Props {
  companyId: string;
  userId: string;
  isAdmin?: boolean;
  onOpenInboxConversation?: (phone: string, message?: string) => void;
}

interface WATplComponent { type: string; text?: string; }
interface WATemplate { name: string; language: string; category: string; status: string; components: WATplComponent[]; }

const STATUS_ICONS: Record<string, React.ElementType> = {
  pendiente:  Circle,
  en_camino:  Truck,
  en_espera:  Clock,
  completado: CheckCircle2,
  cancelado:  XCircle,
};

export default function ScheduleManager({ companyId, userId, isAdmin = false, onOpenInboxConversation }: Props) {
  const { toast } = useToast();
  const [mainView, setMainView] = useState<'agenda' | 'tecnicos'>('agenda');
  const [technicians,  setTechnicians]  = useState<Technician[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [techSchedules, setTechSchedules] = useState<any[]>([]);

  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null);

  // Modals / panels
  const [techOpen,       setTechOpen]       = useState(false);
  const [techOpenMode,   setTechOpenMode]   = useState<'list' | 'create'>('list');
  const [cfgOpen,        setCfgOpen]        = useState(false);
  const [formOpen,       setFormOpen]       = useState(false);
  const [editAppt, setEditAppt]  = useState<Appointment | undefined>();
  const [defDate,  setDefDate]   = useState<string | undefined>();
  const [defTime,  setDefTime]   = useState<string | undefined>();
  const [defTech,  setDefTech]   = useState<string | undefined>();
  const [detail,   setDetail]    = useState<Appointment | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<Appointment | null>(null);

  // En espera assignment modal
  const [assignModal,     setAssignModal]     = useState(false);
  const [assignModalTech, setAssignModalTech] = useState<Technician | null>(null);
  const [waitingAppts,    setWaitingAppts]    = useState<Appointment[]>([]);
  const [assigningApptId, setAssigningApptId] = useState('');
  const [assigning,       setAssigning]       = useState(false);

  // Detail panel en_espera assignment
  const [detailAssignTech, setDetailAssignTech] = useState('');
  const [detailAssigning,  setDetailAssigning]  = useState(false);

  // Outbound templates permission
  const [outboundEnabled, setOutboundEnabled] = useState(true);

  // Cerrar ticket desde panel de detalle
  const [closeTicketOpen,     setCloseTicketOpen]     = useState(false);
  const [closeTicketNotes,    setCloseTicketNotes]     = useState('');
  const [closeTicketGenAI,    setCloseTicketGenAI]     = useState(false);
  const [closeTicketLoading,  setCloseTicketLoading]   = useState(false);

  // Send-task feature
  const [sendTaskModal,       setSendTaskModal]       = useState<null | 'setup' | 'confirm'>(null);
  const [techTemplates,       setTechTemplates]       = useState<WATemplate[]>([]);
  const [techTemplateSearch,  setTechTemplateSearch]  = useState('');
  const [loadingTechTemplates,setLoadingTechTemplates]= useState(false);
  const [savingTemplate,      setSavingTemplate]      = useState(false);
  const [sendingTask,         setSendingTask]         = useState(false);

  // Viewport width for responsive zoom formula
  const [viewportW, setViewportW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const update = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Manual zoom override (persisted per company)
  const zoomKey = `agenda_zoom_${companyId}`;
  const [userZoom, setUserZoom] = useState<number | null>(() => {
    const s = localStorage.getItem(`agenda_zoom_${companyId}`);
    return s ? parseFloat(s) : null;
  });

  // Font-size scale (independent from layout zoom)
  const fontKey = `agenda_font_${companyId}`;
  const [fontScale, setFontScale] = useState<number>(() => {
    const s = localStorage.getItem(`agenda_font_${companyId}`);
    return s ? parseFloat(s) : 1.0;
  });

  // Status filter chips (empty = show all)
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus[]>([]);

  function toggleStatusFilter(s: AppointmentStatus) {
    setStatusFilter(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  }

  const filteredAppointments = useMemo(() =>
    statusFilter.length === 0 ? appointments : appointments.filter(a => statusFilter.includes(a.status)),
    [appointments, statusFilter],
  );

  useEffect(() => { loadData(); loadConfig(); }, [companyId]);
  useEffect(() => { if (technicians.length > 0) loadTechSchedules(); }, [technicians]);

  async function loadConfig() {
    const [{ data: settings }, { data: cfg }] = await Promise.all([
      (supabase as any)
        .from('schedule_settings')
        .select('service_types, duration_options, tech_notification_template_id')
        .eq('company_id', companyId)
        .maybeSingle(),
      (supabase as any)
        .from('company_config')
        .select('outbound_enabled')
        .eq('id', companyId)
        .maybeSingle(),
    ]);
    if (settings) {
      setScheduleConfig({
        serviceTypes:                  settings.service_types,
        durationOptions:               settings.duration_options,
        techNotificationTemplateId:    settings.tech_notification_template_id || null,
      });
    }
    setOutboundEnabled(cfg?.outbound_enabled ?? true);
  }

  // Realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel(`schedule:${companyId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'appointments',
        filter: `company_id=eq.${companyId}`,
      }, () => loadAppointments())
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'appointments',
        filter: `company_id=eq.${companyId}`,
      }, () => loadAppointments())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'appointments',
        filter: `company_id=eq.${companyId}`,
      }, (payload: any) => {
        loadAppointments();
        if (payload.new?.status === 'completado' && payload.old?.status !== 'completado') {
          notifyEnEspera(payload.new.technician_id);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId]);

  async function loadTechSchedules() {
    const ids = technicians.map(t => t.id);
    if (ids.length === 0) return;
    const { data } = await (supabase as any)
      .from('technician_schedules')
      .select('technician_id, start_time, end_time, is_day_off')
      .in('technician_id', ids);
    setTechSchedules(data || []);
  }

  async function notifyEnEspera(completedTechId: string) {
    const [{ data: waiting }, { data: techData }] = await Promise.all([
      (supabase as any).from('appointments')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'en_espera')
        .order('created_at'),
      (supabase as any).from('technicians')
        .select('*')
        .eq('id', completedTechId)
        .maybeSingle(),
    ]);
    if (waiting && waiting.length > 0) {
      setWaitingAppts(waiting);
      setAssignModalTech(techData);
      setAssigningApptId(waiting[0].id);
      setAssignModal(true);
    }
  }

  async function confirmAssign() {
    if (!assigningApptId || !assignModalTech) return;
    setAssigning(true);
    const { error } = await (supabase as any).from('appointments')
      .update({ technician_id: assignModalTech.id, status: 'pendiente' })
      .eq('id', assigningApptId);
    if (error) {
      toast({ title: 'Error al asignar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Cita asignada a ${assignModalTech.name}` });
      setAssignModal(false);
      loadAppointments();
    }
    setAssigning(false);
  }

  async function assignFromDetail() {
    if (!detail || !detailAssignTech) return;
    setDetailAssigning(true);
    const { error } = await (supabase as any).from('appointments')
      .update({ technician_id: detailAssignTech, status: 'pendiente' })
      .eq('id', detail.id);
    if (error) {
      toast({ title: 'Error al asignar', variant: 'destructive' });
    } else {
      toast({ title: 'Técnico asignado' });
      setDetail(prev => prev ? { ...prev, technician_id: detailAssignTech, status: 'pendiente' as const } : null);
      setDetailAssignTech('');
      loadAppointments();
    }
    setDetailAssigning(false);
  }

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
      .order('is_active', { ascending: false })
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
    setDetail(prev => prev ? { ...prev, status: newStatus as any } : null);
    loadAppointments();
  }

  // Dynamic hour range from tech schedules
  // Seed with inverted extremes so the first active schedule sets the real range
  const { schedHourStart, schedHourEnd } = useMemo(() => {
    let start = 23, end = 0;
    for (const s of techSchedules) {
      if (s.is_day_off) continue;
      const sh = parseInt(s.start_time?.slice(0, 2) ?? '');
      const eh = parseInt(s.end_time?.slice(0, 2)   ?? '');
      if (!isNaN(sh)) start = Math.min(start, sh);
      if (!isNaN(eh)) end   = Math.max(end, eh);
    }
    // Fallback to wide defaults when no active schedule rows exist yet
    return {
      schedHourStart: start < 23 ? start : 7,
      schedHourEnd:   end   > 0  ? end   : 20,
    };
  }, [techSchedules]);

  // Technician resolved from current detail (lifted so send functions can access it)
  const detailTech = useMemo(() => {
    if (!detail) return null;
    return technicians.find(t => t.id === detail.technician_id) || (detail.technician as any) || null;
  }, [detail, technicians]);

  // ── Send-task helpers ────────────────────────────────────────────────────────
  function buildTechMessage() {
    if (!detail || !detailTech) return '';
    const start   = parseISO(detail.start_datetime);
    const end     = addMinutes(start, detail.duration_minutes);
    const horario = `${format(start, "d/MM/yyyy HH:mm")} - ${format(end, 'HH:mm')}`;
    // Plain text version for wa.me links — emojis outside the BMP get corrupted in browser URLs
    return [
      `Hola ${detailTech.name}, se te ha asignado una nueva visita tecnica:`,
      '',
      `- Cliente: ${detail.client_name}`,
      detail.client_rut   ? `- RUT: ${detail.client_rut}`       : null,
      detail.client_phone ? `- Telefono: ${detail.client_phone}` : null,
      `- Direccion: ${detail.client_address}`,
      `- Horario: ${horario}`,
      '',
      'Detalle del Requerimiento:',
      detail.notes || 'Sin detalles adicionales',
      '',
      'Por favor, confirma la recepcion de este mensaje.',
    ].filter(l => l !== null).join('\n');
  }

  function handleWhatsAppLink() {
    if (!detailTech?.phone) return;
    const phone = detailTech.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildTechMessage())}`, '_blank');
  }

  async function fetchTechTemplates() {
    if (loadingTechTemplates) return;
    setLoadingTechTemplates(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke('ycloud-get-templates-company', {
        body: { company_id: companyId },
      });
      if (error) throw error;
      setTechTemplates(data?.templates || []);
    } catch (err: any) {
      toast({ title: 'Error cargando plantillas', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingTechTemplates(false);
    }
  }

  function getTechTemplatePreview(tpl: WATemplate): string {
    const body = tpl.components.find(c => c.type.toUpperCase() === 'BODY');
    return body?.text?.substring(0, 120) || '';
  }

  function handleSendTemplate() {
    const tid = scheduleConfig?.techNotificationTemplateId;
    if (!tid) {
      setTechTemplateSearch('');
      setTechTemplates([]);
      fetchTechTemplates();
      setSendTaskModal('setup');
    } else {
      setSendTaskModal('confirm');
    }
  }

  async function saveTemplate(tpl: WATemplate) {
    setSavingTemplate(true);
    try {
      const { error } = await (supabase as any)
        .from('schedule_settings')
        .upsert({ company_id: companyId, tech_notification_template_id: tpl.name }, { onConflict: 'company_id' });
      if (error) throw error;
      // Actualiza estado aunque scheduleConfig sea null (empresa sin config previa)
      setScheduleConfig(prev => prev
        ? { ...prev, techNotificationTemplateId: tpl.name }
        : { serviceTypes: [], durationOptions: [], techNotificationTemplateId: tpl.name }
      );
      setSendTaskModal(null);
      setTechTemplateSearch('');
      toast({ title: `Plantilla "${tpl.name}" configurada ✓` });
    } catch (err: any) {
      toast({ title: 'Error al guardar plantilla', description: err.message, variant: 'destructive' });
    } finally {
      setSavingTemplate(false);
    }
  }

  async function sendViaTemplate() {
    if (!detail || !detailTech) return;
    const templateId = scheduleConfig?.techNotificationTemplateId;
    if (!templateId) return;
    const start   = parseISO(detail.start_datetime);
    const end     = addMinutes(start, detail.duration_minutes);
    const horario = `${format(start, "d 'de' MMMM 'a las' HH:mm", { locale: es })} hasta ${format(end, 'HH:mm')}`;
    setSendingTask(true);
    try {
      const { error } = await (supabase as any).functions.invoke('send-tech-task', {
        body: {
          company_id: companyId,
          to_phone:   detailTech.phone,
          template_id: templateId,
          variables: {
            nombre_tecnico:   detailTech.name,
            cliente:          detail.client_name,
            rut:              detail.client_rut        || '',
            telefono:         detail.client_phone      || '',
            direccion:        detail.client_address,
            horario,
            detalle_problema: detail.notes             || 'Sin detalles adicionales',
          },
        },
      });
      if (error) throw error;
      toast({ title: '✅ Tarea enviada al técnico' });
      setSendTaskModal(null);
    } catch (err: any) {
      toast({ title: 'Error al enviar', description: err.message, variant: 'destructive' });
    } finally {
      setSendingTask(false);
    }
  }

  // Stats
  const todayStr   = format(new Date(), 'yyyy-MM-dd');
  const todayAppts = appointments.filter(a => a.start_datetime.startsWith(todayStr));
  const pending    = appointments.filter(a => a.status === 'pendiente').length;

  const activeTechs = technicians.filter(t => t.is_active !== false).length;

  // ── Cerrar ticket desde panel de detalle ─────────────────────────────────────
  async function handleCloseTicketConfirm() {
    if (!detail?.client_phone) return;
    setCloseTicketLoading(true);
    try {
      // 1. Buscar conversación por teléfono del cliente
      const cleanPhone = detail.client_phone.replace(/\D/g, '');
      const { data: convRows } = await (supabase as any)
        .from('conversations')
        .select('id')
        .eq('company_id', companyId)
        .ilike('wa_id', `%${cleanPhone}`)
        .limit(1)
        .maybeSingle();

      if (!convRows?.id) {
        toast({ title: 'Sin conversación', description: 'No se encontró chat para este cliente.', variant: 'destructive' });
        return;
      }
      const convId = convRows.id;

      // 2. Buscar ticket activo de esa conversación
      const { data: ticket } = await (supabase as any)
        .from('tickets')
        .select('id')
        .eq('conversation_id', convId)
        .not('status', 'in', '("cerrado","resuelto")')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 3. Generar resumen con IA si el usuario lo pidió
      let summaryText = closeTicketNotes.trim();
      if (closeTicketGenAI && ticket?.id) {
        try {
          const { data: aiData } = await supabase.functions.invoke('generate-case-summary', {
            body: { conversation_id: convId, ticket_id: ticket.id },
          });
          const parsed = typeof aiData === 'string' ? JSON.parse(aiData) : aiData;
          if (parsed?.summary) summaryText = parsed.summary + (summaryText ? `\n\n${summaryText}` : '');
        } catch (e) {
          console.warn('[CloseTicket] generate-case-summary falló, se usará el texto manual.');
        }
      }

      // 4. Guardar nota si hay texto
      if (ticket?.id && summaryText) {
        await (supabase as any).from('ticket_notes').insert({
          ticket_id: ticket.id,
          content: summaryText,
          is_internal: false,
        });
      }

      // 5. Cerrar ticket
      if (ticket?.id) {
        await supabase.functions.invoke('close-ticket', {
          body: { ticket_id: ticket.id, status: 'resuelto' },
        });
      }

      // 6. Reactivar bot en la conversación
      await (supabase as any).from('conversations')
        .update({ is_agent_active: true })
        .eq('id', convId);

      toast({ title: '✅ Ticket cerrado', description: `Caso de ${detail.client_name} resuelto.` });
      setCloseTicketOpen(false);
      setCloseTicketNotes('');
      setCloseTicketGenAI(false);
    } catch (err: any) {
      toast({ title: 'Error al cerrar ticket', description: err.message, variant: 'destructive' });
    } finally {
      setCloseTicketLoading(false);
    }
  }

  // Auto zoom: combina ancho de pantalla + cantidad de técnicos
  // vwFactor: 1.0 en ≥1440px → 0.80 en ≤1152px
  // techBase:  1.0 con ≤2 técnicos → 0.65 con 9+, -0.05 por técnico extra
  const vwFactor   = Math.min(1.0, Math.max(0.80, viewportW / 1440));
  const techBase   = Math.min(1.0, Math.max(0.65, 1.10 - activeTechs * 0.05));
  const autoZoom   = Math.round(Math.min(vwFactor, techBase) * 20) / 20; // snap a pasos de 0.05
  const scheduleZoom = userZoom ?? autoZoom;

  function adjustZoom(delta: number) {
    const next    = Math.round((scheduleZoom + delta) * 20) / 20;
    const clamped = Math.min(1.50, Math.max(0.50, next));
    setUserZoom(clamped);
    localStorage.setItem(zoomKey, String(clamped));
  }
  function resetZoom() {
    setUserZoom(null);
    localStorage.removeItem(zoomKey);
  }

  function adjustFont(delta: number) {
    const next    = Math.round((fontScale + delta) * 10) / 10;
    const clamped = Math.min(1.5, Math.max(0.8, next));
    setFontScale(clamped);
    localStorage.setItem(fontKey, String(clamped));
  }
  function resetFont() {
    setFontScale(1.0);
    localStorage.removeItem(fontKey);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-full relative overflow-hidden">
      <div className="h-full flex flex-col gap-2">

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
              onClick={() => { setTechOpenMode('list'); setTechOpen(true); }}
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
          {mainView === 'agenda' && (
            <div className="flex items-center gap-2">
              {/* Font size control */}
              <div className="flex items-center gap-0.5 bg-muted/40 rounded-xl border border-border/30 px-1 py-1">
                <button
                  onClick={() => adjustFont(-0.1)}
                  disabled={fontScale <= 0.8}
                  className="w-6 h-6 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  title="Reducir tamaño de texto"
                >
                  <span className="text-[9px] font-black leading-none">A</span>
                </button>
                <button
                  onClick={resetFont}
                  className={`text-[10px] font-bold tabular-nums w-9 text-center rounded-lg py-0.5 transition-colors ${
                    fontScale !== 1.0
                      ? 'text-primary hover:bg-primary/10'
                      : 'text-muted-foreground/60 hover:bg-muted'
                  }`}
                  title={fontScale !== 1.0 ? 'Restablecer tamaño de texto' : 'Tamaño de texto normal'}
                >
                  {Math.round(fontScale * 100)}%
                </button>
                <button
                  onClick={() => adjustFont(0.1)}
                  disabled={fontScale >= 1.5}
                  className="w-6 h-6 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  title="Aumentar tamaño de texto"
                >
                  <span className="text-[13px] font-black leading-none">A</span>
                </button>
              </div>
              {/* Zoom manual */}
              <div className="flex items-center gap-0.5 bg-muted/40 rounded-xl border border-border/30 px-1 py-1">
                <button
                  onClick={() => adjustZoom(-0.05)}
                  disabled={scheduleZoom <= 0.50}
                  className="w-6 h-6 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  title="Reducir zoom"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  onClick={resetZoom}
                  className={`text-[10px] font-bold tabular-nums w-9 text-center rounded-lg py-0.5 transition-colors ${
                    userZoom !== null
                      ? 'text-primary hover:bg-primary/10'
                      : 'text-muted-foreground/60 hover:bg-muted'
                  }`}
                  title={userZoom !== null ? 'Restablecer zoom automático' : 'Zoom automático activo'}
                >
                  {Math.round(scheduleZoom * 100)}%
                </button>
                <button
                  onClick={() => adjustZoom(0.05)}
                  disabled={scheduleZoom >= 1.50}
                  className="w-6 h-6 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  title="Aumentar zoom"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center cursor-help">
                    <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-[200px] text-xs font-medium">
                  <p>💡 Tip: También puedes crear citas haciendo clic directamente en cualquier parte de la cuadrícula del calendario.</p>
                </TooltipContent>
              </Tooltip>
              <Button
                size="sm"
                className="h-9 rounded-xl gap-2 text-[11px] font-semibold"
                onClick={() => openNew()}
              >
                <Plus className="w-3.5 h-3.5" /> Nueva Cita
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── View tabs ── */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-2xl bg-muted/30 border border-border/40 shrink-0 self-start">
        {([
          { v: 'agenda'   as const, Icon: Calendar,  label: 'Agenda'   },
          { v: 'tecnicos' as const, Icon: UserCheck, label: 'Jornadas' },
        ]).map(({ v, Icon, label }) => (
          <Tooltip key={v}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setMainView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-150 ${
                  mainView === v
                    ? 'bg-card text-primary shadow-sm border border-border/40'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            </TooltipTrigger>
            {v === 'tecnicos' && (
              <TooltipContent className="max-w-[200px] text-xs font-medium" side="bottom">
                <p>Gestiona los horarios, días libres y excepciones de tus técnicos desde aquí.</p>
              </TooltipContent>
            )}
          </Tooltip>
        ))}
      </div>

      {/* ── Status filter chips ── */}
      {mainView === 'agenda' && appointments.length > 0 && (() => {
        const ALL_STATUSES: AppointmentStatus[] = ['pendiente', 'en_camino', 'en_espera', 'completado', 'cancelado'];
        const STATUS_HEX: Record<AppointmentStatus, string> = {
          pendiente:  '#f59e0b',
          en_camino:  '#3b82f6',
          en_espera:  '#8b5cf6',
          completado: '#10b981',
          cancelado:  '#ef4444',
        };
        return (
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <button
              onClick={() => setStatusFilter([])}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all duration-150 ${
                statusFilter.length === 0
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-muted/40 text-muted-foreground border-border/40 hover:text-foreground hover:bg-muted/70'
              }`}
            >
              Todos
              <span className={`text-[9px] px-1 py-0 rounded-md font-extrabold ${
                statusFilter.length === 0 ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {appointments.length}
              </span>
            </button>
            {ALL_STATUSES.map(s => {
              const cnt     = appointments.filter(a => a.status === s).length;
              if (!cnt) return null;
              const active  = statusFilter.includes(s);
              const hex     = STATUS_HEX[s];
              const Icon    = STATUS_ICONS[s];
              return (
                <button
                  key={s}
                  onClick={() => toggleStatusFilter(s)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all duration-150"
                  style={{
                    background:   active ? `${hex}22` : 'hsl(var(--muted) / 0.3)',
                    borderColor:  active ? `${hex}55` : 'hsl(var(--border) / 0.4)',
                    color:        active ? hex        : 'hsl(var(--muted-foreground))',
                    boxShadow:    active ? `0 0 0 1px ${hex}33` : 'none',
                  }}
                >
                  <Icon className="w-3 h-3" style={{ color: active ? hex : undefined }} />
                  {STATUS_LABELS[s]}
                  <span
                    className="text-[9px] px-1 py-0 rounded-md font-extrabold"
                    style={{
                      background: active ? `${hex}25` : 'hsl(var(--muted))',
                      color:      active ? hex        : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {cnt}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* ── Today's stats chips ── */}
      {todayAppts.length > 0 && (
        <div className="flex gap-2 shrink-0 overflow-x-auto pb-0.5">
          {technicians.filter(t => t.is_active).map((tech, i) => {
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

      {/* ── Main content (scrollable when zoom overflows) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-4">
      <div style={{ zoom: mainView === 'agenda' ? scheduleZoom : 1 }}>
        {mainView === 'tecnicos' ? (
          <TechScheduleBoard
            companyId={companyId}
            technicians={technicians}
            onScheduleChanged={() => { loadData(); }}
            onCreateTech={() => { setTechOpenMode('create'); setTechOpen(true); }}
          />
        ) : technicians.length === 0 ? (
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
              <Button onClick={() => { setTechOpenMode('create'); setTechOpen(true); }} className="rounded-xl gap-2">
                <Plus className="w-4 h-4" /> Crear primer técnico
              </Button>
            )}
          </motion.div>
        ) : (
          <AppointmentCalendar
            technicians={technicians}
            appointments={filteredAppointments}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onAppointmentClick={setDetail}
            onSlotClick={(date, time, techId) => openNew(date, time, techId)}
            baseHourStart={schedHourStart}
            baseHourEnd={schedHourEnd}
            fontScale={fontScale}
          />
        )}
      </div>
      </div>{/* end scroll wrapper */}

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
          const tech  = detailTech;
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
                {/* Acciones rápidas */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        disabled={!detail.client_phone}
                        onClick={() => detail.client_phone && onOpenInboxConversation?.(detail.client_phone)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                          detail.client_phone
                            ? 'hover:bg-primary/15 text-primary'
                            : 'text-muted-foreground/30 cursor-not-allowed'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      {detail.client_phone ? 'Ver chat del cliente' : 'Sin teléfono registrado'}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        disabled={!detail.client_phone}
                        onClick={() => {
                          setCloseTicketNotes('');
                          setCloseTicketGenAI(false);
                          setCloseTicketOpen(true);
                        }}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                          detail.client_phone
                            ? 'hover:bg-destructive/15 text-destructive/70 hover:text-destructive'
                            : 'text-muted-foreground/30 cursor-not-allowed'
                        }`}
                      >
                        <TicketX className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      {detail.client_phone ? 'Cerrar ticket' : 'Sin teléfono registrado'}
                    </TooltipContent>
                  </Tooltip>
                  <button
                    onClick={() => setDetail(null)}
                    className="w-7 h-7 rounded-lg hover:bg-secondary/60 flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
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

                  {/* En espera: assign tech */}
                  {detail.status === 'en_espera' && (
                    <div className="space-y-2 p-3 rounded-xl bg-violet-500/8 border border-violet-500/30">
                      <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest flex items-center gap-1.5">
                        <UserCheck className="w-3 h-3" /> Asignar técnico
                      </p>
                      <Select value={detailAssignTech} onValueChange={setDetailAssignTech}>
                        <SelectTrigger className="h-8 text-[11px] rounded-xl">
                          <SelectValue placeholder="Seleccionar técnico..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {technicians.filter(t => t.is_active).map(t => (
                            <SelectItem key={t.id} value={t.id} className="text-[11px]">{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={assignFromDetail}
                        disabled={!detailAssignTech || detailAssigning}
                        className="w-full h-8 rounded-xl text-[11px] bg-violet-600 hover:bg-violet-700 gap-1.5"
                      >
                        {detailAssigning && <Loader2 className="w-3 h-3 animate-spin" />}
                        Confirmar asignación
                      </Button>
                    </div>
                  )}

                  {/* Detail rows */}
                  <div className="space-y-3.5">
                    {([
                      { Icon: User,   label: 'Cliente',   value: detail.client_name },
                      { Icon: Phone,  label: 'Teléfono',  value: detail.client_phone },
                      { Icon: Clock,  label: 'Horario',   value: `${format(start, "EEE d MMM, HH:mm", { locale: es })} — ${format(end, 'HH:mm')}` },
                      { Icon: MapPin, label: 'Dirección', value: detail.client_address },
                      { Icon: Wrench, label: 'Técnico',   value: detail.status === 'en_espera' ? 'A espera de un técnico' : (tech?.name || '—') },
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
                  onClick={() => setCancelConfirm(detail)}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Cancelar
                </Button>
              </div>

              {/* Send-task buttons */}
              <div className="px-4 pb-4 flex gap-2 flex-shrink-0">
                {/* Option A: envío via plantilla IA (solo si outbound habilitado) */}
                {outboundEnabled && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        className={`flex-1 h-9 rounded-xl gap-1.5 text-[11px] font-semibold transition-colors ${
                          tech?.phone
                            ? 'text-emerald-600 border-emerald-500/25 hover:bg-emerald-500/10 hover:border-emerald-500/40'
                            : 'opacity-40 cursor-not-allowed'
                        }`}
                        disabled={!tech?.phone}
                        onClick={handleSendTemplate}
                      >
                        <Send className="w-3.5 h-3.5" /> Enviar tarea
                      </Button>
                    </TooltipTrigger>
                    {!tech?.phone && (
                      <TooltipContent className="text-xs max-w-[180px]">
                        El técnico no tiene número registrado
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}

                {/* Option B: abrir chat en la bandeja */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      disabled={!tech?.phone}
                      onClick={() => tech?.phone && onOpenInboxConversation?.(tech.phone, buildTechMessage())}
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors flex-shrink-0 ${
                        tech?.phone
                          ? 'border-primary/25 text-primary hover:bg-primary/10'
                          : 'border-border/40 text-muted-foreground/30 cursor-not-allowed'
                      }`}
                    >
                      <Inbox className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    {tech?.phone ? 'Abrir chat en la bandeja' : 'El técnico no tiene número registrado'}
                  </TooltipContent>
                </Tooltip>

                {/* Option C: abrir WhatsApp Web */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      disabled={!tech?.phone}
                      onClick={handleWhatsAppLink}
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors flex-shrink-0 ${
                        tech?.phone
                          ? 'border-emerald-500/25 text-emerald-600 hover:bg-emerald-500/10'
                          : 'border-border/40 text-muted-foreground/30 cursor-not-allowed'
                      }`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    {tech?.phone ? 'Abrir en WhatsApp Web' : 'El técnico no tiene número registrado'}
                  </TooltipContent>
                </Tooltip>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Confirmación cancelar cita ── */}
      <Dialog open={!!cancelConfirm} onOpenChange={open => { if (!open) setCancelConfirm(null); }}>
        <DialogContent className="max-w-sm bg-card border-border/30" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <Trash2 className="w-4 h-4" /> ¿Cancelar esta cita?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se cancelará la cita de <span className="font-semibold text-foreground">{cancelConfirm?.client_name}</span>
            {cancelConfirm?.client_phone && <> ({cancelConfirm.client_phone})</>}
            {' '}del {cancelConfirm && format(parseISO(cancelConfirm.start_datetime), "d 'de' MMMM 'a las' HH:mm", { locale: es })}. Esta acción no se puede deshacer.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setCancelConfirm(null)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl gap-1.5"
              onClick={async () => {
                if (!cancelConfirm) return;
                await cancelAppt(cancelConfirm);
                setCancelConfirm(null);
                setDetail(null);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Sí, cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cerrar ticket desde panel de detalle ── */}
      <Dialog open={closeTicketOpen} onOpenChange={open => { if (!closeTicketLoading) setCloseTicketOpen(open); }}>
        <DialogContent className="max-w-sm bg-card border-border/30" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <TicketX className="w-4 h-4 text-destructive" />
              Cerrar ticket — {detail?.client_name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Checkbox generar resumen */}
            <div className="flex items-start gap-3 p-3 rounded-xl border border-border/30 bg-muted/20">
              <Checkbox
                id="gen-summary"
                checked={closeTicketGenAI}
                onCheckedChange={(v) => setCloseTicketGenAI(!!v)}
                disabled={closeTicketLoading}
              />
              <div>
                <label htmlFor="gen-summary" className="text-[13px] font-semibold cursor-pointer">
                  Generar resumen con IA
                </label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  El agente analiza el historial del chat y genera un resumen automático.
                </p>
              </div>
            </div>

            {/* Textarea siempre visible */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {closeTicketGenAI ? 'Notas adicionales (opcional)' : 'Resumen / notas de cierre (opcional)'}
              </label>
              <Textarea
                placeholder="Escribe un resumen o diagnóstico del caso..."
                value={closeTicketNotes}
                onChange={e => setCloseTicketNotes(e.target.value)}
                className="text-[12px] min-h-[90px] resize-none"
                disabled={closeTicketLoading}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCloseTicketOpen(false)} disabled={closeTicketLoading}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCloseTicketConfirm}
              disabled={closeTicketLoading}
              className="gap-1.5"
            >
              {closeTicketLoading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <TicketX className="w-3 h-3" />
              }
              {closeTicketLoading ? (closeTicketGenAI ? 'Generando resumen...' : 'Cerrando...') : 'Confirmar y cerrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Selector de plantilla para notificación al técnico ── */}
      <Dialog open={sendTaskModal === 'setup'} onOpenChange={open => { if (!open) { setSendTaskModal(null); setTechTemplateSearch(''); } }}>
        <DialogContent className="max-w-lg bg-card border-border/30" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              📋 Seleccionar plantilla para técnicos
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Esta plantilla se enviará al técnico al presionar "Enviar tarea". Variables:{' '}
              <span className="font-mono">{'{{1}}'}</span> nombre, <span className="font-mono">{'{{2}}'}</span> cliente,{' '}
              <span className="font-mono">{'{{3}}'}</span> rut, <span className="font-mono">{'{{4}}'}</span> teléfono,{' '}
              <span className="font-mono">{'{{5}}'}</span> dirección, <span className="font-mono">{'{{6}}'}</span> horario,{' '}
              <span className="font-mono">{'{{7}}'}</span> detalle.
            </p>
          </DialogHeader>

          <div className="relative my-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
            <Input
              placeholder="Buscar plantilla..."
              value={techTemplateSearch}
              onChange={e => setTechTemplateSearch(e.target.value)}
              className="pl-8 h-8 text-[12px]"
              autoFocus
            />
          </div>

          <ScrollArea className="h-72">
            {loadingTechTemplates ? (
              <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-[12px]">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando plantillas...
              </div>
            ) : techTemplates.length === 0 ? (
              <p className="text-center text-muted-foreground text-[12px] py-8">
                No se encontraron plantillas aprobadas.
              </p>
            ) : (
              <div className="space-y-1.5 pr-2">
                {techTemplates
                  .filter(t =>
                    !techTemplateSearch ||
                    t.name.toLowerCase().includes(techTemplateSearch.toLowerCase()) ||
                    getTechTemplatePreview(t).toLowerCase().includes(techTemplateSearch.toLowerCase())
                  )
                  .map(tpl => {
                    const isCurrent = scheduleConfig?.techNotificationTemplateId === tpl.name;
                    return (
                      <button
                        key={tpl.name}
                        onClick={() => saveTemplate(tpl)}
                        disabled={savingTemplate}
                        className={`w-full text-left p-3 rounded-lg border transition-all hover:border-primary/50 hover:bg-primary/5 ${
                          isCurrent ? 'border-primary/60 bg-primary/10' : 'border-border/30 bg-background/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-semibold text-foreground">{tpl.name}</span>
                          <div className="flex gap-1">
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5">{tpl.language}</Badge>
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 capitalize">{tpl.category?.toLowerCase()}</Badge>
                            {isCurrent && <Badge className="text-[9px] h-4 px-1.5 bg-primary/20 text-primary border-primary/30">Actual</Badge>}
                          </div>
                        </div>
                        {getTechTemplatePreview(tpl) && (
                          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                            {getTechTemplatePreview(tpl)}
                          </p>
                        )}
                      </button>
                    );
                  })}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setSendTaskModal(null); setTechTemplateSearch(''); }}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmar envío al técnico ── */}
      <Dialog open={sendTaskModal === 'confirm'} onOpenChange={open => { if (!open) setSendTaskModal(null); }}>
        <DialogContent className="max-w-sm bg-card border-border/30" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-500">
              <Send className="w-4 h-4" /> Enviar tarea al técnico
            </DialogTitle>
          </DialogHeader>
          {detail && detailTech && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Se enviará la tarea de <span className="font-semibold text-foreground">{detail.client_name}</span> al técnico:</p>
              <div
                className="flex items-center gap-2.5 p-3 rounded-xl border"
                style={{ background: `${detailTech.color}10`, borderColor: `${detailTech.color}30` }}
              >
                <TechAvatar tech={detailTech} size="sm" />
                <div>
                  <p className="text-sm font-semibold text-foreground leading-tight">{detailTech.name}</p>
                  <p className="text-[11px] font-mono text-muted-foreground">{detailTech.phone}</p>
                </div>
              </div>
              <p className="text-[11px]">
                Plantilla: <span className="font-mono bg-muted rounded px-1.5 py-0.5 text-foreground">{scheduleConfig?.techNotificationTemplateId}</span>
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setSendTaskModal(null)}>
              Cancelar
            </Button>
            <Button
              className="rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={sendViaTemplate}
              disabled={sendingTask}
            >
              {sendingTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Enviar ahora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── FAB ── */}
      <AnimatePresence>
        {mainView === 'agenda' && !detail && technicians.length > 0 && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.93 }}
            onClick={() => openNew()}
            className="fixed bottom-6 right-6 lg:bottom-10 lg:right-10 w-12 h-12 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center z-50 text-primary-foreground"
          >
            <Plus className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── En espera assignment modal ── */}
      <AnimatePresence>
        {assignModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
              onClick={() => setAssignModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[340px] bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">Técnico disponible</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {assignModalTech?.name} completó una cita
                  </p>
                </div>
                <button onClick={() => setAssignModal(false)} className="w-7 h-7 rounded-lg hover:bg-muted/60 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                  Citas en espera ({waitingAppts.length})
                </p>
                <Select value={assigningApptId} onValueChange={setAssigningApptId}>
                  <SelectTrigger className="h-9 text-sm rounded-xl">
                    <SelectValue placeholder="Seleccionar cita..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {waitingAppts.map(a => (
                      <SelectItem key={a.id} value={a.id} className="text-sm">
                        <span className="font-semibold">{a.service_type}</span>
                        <span className="text-muted-foreground ml-1.5">· {a.client_name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setAssignModal(false)} className="flex-1 rounded-xl h-9 text-[11px]">
                  Ignorar
                </Button>
                <Button
                  onClick={confirmAssign}
                  disabled={!assigningApptId || assigning}
                  className="flex-1 rounded-xl h-9 text-[11px] bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                >
                  {assigning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Asignar a {assignModalTech?.name?.split(' ')[0]}
                </Button>
              </div>
            </motion.div>
          </>
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
          defaultCreate={techOpenMode === 'create'}
          onClose={() => setTechOpen(false)}
          onChanged={loadTechnicians}
        />
      )}
      </div>
      </div>
    </TooltipProvider>
  );
}
