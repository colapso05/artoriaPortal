import { useMemo, useRef, useState, useEffect } from "react";
import {
  format, addDays, startOfWeek, isSameDay, isToday,
  parseISO, addMinutes,
} from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, CalendarDays, LayoutList, Grid3x3, MapPin, Clock,
} from "lucide-react";
import { type Technician, type Appointment, STATUS_LABELS, type AppointmentStatus } from "./types";
import TechAvatar from "./TechAvatar";

const STATUS_BADGE_COLORS: Record<AppointmentStatus, string> = {
  pendiente:  '#f59e0b',
  en_camino:  '#3b82f6',
  en_espera:  '#8b5cf6',
  completado: '#10b981',
  cancelado:  '#ef4444',
};

// ── Constants ─────────────────────────────────────────────────────────────────
const HOUR_HEIGHT   = 64;
const DEFAULT_START = 7;
const DEFAULT_END   = 20;

type CalView = 'day' | 'week' | 'list';

interface Props {
  technicians: Technician[];
  appointments: Appointment[];
  selectedDate: Date;
  onDateChange: (d: Date) => void;
  onAppointmentClick: (a: Appointment) => void;
  onSlotClick?: (date: string, time: string, technicianId?: string) => void;
  baseHourStart?: number;
  baseHourEnd?: number;
  fontScale?: number;
}

function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function apptPosition(a: Appointment, hourStart: number) {
  const start  = parseISO(a.start_datetime);
  const startM = start.getHours() * 60 + start.getMinutes() - hourStart * 60;
  const top    = (startM / 60) * HOUR_HEIGHT;
  const height = Math.max((a.duration_minutes / 60) * HOUR_HEIGHT, 30);
  return { top, height };
}

/** Convierte hora 0-23 a formato AM/PM */
function fmtHour(h: number): string {
  if (h === 0)  return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// ── Day View (Horizontal Gantt) ───────────────────────────────────────────────
const LEFT_W = 172; // px for left tech-name column
interface DayViewProps {
  activeTechs: Technician[];
  allTechs: Technician[];
  byTech: Record<string, Appointment[]>;
  dayStr: string;
  selectedDate: Date;
  onAppointmentClick: (a: Appointment) => void;
  onSlotClick?: (date: string, time: string, techId: string) => void;
  hourStart: number;
  hours: number[];
  totalHeight: number;
  orphanedWaiting: Appointment[];
  fontScale: number;
}

function DayView({ activeTechs, byTech, selectedDate, onAppointmentClick, onSlotClick, hourStart, hours, dayStr, orphanedWaiting, fontScale }: DayViewProps) {
  const [containerW, setContainerW] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    setContainerW(containerRef.current.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // hourW fills the container exactly; Math.floor prevents 1px rounding scrollbar
  const hourW = useMemo(() => {
    if (!containerW || hours.length === 0) return 80;
    return Math.max(55, Math.min(180, Math.floor((containerW - LEFT_W - 1) / hours.length)));
  }, [containerW, hours.length]);

  // Dynamic row height based on number of technicians
  // 1 tech = ~120px, decreases until it hits the safe minimum of 56px (at ~7+ techs)
  const rowHeight = useMemo(() => {
    const n = activeTechs.length;
    if (n === 0) return 56;
    return Math.max(56, 120 - (n - 1) * 12);
  }, [activeTechs.length]);

  const totalW       = hours.length * hourW;
  const isCurrentDay = isToday(selectedDate);

  const currentTimeX = useMemo(() => {
    if (!isCurrentDay) return null;
    const now  = new Date();
    const mins = now.getHours() * 60 + now.getMinutes() - hourStart * 60;
    if (mins < 0 || mins > hours.length * 60) return null;
    return (mins / 60) * hourW;
  }, [isCurrentDay, hourStart, hours.length, hourW]);

  function handleRowClick(e: React.MouseEvent<HTMLDivElement>, techId: string) {
    const rect   = e.currentTarget.getBoundingClientRect();
    const x      = e.clientX - rect.left;
    const totalM = hourStart * 60 + (x / hourW) * 60;
    const h      = Math.floor(totalM / 60);
    const rawM   = Math.round((totalM % 60) / 15) * 15;
    const fh     = rawM >= 60 ? h + 1 : h;
    const fm     = rawM >= 60 ? rawM - 60 : rawM;
    const ts     = `${String(fh).padStart(2, '0')}:${String(fm).padStart(2, '0')}`;
    onSlotClick?.(dayStr, ts, techId);
  }

  return (
    <div ref={containerRef} className="overflow-x-hidden rounded-2xl border border-border/60 bg-card/60 select-none">
      <div style={{ minWidth: LEFT_W + totalW }}>

        {/* ── Header: time labels ── */}
        <div
          className="sticky top-0 z-20 flex bg-card/96 border-b border-border/60 backdrop-blur-sm"
          style={{ height: 44 }}
        >
          {/* Corner cell */}
          <div
            className="sticky left-0 z-30 bg-card/96 flex-shrink-0 flex items-center justify-center border-r border-border/50"
            style={{ width: LEFT_W, backdropFilter: 'blur(12px)' }}
          >
            <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">
              {format(selectedDate, 'd MMM', { locale: es })}
            </span>
          </div>

          {/* Hour cells */}
          {hours.map((h, i) => {
            const isNow = isCurrentDay && h === new Date().getHours();
            return (
              <div
                key={h}
                className="relative flex items-center border-r border-border/30 last:border-0"
                style={{ width: hourW, flexShrink: 0 }}
              >
                <span className={`absolute left-2 text-[10px] font-bold ${isNow ? 'text-red-500' : 'text-muted-foreground/50'}`}>
                  {fmtHour(h)}
                </span>
                {isNow && currentTimeX !== null && (() => {
                  const offsetInHour = currentTimeX - i * hourW;
                  return (
                    <span
                      className="absolute bottom-0.5 text-[9px] font-extrabold text-red-500 tabular-nums bg-card/95 border border-red-500/30 px-1 rounded-md z-10 pointer-events-none"
                      style={{ left: Math.max(2, offsetInHour - 14) }}
                    >
                      {format(new Date(), 'HH:mm')}
                    </span>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* ── Technician rows ── */}
        {activeTechs.map(tech => {
          const techAppts = byTech[tech.id] || [];
          return (
            <div
              key={tech.id}
              className="flex"
              style={{ height: rowHeight, borderBottom: '1px solid hsl(var(--border) / 0.4)' }}
            >
              {/* Left: tech info (sticky) */}
              <div
                className="sticky left-0 z-10 flex items-center gap-2.5 px-3 flex-shrink-0 border-r"
                style={{
                  width:      LEFT_W,
                  background: `linear-gradient(to right, color-mix(in srgb, ${tech.color} 12%, hsl(var(--card) / 0.98)), hsl(var(--card) / 0.97))`,
                  borderColor: `${tech.color}30`,
                  backdropFilter: 'blur(12px)',
                }}
              >
                <TechAvatar tech={tech} size="sm" />
                <div className="flex-1 min-w-0 overflow-hidden" style={{ zoom: fontScale }}>
                  <p className="text-[12px] font-bold truncate leading-tight">{tech.name}</p>
                  {techAppts.length > 0 ? (
                    <p className="text-[10px] font-semibold" style={{ color: tech.color }}>
                      {techAppts.length} cita{techAppts.length > 1 ? 's' : ''}
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground/40">disponible</p>
                  )}
                </div>
              </div>

              {/* Right: timeline */}
              <div
                className="relative cursor-crosshair flex-shrink-0"
                style={{ width: totalW, height: rowHeight }}
                onClick={e => handleRowClick(e, tech.id)}
              >
                {/* Subtle row tint */}
                <div className="absolute inset-0 pointer-events-none" style={{ background: `${tech.color}06` }} />

                {/* Hour vertical lines */}
                {hours.map((_, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-l border-border/50" style={{ left: i * hourW }} />
                ))}

                {/* Half-hour dashed lines */}
                {hours.map((_, i) => (
                  <div key={`h${i}`} className="absolute top-0 bottom-0 border-l border-border/25 border-dashed" style={{ left: i * hourW + hourW / 2 }} />
                ))}

                {/* Current time vertical line */}
                {currentTimeX !== null && (
                  <div
                    className="absolute top-0 bottom-0 z-20 pointer-events-none"
                    style={{ left: currentTimeX, width: 1.5, background: 'rgba(239,68,68,0.55)' }}
                  />
                )}

                {/* Appointment bars */}
                {techAppts.map(appt => {
                  const start     = parseISO(appt.start_datetime);
                  const startMins = start.getHours() * 60 + start.getMinutes() - hourStart * 60;
                  const leftPx    = (startMins / 60) * hourW;
                  const widthPx   = Math.max((appt.duration_minutes / 60) * hourW, 38);
                  if (leftPx > totalW || leftPx + widthPx < 0) return null;

                  const isEnEspera = appt.status === 'en_espera';
                  const startLabel = format(start, 'HH:mm');
                  const endLabel   = format(addMinutes(start, appt.duration_minutes), 'HH:mm');

                  return (
                    <motion.div
                      key={appt.id}
                      initial={{ opacity: 0, scaleX: 0.92 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ duration: 0.16, ease: 'easeOut' }}
                      whileHover={{ scaleY: 1.06, transition: { duration: 0.1 } }}
                      className="absolute cursor-pointer z-10 overflow-hidden"
                      style={{
                        left:         leftPx + 2,
                        width:        widthPx - 4,
                        top:          6,
                        bottom:       6,
                        background:   isEnEspera
                          ? `repeating-linear-gradient(45deg, ${tech.color}22, ${tech.color}22 5px, ${tech.color}08 5px, ${tech.color}08 13px)`
                          : `color-mix(in srgb, ${tech.color} 22%, hsl(var(--card)))`,
                        border:       isEnEspera ? `1.5px dashed ${tech.color}80` : `1px solid color-mix(in srgb, ${tech.color} 40%, transparent)`,
                        borderTop:    isEnEspera ? undefined : `3px solid ${tech.color}`,
                        borderRadius: 10,
                        boxShadow:    isEnEspera ? 'none' : `0 2px 10px color-mix(in srgb, ${tech.color} 18%, transparent)`,
                      }}
                      onClick={e => { e.stopPropagation(); onAppointmentClick(appt); }}
                    >
                      {!isEnEspera && (
                        <div className="absolute top-0 left-0 bottom-0 w-px" style={{ background: `linear-gradient(to bottom, ${tech.color}80, transparent)` }} />
                      )}
                      {/* Status badge dot */}
                      {!isEnEspera && (
                        <div
                          className="absolute top-1.5 right-1.5 z-20 pointer-events-none"
                          title={STATUS_LABELS[appt.status]}
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ background: STATUS_BADGE_COLORS[appt.status], boxShadow: `0 0 4px ${STATUS_BADGE_COLORS[appt.status]}80` }}
                          />
                        </div>
                      )}
                      <div className="px-2 h-full flex flex-col justify-center gap-0.5 overflow-hidden" style={{ zoom: fontScale }}>
                        <p className="text-[10px] font-bold leading-tight truncate" style={{ color: isEnEspera ? `${tech.color}bb` : tech.color }}>
                          {appt.service_type}
                          {isEnEspera && <span className="ml-1 opacity-60 font-normal">(espera)</span>}
                        </p>
                        {widthPx > 64 && (
                          <p className="text-[9px] text-foreground/70 truncate font-medium">{appt.client_name}</p>
                        )}
                        {widthPx > 108 && (
                          <p className="text-[9px] text-muted-foreground/55 tabular-nums">{startLabel}–{endLabel}</p>
                        )}
                        {widthPx > 160 && appt.client_address && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-2 h-2 flex-shrink-0 opacity-40" style={{ color: tech.color }} />
                            <p className="text-[8px] text-muted-foreground/45 truncate">{appt.client_address}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* ── "En espera" row: orphaned appointments with no technician assigned ── */}
        {orphanedWaiting.length > 0 && (
          <div
            className="flex"
            style={{ height: rowHeight, borderBottom: '1px solid hsl(var(--border) / 0.4)' }}
          >
            {/* Left: label (sticky) */}
            <div
              className="sticky left-0 z-10 flex items-center gap-2.5 px-3 flex-shrink-0 border-r"
              style={{
                width:          LEFT_W,
                background:     'linear-gradient(to right, color-mix(in srgb, #8b5cf6 12%, hsl(var(--card) / 0.98)), hsl(var(--card) / 0.97))',
                borderColor:    '#8b5cf630',
                backdropFilter: 'blur(12px)',
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: '#8b5cf615', border: '1px solid #8b5cf630' }}
              >
                <Clock className="w-3.5 h-3.5" style={{ color: '#8b5cf6' }} />
              </div>
              <div className="flex-1 min-w-0 overflow-hidden" style={{ zoom: fontScale }}>
                <p className="text-[12px] font-bold truncate leading-tight" style={{ color: '#8b5cf6' }}>
                  En espera
                </p>
                <p className="text-[10px] font-semibold" style={{ color: '#8b5cf680' }}>
                  {orphanedWaiting.length} sin asignar
                </p>
              </div>
            </div>

            {/* Right: timeline */}
            <div
              className="relative flex-shrink-0"
              style={{ width: totalW, height: rowHeight }}
            >
              <div className="absolute inset-0 pointer-events-none" style={{ background: '#8b5cf606' }} />
              {hours.map((_, i) => (
                <div key={i} className="absolute top-0 bottom-0 border-l border-border/50" style={{ left: i * hourW }} />
              ))}
              {hours.map((_, i) => (
                <div key={`h${i}`} className="absolute top-0 bottom-0 border-l border-border/25 border-dashed" style={{ left: i * hourW + hourW / 2 }} />
              ))}

              {orphanedWaiting.map(appt => {
                const start     = parseISO(appt.start_datetime);
                const startMins = start.getHours() * 60 + start.getMinutes() - hourStart * 60;
                const leftPx    = (startMins / 60) * hourW;
                const widthPx   = Math.max((appt.duration_minutes / 60) * hourW, 38);
                if (leftPx > totalW || leftPx + widthPx < 0) return null;
                const startLabel = format(start, 'HH:mm');
                const endLabel   = format(addMinutes(start, appt.duration_minutes), 'HH:mm');
                return (
                  <motion.div
                    key={appt.id}
                    initial={{ opacity: 0, scaleX: 0.92 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    whileHover={{ scaleY: 1.06, transition: { duration: 0.1 } }}
                    className="absolute cursor-pointer z-10 overflow-hidden"
                    style={{
                      left:         leftPx + 2,
                      width:        widthPx - 4,
                      top:          6,
                      bottom:       6,
                      background:   'repeating-linear-gradient(45deg,#8b5cf622,#8b5cf622 5px,#8b5cf608 5px,#8b5cf608 13px)',
                      border:       '1.5px dashed #8b5cf680',
                      borderRadius: 10,
                    }}
                    onClick={e => { e.stopPropagation(); onAppointmentClick(appt); }}
                  >
                    <div className="px-2 h-full flex flex-col justify-center gap-0.5 overflow-hidden" style={{ zoom: fontScale }}>
                      <p className="text-[10px] font-bold leading-tight truncate" style={{ color: '#8b5cf6bb' }}>
                        {appt.service_type}
                      </p>
                      {widthPx > 64 && (
                        <p className="text-[9px] text-foreground/70 truncate font-medium">{appt.client_name}</p>
                      )}
                      {widthPx > 108 && (
                        <p className="text-[9px] text-muted-foreground/55 tabular-nums">{startLabel}–{endLabel}</p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────────────────────────
interface WeekViewProps {
  technicians: Technician[];
  weekDays: Date[];
  appointments: Appointment[];
  onDayClick: (day: Date) => void;
  onAppointmentClick: (a: Appointment) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  fontScale: number;
}

function WeekView({ technicians, weekDays, appointments, onDayClick, onAppointmentClick, onPrevWeek, onNextWeek, fontScale }: WeekViewProps) {
  const byDay = useMemo(() => {
    const m: Record<string, Appointment[]> = {};
    for (const a of appointments) {
      const k = format(parseISO(a.start_datetime), 'yyyy-MM-dd');
      (m[k] ||= []).push(a);
    }
    return m;
  }, [appointments]);

  return (
    <div className="h-full flex items-stretch gap-1">
      {/* Prev week arrow */}
      <button
        onClick={onPrevWeek}
        className="w-7 flex-shrink-0 rounded-xl hover:bg-muted/60 flex items-center justify-center transition-colors text-muted-foreground/50 hover:text-foreground self-stretch"
        title="Semana anterior"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      <div className="flex-1 overflow-hidden grid grid-cols-7 gap-2">
      {weekDays.map(day => {
        const k        = format(day, 'yyyy-MM-dd');
        const dayAppts = (byDay[k] || []).sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
        const todayDay = isToday(day);

        return (
          <div
            key={k}
            className="flex flex-col min-h-0 overflow-hidden rounded-2xl border transition-all duration-200"
            style={{
              borderColor: todayDay ? 'hsl(var(--primary) / 0.35)' : 'hsl(var(--border) / 0.5)',
              background:  todayDay
                ? 'hsl(var(--primary) / 0.05)'
                : 'hsl(var(--card) / 0.5)',
            }}
          >
            <button
              onClick={() => onDayClick(day)}
              className="flex flex-col items-center py-3 px-1 flex-shrink-0 hover:brightness-95 dark:hover:brightness-110 transition-all border-b border-border/50"
            >
              <span className={`text-[9px] font-bold uppercase tracking-widest ${
                todayDay ? 'text-primary' : 'text-muted-foreground/50'
              }`}>
                {format(day, 'EEE', { locale: es }).slice(0, 3)}
              </span>
              <span className={`text-xl font-black leading-tight mt-0.5 ${
                todayDay ? 'text-primary' : 'text-foreground'
              }`}>
                {format(day, 'd')}
              </span>
              {dayAppts.length > 0 ? (
                <span
                  className="text-[9px] font-bold mt-1 px-1.5 py-0.5 rounded-full"
                  style={{
                    background: todayDay ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted) / 0.5)',
                    color:      todayDay ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {dayAppts.length}
                </span>
              ) : (
                <span className="text-[9px] text-muted-foreground/20 mt-1">—</span>
              )}
            </button>

            <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
              {dayAppts.map(appt => {
                const tech = technicians.find(t => t.id === appt.technician_id);
                return (
                  <motion.button
                    key={appt.id}
                    whileHover={{ scale: 1.02, x: 1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onAppointmentClick(appt)}
                    className="w-full text-left p-1.5 overflow-hidden"
                    style={{
                      background:   `color-mix(in srgb, ${tech?.color || '#6366f1'} 15%, hsl(var(--card)))`,
                      border:       `1px solid color-mix(in srgb, ${tech?.color || '#6366f1'} 30%, transparent)`,
                      borderLeft:   `2px solid ${tech?.color || '#6366f1'}`,
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ zoom: fontScale }}>
                      <div className="flex items-center gap-1 justify-between">
                        <p className="text-[9px] font-extrabold tabular-nums" style={{ color: tech?.color }}>
                          {format(parseISO(appt.start_datetime), 'HH:mm')}
                        </p>
                        <div
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: STATUS_BADGE_COLORS[appt.status] }}
                          title={STATUS_LABELS[appt.status]}
                        />
                      </div>
                      <p className="text-[9px] text-foreground/70 truncate mt-0.5 font-medium leading-tight">
                        {appt.service_type}
                      </p>
                      <p className="text-[8px] text-muted-foreground/55 truncate">{appt.client_name}</p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>

      {/* Next week arrow */}
      <button
        onClick={onNextWeek}
        className="w-7 flex-shrink-0 rounded-xl hover:bg-muted/60 flex items-center justify-center transition-colors text-muted-foreground/50 hover:text-foreground self-stretch"
        title="Semana siguiente"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── List View ─────────────────────────────────────────────────────────────────
interface ListViewProps {
  technicians: Technician[];
  appointments: Appointment[];
  onAppointmentClick: (a: Appointment) => void;
  fontScale: number;
}

function ListView({ technicians, appointments, onAppointmentClick, fontScale }: ListViewProps) {
  const today = format(new Date(), 'yyyy-MM-dd');

  const grouped = useMemo(() => {
    const m: Record<string, Appointment[]> = {};
    const upcoming = appointments
      .filter(a => a.start_datetime.slice(0, 10) >= today)
      .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
    for (const a of upcoming) {
      const k = a.start_datetime.slice(0, 10);
      (m[k] ||= []).push(a);
    }
    return m;
  }, [appointments, today]);

  const entries = Object.entries(grouped);

  if (entries.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center">
          <CalendarDays className="w-7 h-7 text-primary/25" />
        </div>
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Sin citas próximas</p>
          <p className="text-[11px] text-muted-foreground/50 mt-0.5">Las citas agendadas aparecerán aquí</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pr-0.5">
      {entries.map(([date, appts], gi) => {
        const isToday_ = date === today;
        return (
          <motion.div
            key={date}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: gi * 0.05 }}
          >
            {/* Date heading */}
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex-shrink-0 w-10 h-10 rounded-xl flex flex-col items-center justify-center border"
                style={{
                  background:  isToday_ ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--muted) / 0.3)',
                  borderColor: isToday_ ? 'hsl(var(--primary) / 0.3)'  : 'hsl(var(--border) / 0.5)',
                }}
              >
                <span className={`text-[8px] font-bold uppercase leading-none ${isToday_ ? 'text-primary' : 'text-muted-foreground/50'}`}>
                  {format(parseISO(date), 'EEE', { locale: es }).slice(0, 3)}
                </span>
                <span className={`text-base font-black leading-none mt-0.5 ${isToday_ ? 'text-primary' : 'text-foreground'}`}>
                  {format(parseISO(date), 'd')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[11px] font-bold capitalize ${isToday_ ? 'text-primary' : 'text-foreground/70'}`}>
                  {isToday_ ? 'Hoy' : format(parseISO(date), "d 'de' MMMM", { locale: es })}
                </p>
                <p className="text-[10px] text-muted-foreground/50">
                  {appts.length} cita{appts.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex-1 h-px bg-border/30" />
            </div>

            {/* Rows */}
            <div className="space-y-2 ml-2">
              {appts.map((appt, i) => {
                const tech  = technicians.find(t => t.id === appt.technician_id);
                const start = parseISO(appt.start_datetime);
                const end   = addMinutes(start, appt.duration_minutes);
                return (
                  <motion.button
                    key={appt.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    whileHover={{ x: 3, transition: { duration: 0.12 } }}
                    onClick={() => onAppointmentClick(appt)}
                    className="w-full flex items-center gap-3 p-3 text-left overflow-hidden transition-all"
                    style={{
                      background:   tech
                        ? `color-mix(in srgb, ${tech.color} 10%, hsl(var(--card)))`
                        : 'hsl(var(--card))',
                      border:       `1px solid ${tech ? `color-mix(in srgb, ${tech.color} 25%, transparent)` : 'hsl(var(--border) / 0.4)'}`,
                      borderLeft:   `3px solid ${tech?.color || 'hsl(var(--border))'}`,
                      borderRadius: '12px',
                    }}
                  >
                    {tech
                      ? <TechAvatar tech={tech} size="sm" />
                      : <div className="w-7 h-7 rounded-full bg-muted/50 flex-shrink-0" />
                    }
                    <div className="flex-1 min-w-0 overflow-hidden" style={{ zoom: fontScale }}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-[12px] font-bold truncate">{appt.service_type}</p>
                        <span
                          className="flex-shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{
                            background: `${STATUS_BADGE_COLORS[appt.status]}20`,
                            color:       STATUS_BADGE_COLORS[appt.status],
                            border:      `1px solid ${STATUS_BADGE_COLORS[appt.status]}40`,
                          }}
                        >
                          {STATUS_LABELS[appt.status]}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/70 truncate">{appt.client_name}</p>
                      {appt.client_address && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin className="w-2.5 h-2.5 text-muted-foreground/40 flex-shrink-0" />
                          <p className="text-[10px] text-muted-foreground/50 truncate">{appt.client_address}</p>
                        </div>
                      )}
                    </div>
                    <div
                      className="flex-shrink-0 text-right px-2.5 py-1.5 rounded-xl border"
                      style={{
                        background:  tech ? `color-mix(in srgb, ${tech.color} 12%, hsl(var(--card)))` : 'hsl(var(--muted) / 0.3)',
                        borderColor: tech ? `color-mix(in srgb, ${tech.color} 25%, transparent)` : 'hsl(var(--border) / 0.4)',
                        zoom:        fontScale,
                      }}
                    >
                      <p className="text-[13px] font-black tabular-nums leading-none" style={{ color: tech?.color }}>
                        {format(start, 'HH:mm')}
                      </p>
                      <p className="text-[10px] text-muted-foreground/55 tabular-nums mt-0.5">
                        {format(end, 'HH:mm')}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AppointmentCalendar({
  technicians, appointments, selectedDate, onDateChange, onAppointmentClick, onSlotClick,
  baseHourStart, baseHourEnd, fontScale = 1.0,
}: Props) {
  const [calView, setCalView] = useState<CalView>('day');

  const weekDays    = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const activeTechs = useMemo(() => technicians.filter(t => t.is_active), [technicians]);
  const dayStr      = format(selectedDate, 'yyyy-MM-dd');

  const byDay = useMemo(() => {
    const m: Record<string, Appointment[]> = {};
    for (const a of appointments) {
      const k = format(parseISO(a.start_datetime), 'yyyy-MM-dd');
      (m[k] ||= []).push(a);
    }
    return m;
  }, [appointments]);

  const dayAppts = useMemo(() =>
    appointments.filter(a => format(parseISO(a.start_datetime), 'yyyy-MM-dd') === dayStr),
  [appointments, dayStr]);

  const byTech = useMemo(() => {
    const m: Record<string, Appointment[]> = {};
    for (const t of activeTechs) m[t.id] = dayAppts.filter(a => a.technician_id === t.id);
    return m;
  }, [dayAppts, activeTechs]);

  // Orphaned "en_espera" appointments with no technician assigned
  const orphanedWaiting = useMemo(
    () => dayAppts.filter(a => (!a.technician_id || a.technician_id === '') && a.status === 'en_espera'),
    [dayAppts],
  );

  // ── Dynamic visible hour range based on tech schedules + appointments ──
  const { hourStart, hourEnd } = useMemo(() => {
    let start = baseHourStart ?? DEFAULT_START;
    let end   = baseHourEnd   ?? DEFAULT_END;
    for (const a of dayAppts) {
      const s  = parseISO(a.start_datetime);
      const e  = addMinutes(s, a.duration_minutes);
      start = Math.min(start, s.getHours());
      end   = Math.max(end, e.getHours() + (e.getMinutes() > 0 ? 1 : 0));
    }
    return {
      hourStart: Math.max(0, start),
      hourEnd:   Math.min(24, end),
    };
  }, [dayAppts, baseHourStart, baseHourEnd]);

  const hours       = useMemo(
    () => Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i),
    [hourStart, hourEnd],
  );
  const totalHeight = (hourEnd - hourStart) * HOUR_HEIGHT;

  const step = calView === 'day' ? 1 : 7;

  const navLabel = calView === 'day'
    ? format(selectedDate, "EEEE d 'de' MMMM", { locale: es })
    : calView === 'week'
    ? `${format(weekDays[0], "d MMM", { locale: es })} — ${format(weekDays[6], "d MMM yyyy", { locale: es })}`
    : 'Próximas citas';

  return (
    <div className="flex flex-col gap-2">

      {/* ── Navigation bar ── */}
      <div className="flex items-center gap-1.5 shrink-0 px-2 py-1.5 rounded-2xl bg-muted/30 border border-border/40">
        <button
          onClick={() => onDateChange(addDays(selectedDate, -step))}
          disabled={calView === 'list'}
          className="w-8 h-8 rounded-xl hover:bg-muted/60 flex items-center justify-center transition-colors disabled:opacity-25 text-foreground/70 hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDateChange(new Date())}
          disabled={calView === 'list'}
          className="text-[10px] font-extrabold text-primary hover:bg-primary/10 px-2.5 py-1 rounded-lg transition-colors uppercase tracking-widest disabled:opacity-25"
        >
          Hoy
        </button>
        <button
          onClick={() => onDateChange(addDays(selectedDate, step))}
          disabled={calView === 'list'}
          className="w-8 h-8 rounded-xl hover:bg-muted/60 flex items-center justify-center transition-colors disabled:opacity-25 text-foreground/70 hover:text-foreground"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <p className="flex-1 text-[11px] font-bold text-center capitalize truncate text-foreground/60">
          {navLabel}
        </p>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted/50 border border-border/40 shrink-0">
          {([
            { v: 'day'  as CalView, Icon: CalendarDays, label: 'Día'    },
            { v: 'week' as CalView, Icon: Grid3x3,      label: 'Semana' },
            { v: 'list' as CalView, Icon: LayoutList,   label: 'Lista'  },
          ]).map(({ v, Icon, label }) => (
            <button
              key={v}
              onClick={() => setCalView(v)}
              title={label}
              className={`px-2 py-1.5 rounded-lg flex items-center gap-1 text-[10px] font-bold transition-all duration-150 ${
                calView === v
                  ? 'bg-card text-primary shadow-sm border border-border/40'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Week strip (Day view only) ── */}
      {calView === 'day' && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onDateChange(addDays(selectedDate, -7))}
            className="w-7 h-7 rounded-lg hover:bg-muted/60 flex items-center justify-center transition-colors text-muted-foreground/50 hover:text-foreground flex-shrink-0"
            title="Semana anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1 grid grid-cols-7 gap-1">
            {weekDays.map(day => {
              const k      = format(day, 'yyyy-MM-dd');
              const dots   = byDay[k] || [];
              const sel    = isSameDay(day, selectedDate);
              const today_ = isToday(day);
              return (
                <button
                  key={k}
                  onClick={() => onDateChange(day)}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all duration-150 border ${
                    sel
                      ? 'bg-primary border-primary shadow-lg shadow-primary/25 text-primary-foreground'
                      : today_
                      ? 'bg-primary/8 border-primary/25 text-primary'
                      : 'border-transparent hover:bg-muted/40 hover:border-border/40 text-foreground/70'
                  }`}
                >
                  <span className={`text-[9px] font-bold uppercase tracking-wide ${
                    sel ? 'opacity-70' : today_ ? 'text-primary/70' : 'text-muted-foreground/60'
                  }`}>
                    {format(day, 'EEE', { locale: es }).slice(0, 3)}
                  </span>
                  <span className={`text-sm font-black leading-none ${
                    sel ? '' : today_ ? 'text-primary' : ''
                  }`}>
                    {format(day, 'd')}
                  </span>
                  {dots.length > 0 && (
                    <div className="flex gap-0.5 flex-wrap justify-center max-w-[28px] mt-0.5">
                      {dots.slice(0, 4).map(a => {
                        const tech = technicians.find(t => t.id === a.technician_id);
                        return (
                          <div
                            key={a.id}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: sel ? 'rgba(255,255,255,0.6)' : tech?.color || '#6366f1' }}
                          />
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => onDateChange(addDays(selectedDate, 7))}
            className="w-7 h-7 rounded-lg hover:bg-muted/60 flex items-center justify-center transition-colors text-muted-foreground/50 hover:text-foreground flex-shrink-0"
            title="Semana siguiente"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── View content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={calView}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="flex-shrink-0 pb-4"
        >
          {calView === 'day' && activeTechs.length === 0 && (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground/40">
              Sin técnicos activos
            </div>
          )}
          {calView === 'day' && activeTechs.length > 0 && (
            <DayView
              activeTechs={activeTechs}
              allTechs={technicians}
              byTech={byTech}
              dayStr={dayStr}
              selectedDate={selectedDate}
              onAppointmentClick={onAppointmentClick}
              onSlotClick={onSlotClick}
              hourStart={hourStart}
              hours={hours}
              totalHeight={totalHeight}
              orphanedWaiting={orphanedWaiting}
              fontScale={fontScale}
            />
          )}
          {calView === 'week' && (
            <WeekView
              technicians={technicians}
              weekDays={weekDays}
              appointments={appointments}
              onDayClick={day => { onDateChange(day); setCalView('day'); }}
              onAppointmentClick={onAppointmentClick}
              onPrevWeek={() => onDateChange(addDays(selectedDate, -7))}
              onNextWeek={() => onDateChange(addDays(selectedDate,  7))}
              fontScale={fontScale}
            />
          )}
          {calView === 'list' && (
            <ListView
              technicians={technicians}
              appointments={appointments}
              onAppointmentClick={onAppointmentClick}
              fontScale={fontScale}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
