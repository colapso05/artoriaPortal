import { useMemo, useState } from "react";
import {
  format, addDays, startOfWeek, isSameDay, isToday,
  parseISO, addMinutes,
} from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, CalendarDays, LayoutList, Grid3x3, MapPin,
} from "lucide-react";
import { type Technician, type Appointment } from "./types";
import TechAvatar from "./TechAvatar";

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

// ── Day View ──────────────────────────────────────────────────────────────────
interface DayViewProps {
  activeTechs: Technician[];
  allTechs: Technician[];
  byTech: Record<string, Appointment[]>;
  dayStr: string;
  selectedDate: Date;
  onAppointmentClick: (a: Appointment) => void;
  onSlotClick: (e: React.MouseEvent<HTMLDivElement>, techId: string) => void;
  hourStart: number;
  hours: number[];
  totalHeight: number;
}

function DayView({ activeTechs, byTech, selectedDate, onAppointmentClick, onSlotClick, hourStart, hours, totalHeight }: DayViewProps) {
  return (
    <div className="h-full overflow-y-auto overflow-x-auto rounded-2xl border border-border/60 bg-card/60">
      <div className="flex gap-0" style={{ minHeight: totalHeight + 76, minWidth: activeTechs.length * 140 }}>

        {/* ── Time ruler ── */}
        <div className="flex-shrink-0 w-16 pt-[76px] select-none border-r border-border/50 bg-muted/10">
          {hours.map(h => {
            const isCurrentHour = h === new Date().getHours() && isToday(selectedDate);
            return (
              <div
                key={h}
                className="relative flex items-start justify-end pr-3"
                style={{ height: HOUR_HEIGHT }}
              >

                <span className={`text-[10px] font-bold leading-none -mt-[5px] ${
                  isCurrentHour ? 'text-red-500' : 'text-muted-foreground/50'
                }`}>
                  {fmtHour(h)}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Technician columns ── */}
        {activeTechs.map((tech, colIdx) => {
          const techAppts = byTech[tech.id] || [];
          return (
            <div
              key={tech.id}
              className="flex-1 min-w-[140px] flex flex-col border-l border-border/50 first:border-l-0"
            >
              {/* ── Column header ── */}
              <div
                className="h-[76px] flex flex-col items-center justify-center gap-1.5 sticky top-0 z-10 border-b border-border/50 px-3 backdrop-blur-sm"
                style={{
                  background: `linear-gradient(180deg, color-mix(in srgb, ${tech.color} 18%, hsl(var(--card))) 0%, hsl(var(--card)) 100%)`,
                }}
              >
                <TechAvatar tech={tech} size="sm" />
                <div className="text-center leading-none">
                  <p className="text-[11px] font-bold truncate max-w-[110px]">{tech.name}</p>
                  <p
                    className="text-[9px] font-semibold mt-0.5"
                    style={{ color: techAppts.length > 0 ? tech.color : undefined }}
                  >
                    {techAppts.length > 0
                      ? `${techAppts.length} cita${techAppts.length > 1 ? 's' : ''}`
                      : <span className="text-muted-foreground/40">disponible</span>}
                  </p>
                </div>
              </div>

              {/* ── Time grid ── */}
              <div
                className="relative cursor-crosshair select-none"
                style={{ height: totalHeight }}
                onClick={e => onSlotClick(e, tech.id)}
              >
                {/* Subtle column tint */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-30"
                  style={{ background: `${tech.color}08` }}
                />

                {/* ── Hour grid lines (full) ── */}
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-border/70"
                    style={{ top: (h - hourStart) * HOUR_HEIGHT }}
                  />
                ))}

                {/* ── Half-hour grid lines (dashed) ── */}
                {hours.map(h => (
                  <div
                    key={`${h}h`}
                    className="absolute left-6 right-0 border-t border-border/40 border-dashed"
                    style={{ top: (h - hourStart) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {/* Hover hint */}
                <div
                  className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: `${tech.color}07` }}
                />

                {/* ── Current time indicator ── */}
                {isToday(selectedDate) && (() => {
                  const now  = new Date();
                  const mins = now.getHours() * 60 + now.getMinutes() - hourStart * 60;
                  if (mins < 0 || mins > totalHeight / HOUR_HEIGHT * 60) return null;
                  return (
                    <div
                      className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                      style={{ top: (mins / 60) * HOUR_HEIGHT }}
                    >
                      {colIdx === 0
                        ? <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_3px_rgba(239,68,68,0.4)] -ml-1.5 flex-shrink-0" />
                        : <div className="w-0 flex-shrink-0" />
                      }
                      <div
                        className="flex-1 h-[1.5px]"
                        style={{ background: colIdx === 0
                          ? 'linear-gradient(to right, #ef4444, rgba(239,68,68,0.1))'
                          : 'rgba(239,68,68,0.3)'
                        }}
                      />
                      {colIdx === 0 && (
                        <span className="absolute left-3 -top-4 text-[9px] font-extrabold text-red-500 tabular-nums bg-card/90 border border-red-500/20 px-1.5 py-0.5 rounded-md shadow-sm">
                          {format(now, 'HH:mm')}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* ── Appointment blocks ── */}
                {techAppts.map(appt => {
                  const { top, height } = apptPosition(appt, hourStart);
                  if (top < 0 || top > totalHeight) return null;
                  const startLabel = format(parseISO(appt.start_datetime), 'HH:mm');
                  const endLabel   = format(addMinutes(parseISO(appt.start_datetime), appt.duration_minutes), 'HH:mm');
                  return (
                    <motion.div
                      key={appt.id}
                      initial={{ opacity: 0, x: -4, scale: 0.97 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      whileHover={{ scale: 1.018, transition: { duration: 0.12 } }}
                      className="absolute left-1.5 right-1.5 cursor-pointer z-10 overflow-hidden"
                      style={{
                        top:          top + 2,
                        height:       height - 4,
                        background:   `color-mix(in srgb, ${tech.color} 22%, hsl(var(--card)))`,
                        border:       `1px solid color-mix(in srgb, ${tech.color} 40%, transparent)`,
                        borderLeft:   `3px solid ${tech.color}`,
                        borderRadius: '10px',
                        boxShadow:    `0 2px 12px color-mix(in srgb, ${tech.color} 20%, transparent)`,
                      }}
                      onClick={e => { e.stopPropagation(); onAppointmentClick(appt); }}
                    >
                      {/* Shine strip */}
                      <div
                        className="absolute top-0 left-0 right-0 h-px"
                        style={{ background: `linear-gradient(to right, ${tech.color}70, transparent)` }}
                      />
                      <div className="p-2 h-full flex flex-col justify-start gap-0.5">
                        <p className="text-[10px] font-bold leading-tight truncate" style={{ color: tech.color }}>
                          {appt.service_type}
                        </p>
                        {height > 42 && (
                          <p className="text-[9px] text-foreground/75 truncate font-medium">{appt.client_name}</p>
                        )}
                        {height > 58 && (
                          <p className="text-[9px] text-muted-foreground/60 tabular-nums">
                            {startLabel} — {endLabel}
                          </p>
                        )}
                        {height > 78 && appt.client_address && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <MapPin className="w-2 h-2 flex-shrink-0 opacity-50" style={{ color: tech.color }} />
                            <p className="text-[8px] text-muted-foreground/50 truncate">{appt.client_address}</p>
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
}

function WeekView({ technicians, weekDays, appointments, onDayClick, onAppointmentClick, onPrevWeek, onNextWeek }: WeekViewProps) {
  const byDay = useMemo(() => {
    const m: Record<string, Appointment[]> = {};
    for (const a of appointments) {
      const k = a.start_datetime.slice(0, 10);
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
                    <p className="text-[9px] font-extrabold tabular-nums" style={{ color: tech?.color }}>
                      {format(parseISO(appt.start_datetime), 'HH:mm')}
                    </p>
                    <p className="text-[9px] text-foreground/70 truncate mt-0.5 font-medium leading-tight">
                      {appt.service_type}
                    </p>
                    <p className="text-[8px] text-muted-foreground/55 truncate">{appt.client_name}</p>
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
}

function ListView({ technicians, appointments, onAppointmentClick }: ListViewProps) {
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
    <div className="h-full overflow-y-auto overflow-x-hidden space-y-6 pr-0.5">
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
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold truncate">{appt.service_type}</p>
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
}: Props) {
  const [calView, setCalView] = useState<CalView>('day');

  const weekDays    = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const activeTechs = useMemo(() => technicians.filter(t => t.is_active), [technicians]);
  const dayStr      = format(selectedDate, 'yyyy-MM-dd');

  const byDay = useMemo(() => {
    const m: Record<string, Appointment[]> = {};
    for (const a of appointments) {
      const k = a.start_datetime.slice(0, 10);
      (m[k] ||= []).push(a);
    }
    return m;
  }, [appointments]);

  const dayAppts = useMemo(() =>
    appointments.filter(a => a.start_datetime.startsWith(dayStr)),
  [appointments, dayStr]);

  const byTech = useMemo(() => {
    const m: Record<string, Appointment[]> = {};
    for (const t of activeTechs) m[t.id] = dayAppts.filter(a => a.technician_id === t.id);
    return m;
  }, [dayAppts, activeTechs]);

  // ── Dynamic visible hour range based on day's appointments ──
  const { hourStart, hourEnd } = useMemo(() => {
    let start = DEFAULT_START;
    let end   = DEFAULT_END;
    for (const a of dayAppts) {
      const s  = parseISO(a.start_datetime);
      const e  = addMinutes(s, a.duration_minutes);
      start = Math.min(start, s.getHours());
      end   = Math.max(end, e.getHours() + (e.getMinutes() > 0 ? 1 : 0));
    }
    return {
      hourStart: Math.max(0, start - 1),   // 1h buffer before first appt
      hourEnd:   Math.min(24, end + 1),    // 1h buffer after last appt
    };
  }, [dayAppts]);

  const hours       = useMemo(
    () => Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i),
    [hourStart, hourEnd],
  );
  const totalHeight = (hourEnd - hourStart) * HOUR_HEIGHT;

  function handleSlotClick(e: React.MouseEvent<HTMLDivElement>, techId: string) {
    const rect   = e.currentTarget.getBoundingClientRect();
    const y      = e.clientY - rect.top;
    const totalM = hourStart * 60 + (y / HOUR_HEIGHT) * 60;
    const h      = Math.floor(totalM / 60);
    const rawM   = Math.round((totalM % 60) / 15) * 15;
    const fh     = rawM >= 60 ? h + 1 : h;
    const fm     = rawM >= 60 ? rawM - 60 : rawM;
    const ts     = `${String(fh).padStart(2, '0')}:${String(fm).padStart(2, '0')}`;
    onSlotClick?.(dayStr, ts, techId);
  }

  const step = calView === 'day' ? 1 : 7;

  const navLabel = calView === 'day'
    ? format(selectedDate, "EEEE d 'de' MMMM", { locale: es })
    : calView === 'week'
    ? `${format(weekDays[0], "d MMM", { locale: es })} — ${format(weekDays[6], "d MMM yyyy", { locale: es })}`
    : 'Próximas citas';

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">

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
          className="flex-1 min-h-0"
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
              onSlotClick={handleSlotClick}
              hourStart={hourStart}
              hours={hours}
              totalHeight={totalHeight}
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
            />
          )}
          {calView === 'list' && (
            <ListView
              technicians={technicians}
              appointments={appointments}
              onAppointmentClick={onAppointmentClick}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
