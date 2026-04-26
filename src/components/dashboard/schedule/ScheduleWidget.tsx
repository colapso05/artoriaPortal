import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Calendar, ArrowRight, Loader2, CalendarCheck,
  Clock, MapPin,
} from "lucide-react";
import { format, parseISO, isToday, startOfWeek, endOfWeek, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { motion } from "framer-motion";
import TechAvatar from "./TechAvatar";
import { STATUS_LABELS } from "./types";
import type { Technician } from "./types";

interface Props {
  companyId: string;
  onNavigate: () => void;
  cardVariants?: any;
  animationIndex?: number;
}

interface ApptRow {
  id: string;
  start_datetime: string;
  duration_minutes: number;
  client_name: string;
  client_address?: string;
  service_type: string;
  status: string;
  technician_id: string;
  tech?: Pick<Technician, 'id' | 'name' | 'color' | 'photo_url'>;
}

const ACCENT = "#6366f1";

const STATUS_DOT: Record<string, string> = {
  pendiente:  'bg-amber-400',
  en_camino:  'bg-blue-400',
  completado: 'bg-emerald-500',
  cancelado:  'bg-muted-foreground/30',
};

export default function ScheduleWidget({ companyId, onNavigate, cardVariants, animationIndex = 8 }: Props) {
  const [loading,      setLoading]      = useState(true);
  const [todayCount,   setTodayCount]   = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [weekCount,    setWeekCount]    = useState(0);
  const [upcoming,     setUpcoming]     = useState<ApptRow[]>([]);

  useEffect(() => { load(); }, [companyId]);

  async function load() {
    setLoading(true);
    const now        = new Date();
    const todayStr   = format(now, 'yyyy-MM-dd');
    const weekStart  = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd    = format(endOfWeek(now,   { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const rangeEnd   = format(addDays(now, 30), 'yyyy-MM-dd');

    const [{ data: appointments }, { data: technicians }] = await Promise.all([
      (supabase as any)
        .from('appointments')
        .select('id, start_datetime, duration_minutes, client_name, client_address, service_type, status, technician_id')
        .eq('company_id', companyId)
        .neq('status', 'cancelado')
        .gte('start_datetime', `${todayStr}T00:00:00`)
        .lte('start_datetime', `${rangeEnd}T23:59:59`)
        .order('start_datetime'),
      (supabase as any)
        .from('technicians')
        .select('id, name, color, photo_url')
        .eq('company_id', companyId),
    ]);

    const techMap: Record<string, Pick<Technician, 'id' | 'name' | 'color' | 'photo_url'>> = {};
    for (const t of (technicians || [])) techMap[t.id] = t;

    const appts: ApptRow[] = (appointments || []).map((a: any) => ({
      ...a,
      tech: techMap[a.technician_id],
    }));

    setTodayCount(appts.filter(a => a.start_datetime.startsWith(todayStr)).length);
    setPendingCount(appts.filter(a => a.status === 'pendiente').length);
    setWeekCount(appts.filter(a => {
      const d = a.start_datetime.slice(0, 10);
      return d >= weekStart && d <= weekEnd;
    }).length);
    setUpcoming(appts.slice(0, 4));
    setLoading(false);
  }

  const card = (
    <Card
      onClick={onNavigate}
      className="border bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-lg transition-all duration-300 group rounded-2xl overflow-hidden cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
      style={{
        borderColor: `${ACCENT}35`,
        background:  `linear-gradient(135deg, ${ACCENT}12 0%, ${ACCENT}04 60%, transparent 100%)`,
      }}
    >
      <CardContent className="p-5 space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300"
              style={{ background: `${ACCENT}18` }}
            >
              <Calendar className="w-4.5 h-4.5" style={{ color: ACCENT }} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-foreground/80">Agenda</p>
              <p className="text-[10px] text-muted-foreground/50 leading-none mt-0.5">Visitas técnicas</p>
            </div>
          </div>
          <ArrowRight
            className="w-4 h-4 text-muted-foreground/25 group-hover:text-primary group-hover:translate-x-1 transition-all"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin opacity-25" />
          </div>
        ) : (
          <>
            {/* ── Stats row ── */}
            <div
              className="grid grid-cols-3 gap-0 rounded-xl overflow-hidden border"
              style={{ borderColor: `${ACCENT}20` }}
            >
              {[
                { value: todayCount,   label: 'Hoy',          color: ACCENT },
                { value: pendingCount, label: 'Pendientes',   color: '#f59e0b' },
                { value: weekCount,    label: 'Esta semana',  color: 'hsl(var(--foreground))' },
              ].map(({ value, label, color }, i) => (
                <div
                  key={label}
                  className={`flex flex-col items-center justify-center py-3 ${i < 2 ? 'border-r' : ''}`}
                  style={{ borderColor: `${ACCENT}20` }}
                >
                  <span className="text-2xl font-black font-display leading-none" style={{ color }}>
                    {value}
                  </span>
                  <span className="text-[9px] text-muted-foreground/50 font-semibold uppercase tracking-wider mt-1">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Upcoming list ── */}
            {upcoming.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground/30">
                <CalendarCheck className="w-4 h-4" />
                <span className="text-xs">Sin citas próximas</span>
              </div>
            ) : (
              <div className="space-y-1">
                {upcoming.map(a => {
                  const dt         = parseISO(a.start_datetime);
                  const apptToday  = isToday(dt);
                  const fakeTech   = a.tech
                    ? { ...a.tech, company_id: '', is_active: true, created_at: '' } as Technician
                    : null;
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-background/50 transition-colors"
                    >
                      {/* Tech avatar */}
                      {fakeTech
                        ? <TechAvatar tech={fakeTech} size="xs" className="flex-shrink-0" />
                        : <div className="w-5 h-5 rounded-full bg-muted/30 flex-shrink-0" />
                      }

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold leading-tight truncate">{a.service_type}</p>
                        <p className="text-[10px] text-muted-foreground/55 truncate leading-tight">
                          {a.client_name}
                          {a.tech && <span className="text-muted-foreground/35"> · {a.tech.name}</span>}
                        </p>
                      </div>

                      {/* Time + date */}
                      <div className="flex-shrink-0 text-right">
                        <p
                          className="text-[11px] font-extrabold tabular-nums leading-none"
                          style={{ color: a.tech?.color || ACCENT }}
                        >
                          {format(dt, 'HH:mm')}
                        </p>
                        <p className="text-[9px] text-muted-foreground/40 mt-0.5 leading-none">
                          {apptToday ? 'Hoy' : format(dt, "d MMM", { locale: es })}
                        </p>
                      </div>

                      {/* Status dot */}
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[a.status] || 'bg-muted/30'}`} />
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/35 font-medium group-hover:text-primary/60 transition-colors">
              Ver agenda completa →
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );

  if (cardVariants) {
    return (
      <motion.div
        custom={animationIndex}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
      >
        {card}
      </motion.div>
    );
  }
  return card;
}
