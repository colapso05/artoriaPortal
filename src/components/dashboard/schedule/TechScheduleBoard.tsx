import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2, CalendarX, Save, Check, PowerOff, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { type Technician, DAY_SHORT } from "./types";
import TechAvatar from "./TechAvatar";

interface Props {
  companyId: string;
  technicians: Technician[];
  onScheduleChanged?: () => void;
  onCreateTech?: () => void;
}

// Mon-first display order
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];

const DEFAULT_DAY = (d: number) => ({
  day_of_week: d,
  start_time:  '08:00',
  end_time:    '17:00',
  is_day_off:  d === 0 || d === 6,
});

interface DayRow {
  technician_id: string;
  day_of_week:   number;
  start_time:    string;
  end_time:      string;
  is_day_off:    boolean;
}

interface TechData {
  schedules: DayRow[];
  dirty:     boolean;
  saving:    boolean;
}

export default function TechScheduleBoard({ companyId, technicians, onScheduleChanged, onCreateTech }: Props) {
  const { toast } = useToast();
  const [data,        setData]       = useState<Record<string, TechData>>({});
  const [exceptions,  setExceptions] = useState<any[]>([]);
  const [loadingExc,  setLoadingExc] = useState(false);

  // New exception form
  const [excTechId, setExcTechId] = useState('');
  const [excDate,   setExcDate]   = useState('');
  const [excReason, setExcReason] = useState('');
  const [addingExc, setAddingExc] = useState(false);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteHasAppts, setDeleteHasAppts] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const activeTechs = technicians.filter(t => t.is_active);

  useEffect(() => {
    if (technicians.length > 0) {
      loadSchedules();
      loadExceptions();
    }
  }, [technicians]);

  async function loadSchedules() {
    const ids = technicians.map(t => t.id);
    const { data: rows } = await (supabase as any)
      .from('technician_schedules')
      .select('technician_id, day_of_week, start_time, end_time, is_day_off')
      .in('technician_id', ids);

    const next: Record<string, TechData> = {};
    for (const tech of technicians) {
      const techRows = (rows || []).filter((r: any) => r.technician_id === tech.id);
      const schedules: DayRow[] = WEEK_DAYS.map(d => {
        const existing = techRows.find((r: any) => r.day_of_week === d);
        return existing
          ? {
              technician_id: tech.id,
              day_of_week:   d,
              start_time:    existing.start_time.slice(0, 5),
              end_time:      existing.end_time.slice(0, 5),
              is_day_off:    existing.is_day_off,
            }
          : { technician_id: tech.id, ...DEFAULT_DAY(d) };
      });
      next[tech.id] = { schedules, dirty: false, saving: false };
    }
    setData(next);
  }

  async function loadExceptions() {
    setLoadingExc(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    const ids   = technicians.map(t => t.id);
    const { data: rows } = await (supabase as any)
      .from('technician_exceptions')
      .select('*')
      .in('technician_id', ids)
      .gte('exception_date', today)
      .order('exception_date');
    setExceptions(rows || []);
    setLoadingExc(false);
  }

  function updateCell(techId: string, dow: number, field: keyof DayRow, value: any) {
    setData(prev => {
      const td = prev[techId];
      if (!td) return prev;
      return {
        ...prev,
        [techId]: {
          ...td,
          dirty:     true,
          schedules: td.schedules.map(s =>
            s.day_of_week === dow ? { ...s, [field]: value } : s
          ),
        },
      };
    });
  }

  async function saveTech(techId: string) {
    const td = data[techId];
    if (!td) return;
    setData(prev => ({ ...prev, [techId]: { ...prev[techId], saving: true } }));

    await (supabase as any).from('technician_schedules').delete().eq('technician_id', techId);
    const { error } = await (supabase as any).from('technician_schedules').insert(
      td.schedules.map(s => ({ ...s, technician_id: techId }))
    );

    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Jornada guardada' });
      onScheduleChanged?.();
    }
    setData(prev => ({ ...prev, [techId]: { ...prev[techId], saving: false, dirty: false } }));
  }

  async function toggleActive(t: Technician) {
    const newStatus = !t.is_active;
    await (supabase as any)
      .from('technicians')
      .update({ is_active: newStatus })
      .eq('id', t.id);
    toast({ title: newStatus ? 'Técnico activado' : 'Técnico desactivado' });
    onScheduleChanged?.();
  }

  async function startDelete(t: Technician) {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayISO = new Date(`${todayStr}T00:00:00`).toISOString();
    const { count } = await (supabase as any)
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('technician_id', t.id)
      .neq('status', 'cancelado')
      .gte('start_datetime', todayISO);
    setDeleteHasAppts((count ?? 0) > 0);
    setConfirmDeleteId(t.id);
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await (supabase as any).from('technician_schedules').delete().eq('technician_id', confirmDeleteId);
      await (supabase as any).from('technician_exceptions').delete().eq('technician_id', confirmDeleteId);
      await (supabase as any).from('appointments').delete().eq('technician_id', confirmDeleteId);
      const { error } = await (supabase as any).from('technicians').delete().eq('id', confirmDeleteId);
      if (error) throw error;
      toast({ title: 'Técnico eliminado' });
      setConfirmDeleteId(null);
      onScheduleChanged?.();
    } catch (err: any) {
      toast({ title: 'Error al eliminar', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  async function addException() {
    if (!excTechId || !excDate) {
      toast({ title: 'Selecciona técnico y fecha', variant: 'destructive' });
      return;
    }
    setAddingExc(true);
    const { error } = await (supabase as any).from('technician_exceptions').insert({
      technician_id:  excTechId,
      exception_date: excDate,
      is_available:   false,
      reason:         excReason.trim() || null,
    });
    if (error) {
      toast({ title: 'Error al agregar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Ausencia registrada' });
      setExcTechId(''); setExcDate(''); setExcReason('');
      loadExceptions();
    }
    setAddingExc(false);
  }

  async function deleteException(id: string) {
    await (supabase as any).from('technician_exceptions').delete().eq('id', id);
    setExceptions(prev => prev.filter(e => e.id !== id));
  }

  if (technicians.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-sm text-muted-foreground/40">
        <p>Sin técnicos registrados</p>
        {onCreateTech && (
          <Button onClick={onCreateTech} variant="outline" size="sm" className="rounded-xl">
            <Plus className="w-4 h-4 mr-2" /> Nuevo Técnico
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Schedule grid ── */}
      <div>
        <div className="w-full">
          <div className="space-y-2 pr-1 pb-2">

            {/* Column headers */}
            <div className="flex items-center gap-1 px-3">
              <div className="flex-shrink-0" style={{ width: 168 }} />
              {WEEK_DAYS.map(d => (
                <div key={d} className="flex-1 text-center">
                  <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wide">
                    {DAY_SHORT[d]}
                  </span>
                </div>
              ))}
              <div className="flex-shrink-0" style={{ width: 60 }} />
            </div>

            {/* Tech rows */}
            {technicians.map(tech => {
              const td = data[tech.id];
              if (!td) return (
                <div key={tech.id} className="h-16 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/30" />
                </div>
              );

              return (
                <div key={tech.id} className="space-y-1">
                  <div
                    className={`flex items-center gap-1 px-3 py-2.5 rounded-2xl border transition-all ${
                      tech.is_active ? 'border-border/50 bg-card/60' : 'border-border/20 bg-muted/20 opacity-60 grayscale-[50%]'
                    }`}
                    style={{ borderLeft: `3px solid ${tech.is_active ? tech.color : 'hsl(var(--muted-foreground))'}` }}
                  >
                  {/* Tech info */}
                  <div className="flex items-center gap-2 flex-shrink-0" style={{ width: 168 }}>
                    <TechAvatar tech={tech} size="sm" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold truncate leading-tight flex items-center gap-1.5">
                        {tech.name}
                        {!tech.is_active && (
                          <span className="text-[9px] font-bold text-muted-foreground/80 uppercase tracking-widest bg-muted px-1.5 py-0.5 rounded-md">
                            Inactivo
                          </span>
                        )}
                      </p>
                      {td.dirty && (
                        <p className="text-[9px] text-amber-500 font-semibold">Sin guardar</p>
                      )}
                    </div>
                  </div>

                  {/* Day cells */}
                  {WEEK_DAYS.map(d => {
                    const s = td.schedules.find(s => s.day_of_week === d);
                    if (!s) return <div key={d} className="flex-1" />;
                    return (
                      <div key={d} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                        {/* Active/Libre toggle */}
                        <button
                          onClick={() => updateCell(tech.id, d, 'is_day_off', !s.is_day_off)}
                          className={`w-full px-0.5 py-1 rounded-lg text-[9px] font-bold transition-all border ${
                            s.is_day_off
                              ? 'bg-muted/20 text-muted-foreground/35 border-border/20 hover:border-border/50'
                              : 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/8 hover:bg-emerald-500/14'
                          }`}
                        >
                          {s.is_day_off ? 'Libre' : 'Activo'}
                        </button>

                        {/* Time inputs */}
                        {!s.is_day_off && (
                          <>
                            <input
                              type="time"
                              value={s.start_time}
                              onChange={e => updateCell(tech.id, d, 'start_time', e.target.value)}
                              className="w-full text-[9px] rounded-md border border-input bg-background px-0.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/30 text-center tabular-nums"
                            />
                            <input
                              type="time"
                              value={s.end_time}
                              onChange={e => updateCell(tech.id, d, 'end_time', e.target.value)}
                              className="w-full text-[9px] rounded-md border border-input bg-background px-0.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/30 text-center tabular-nums"
                            />
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Actions */}
                  <div className="flex-shrink-0 flex items-center justify-end gap-1" style={{ width: 130 }}>
                    <Button
                      size="sm"
                      onClick={() => saveTech(tech.id)}
                      disabled={!td.dirty || td.saving}
                      className={`h-8 flex-1 rounded-xl text-[10px] gap-1 transition-all px-1.5 ${
                        td.dirty ? '' : 'opacity-30 cursor-default'
                      }`}
                      variant={td.dirty ? 'default' : 'ghost'}
                    >
                      {td.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : td.dirty ? <Save className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                      <span className="hidden xl:inline">{td.saving ? '' : td.dirty ? 'Guardar' : 'OK'}</span>
                    </Button>
                    <button
                      onClick={() => toggleActive(tech)}
                      className={`w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center transition-colors ${
                        tech.is_active
                          ? 'hover:bg-amber-500/10 text-muted-foreground/50 hover:text-amber-500'
                          : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                      }`}
                      title={tech.is_active ? 'Desactivar técnico' : 'Activar técnico'}
                    >
                      <PowerOff className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => confirmDeleteId === tech.id ? setConfirmDeleteId(null) : startDelete(tech)}
                      className="w-8 h-8 flex-shrink-0 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-muted-foreground/40 hover:text-red-500 transition-colors"
                      title="Eliminar técnico"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* ── Inline confirmation ── */}
                <AnimatePresence>
                  {confirmDeleteId === tech.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden px-2"
                    >
                      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                        <div className="flex flex-col gap-1">
                          <p className="text-[12px] text-red-600 dark:text-red-400 font-medium leading-tight">
                            ¿Eliminar a <span className="font-bold">{tech.name}</span>? Esta acción no se deshace.
                          </p>
                          {deleteHasAppts && (
                            <p className="text-[10px] text-red-500/80 flex items-center gap-1 font-semibold">
                              <AlertTriangle className="w-3 h-3" /> Tiene citas pendientes (se eliminarán).
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)} disabled={deleting} className="h-8 rounded-lg text-[11px]">Cancelar</Button>
                          <Button size="sm" onClick={confirmDelete} disabled={deleting} className="h-8 rounded-lg text-[11px] bg-red-600 hover:bg-red-700 text-white gap-1.5">
                            {deleting && <Loader2 className="w-3 h-3 animate-spin" />} Eliminar
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              );
            })}

            {/* Nuevo técnico button */}
            {onCreateTech && (
              <Button
                onClick={onCreateTech}
                variant="outline"
                className="w-full mt-2 h-12 rounded-2xl border-dashed border-2 border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all gap-2"
              >
                <Plus className="w-4 h-4" /> Crear nuevo técnico
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Exceptions ── */}
      <div className="flex-shrink-0 space-y-3 border-t border-border/40 pt-4">
        <div className="flex items-center gap-2">
          <CalendarX className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <h3 className="text-[11px] font-bold text-foreground/60 uppercase tracking-widest">
            Ausencias / Excepciones próximas
          </h3>
        </div>

        {/* Add exception form */}
        <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/20 border border-border/40 flex-wrap">
          <Select value={excTechId} onValueChange={setExcTechId}>
            <SelectTrigger className="h-8 text-[11px] rounded-xl w-[140px] flex-shrink-0">
              <SelectValue placeholder="Técnico..." />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {activeTechs.map(t => (
                <SelectItem key={t.id} value={t.id} className="text-[11px]">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="date"
            value={excDate}
            min={format(new Date(), 'yyyy-MM-dd')}
            onChange={e => setExcDate(e.target.value)}
            className="h-8 text-[11px] rounded-xl border border-input bg-background px-2.5 focus:outline-none focus:ring-1 focus:ring-primary/30 w-[130px] flex-shrink-0"
          />
          <Input
            value={excReason}
            onChange={e => setExcReason(e.target.value)}
            placeholder="Motivo (opcional)..."
            className="h-8 text-[11px] rounded-xl flex-1 min-w-[120px]"
          />
          <Button
            size="sm"
            onClick={addException}
            disabled={addingExc || !excTechId || !excDate}
            className="h-8 rounded-xl gap-1.5 text-[11px] flex-shrink-0"
          >
            {addingExc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Agregar
          </Button>
        </div>

        {/* Exception chips */}
        {loadingExc ? (
          <div className="flex justify-center py-2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/30" />
          </div>
        ) : exceptions.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/35 text-center py-1">
            Sin ausencias registradas próximamente
          </p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {exceptions.map(exc => {
              const tech = technicians.find(t => t.id === exc.technician_id);
              return (
                <div
                  key={exc.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px]"
                  style={{
                    borderColor: `${tech?.color || '#6366f1'}30`,
                    background:  `color-mix(in srgb, ${tech?.color || '#6366f1'} 6%, hsl(var(--card)))`,
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: tech?.color || '#6366f1' }}
                  />
                  <span className="font-bold">{tech?.name || '—'}</span>
                  <span className="text-muted-foreground/60">
                    {format(parseISO(exc.exception_date), "d MMM", { locale: es })}
                  </span>
                  {exc.reason && (
                    <span className="text-muted-foreground/45 italic truncate max-w-[100px]">
                      {exc.reason}
                    </span>
                  )}
                  <button
                    onClick={() => deleteException(exc.id)}
                    className="w-5 h-5 rounded-md hover:bg-red-500/10 flex items-center justify-center text-muted-foreground/25 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
