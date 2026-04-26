import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, UserCog, Pencil, Power, PowerOff, ChevronLeft, Camera, X, Trash2, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { type Technician, type TechnicianSchedule, TECH_COLORS, DAY_NAMES } from "./types";
import TechAvatar from "./TechAvatar";

interface Props {
  companyId: string;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

type ScheduleRow = Omit<TechnicianSchedule, 'id' | 'technician_id'>;

const DEFAULT_SCHEDULE: ScheduleRow[] = [
  { day_of_week: 1, start_time: '08:00', end_time: '17:00', is_day_off: false },
  { day_of_week: 2, start_time: '08:00', end_time: '17:00', is_day_off: false },
  { day_of_week: 3, start_time: '08:00', end_time: '17:00', is_day_off: false },
  { day_of_week: 4, start_time: '08:00', end_time: '17:00', is_day_off: false },
  { day_of_week: 5, start_time: '08:00', end_time: '17:00', is_day_off: false },
  { day_of_week: 6, start_time: '08:00', end_time: '13:00', is_day_off: true  },
  { day_of_week: 0, start_time: '08:00', end_time: '13:00', is_day_off: true  },
];

export default function TechnicianManager({ companyId, open, onClose, onChanged }: Props) {
  const { toast } = useToast();
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading]         = useState(false);
  const [view, setView]               = useState<'list' | 'edit'>('list');
  const [editTech, setEditTech]       = useState<Technician | null>(null);
  const [schedules, setSchedules]     = useState<ScheduleRow[]>(DEFAULT_SCHEDULE);
  const [saving, setSaving]           = useState(false);

  // form fields
  const [name,     setName]     = useState('');
  const [color,    setColor]    = useState(TECH_COLORS[0]);
  const [phone,    setPhone]    = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // delete confirmation
  const [confirmDeleteId,  setConfirmDeleteId]  = useState<string | null>(null);
  const [deleteHasAppts,   setDeleteHasAppts]   = useState(false);
  const [deleting,         setDeleting]         = useState(false);

  useEffect(() => { if (open) loadTechnicians(); }, [open, companyId]);

  async function loadTechnicians() {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('technicians')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });
    setTechnicians(data || []);
    setLoading(false);
  }

  async function loadSchedule(techId: string) {
    const { data } = await (supabase as any)
      .from('technician_schedules')
      .select('*')
      .eq('technician_id', techId)
      .order('day_of_week');
    if (data && data.length > 0) {
      const mapped = DEFAULT_SCHEDULE.map(def => {
        const row = data.find((d: any) => d.day_of_week === def.day_of_week);
        return row
          ? { day_of_week: row.day_of_week, start_time: row.start_time, end_time: row.end_time, is_day_off: row.is_day_off }
          : def;
      });
      setSchedules(mapped);
    } else {
      setSchedules(DEFAULT_SCHEDULE);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext  = file.name.split('.').pop() || 'jpg';
    const path = `${companyId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('technician-photos')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (!error) {
      const { data } = supabase.storage.from('technician-photos').getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
    } else {
      toast({ title: 'Error al subir foto', description: error.message, variant: 'destructive' });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function openCreate() {
    setEditTech(null);
    setName('');
    setColor(TECH_COLORS[technicians.length % TECH_COLORS.length]);
    setPhone('');
    setPhotoUrl(null);
    setSchedules(DEFAULT_SCHEDULE);
    setView('edit');
  }

  async function openEdit(t: Technician) {
    setEditTech(t);
    setName(t.name);
    setColor(t.color);
    setPhone(t.phone || '');
    setPhotoUrl(t.photo_url || null);
    await loadSchedule(t.id);
    setView('edit');
  }

  async function toggleActive(t: Technician) {
    await (supabase as any)
      .from('technicians')
      .update({ is_active: !t.is_active })
      .eq('id', t.id);
    loadTechnicians();
    onChanged?.();
  }

  async function startDelete(t: Technician) {
    // Check for upcoming non-cancelled appointments
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await (supabase as any)
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('technician_id', t.id)
      .neq('status', 'cancelado')
      .gte('start_datetime', `${today}T00:00:00`);
    setDeleteHasAppts((count ?? 0) > 0);
    setConfirmDeleteId(t.id);
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      // 1. Eliminar jornada y excepciones
      await (supabase as any).from('technician_schedules').delete().eq('technician_id', confirmDeleteId);
      await (supabase as any).from('technician_exceptions').delete().eq('technician_id', confirmDeleteId);
      // 2. Eliminar citas (FK no permite NULL en technician_id)
      await (supabase as any).from('appointments').delete().eq('technician_id', confirmDeleteId);
      // 3. Eliminar técnico
      const { error } = await (supabase as any).from('technicians').delete().eq('id', confirmDeleteId);
      if (error) throw error;
      toast({ title: 'Técnico eliminado' });
      setConfirmDeleteId(null);
      loadTechnicians();
      onChanged?.();
    } catch (err: any) {
      toast({ title: 'Error al eliminar', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  async function save() {
    if (!name.trim()) {
      toast({ title: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }
    setSaving(true);
    let techId = editTech?.id;

    if (editTech) {
      await (supabase as any)
        .from('technicians')
        .update({ name: name.trim(), color, phone: phone || null, photo_url: photoUrl })
        .eq('id', techId);
    } else {
      const { data } = await (supabase as any)
        .from('technicians')
        .insert({
          company_id: companyId,
          name: name.trim(),
          color,
          phone: phone || null,
          photo_url: photoUrl,
          is_active: true,
        })
        .select()
        .single();
      techId = data?.id;
    }

    if (techId) {
      await (supabase as any).from('technician_schedules').delete().eq('technician_id', techId);
      await (supabase as any).from('technician_schedules').insert(
        schedules.map(s => ({ technician_id: techId, ...s }))
      );
    }

    toast({ title: editTech ? 'Técnico actualizado ✓' : 'Técnico creado ✓' });
    setSaving(false);
    setView('list');
    loadTechnicians();
    onChanged?.();
  }

  const updateSchedule = (idx: number, field: keyof ScheduleRow, val: any) =>
    setSchedules(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));

  const handleClose = () => { onClose(); setView('list'); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-card border-border shadow-2xl rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2.5">
            {view === 'edit' && (
              <button
                onClick={() => setView('list')}
                className="w-7 h-7 rounded-lg hover:bg-secondary/60 flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserCog className="w-3.5 h-3.5 text-primary" />
            </div>
            <DialogTitle className="text-sm font-bold">
              {view === 'list' ? 'Gestión de Técnicos' : editTech ? `Editar: ${editTech.name}` : 'Nuevo Técnico'}
            </DialogTitle>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[68vh]">
          <AnimatePresence mode="wait">

            {/* ── LIST ── */}
            {view === 'list' && (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
                className="p-5 space-y-3"
              >
                {loading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
                  </div>
                ) : technicians.length === 0 ? (
                  <div className="text-center py-12 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-muted/40 mx-auto flex items-center justify-center">
                      <UserCog className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">Sin técnicos aún</p>
                    <p className="text-xs text-muted-foreground/60">Crea el primer técnico para comenzar</p>
                  </div>
                ) : (
                  technicians.map(t => (
                    <motion.div
                      key={t.id}
                      layout
                      className="rounded-xl border border-border/60 bg-background overflow-hidden"
                    >
                      {/* ── Normal row ── */}
                      <div className="flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors">
                        <div
                          className="w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden"
                          style={{ boxShadow: `0 0 0 2px ${t.color}40` }}
                        >
                          {t.photo_url ? (
                            <img src={t.photo_url} alt={t.name} className="w-full h-full object-cover" />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-white text-[11px] font-bold"
                              style={{ background: t.color }}
                            >
                              {t.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-tight truncate">{t.name}</p>
                          {t.phone && <p className="text-[11px] text-muted-foreground">{t.phone}</p>}
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-2 ${t.is_active ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/5' : 'text-muted-foreground border-muted-foreground/20'}`}
                        >
                          {t.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                        <button
                          onClick={() => openEdit(t)}
                          className="w-7 h-7 rounded-lg hover:bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => toggleActive(t)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                            t.is_active
                              ? 'hover:bg-amber-500/10 text-muted-foreground hover:text-amber-500'
                              : 'hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-500'
                          }`}
                          title={t.is_active ? 'Desactivar' : 'Activar'}
                        >
                          {t.is_active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => confirmDeleteId === t.id ? setConfirmDeleteId(null) : startDelete(t)}
                          className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-muted-foreground/40 hover:text-red-500 transition-colors"
                          title="Eliminar técnico"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* ── Inline confirmation ── */}
                      <AnimatePresence>
                        {confirmDeleteId === t.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3 pt-0 space-y-2">
                              {deleteHasAppts && (
                                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                                  <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
                                    Este técnico tiene citas pendientes. Se desasignarán al eliminar.
                                  </p>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <p className="text-[11px] text-muted-foreground flex-1">
                                  ¿Eliminar a <span className="font-bold text-foreground">{t.name}</span>? Esta acción no se puede deshacer.
                                </p>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2.5 rounded-lg text-[11px]"
                                  onClick={() => setConfirmDeleteId(null)}
                                  disabled={deleting}
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 px-2.5 rounded-lg text-[11px] bg-red-500 hover:bg-red-600 text-white gap-1.5"
                                  onClick={confirmDelete}
                                  disabled={deleting}
                                >
                                  {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                                  Eliminar
                                </Button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))
                )}
                <Button onClick={openCreate} className="w-full gap-2 rounded-xl h-9 mt-1" variant="outline">
                  <Plus className="w-4 h-4" /> Nuevo Técnico
                </Button>
              </motion.div>
            )}

            {/* ── EDIT ── */}
            {view === 'edit' && (
              <motion.div
                key="edit"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.18 }}
                className="p-5 space-y-6"
              >
                {/* ── Foto + Nombre ── */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest">Información</h3>

                  {/* Photo picker */}
                  <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/40 border border-border/60">
                    {/* Avatar preview */}
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-16 h-16 rounded-2xl overflow-hidden"
                        style={{ boxShadow: `0 0 0 3px ${color}50` }}
                      >
                        {photoUrl ? (
                          <img src={photoUrl} alt="preview" className="w-full h-full object-cover" />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center text-white text-xl font-bold"
                            style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}
                          >
                            {name ? name.slice(0, 2).toUpperCase() : '??'}
                          </div>
                        )}
                      </div>
                      {uploading && (
                        <div className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/50">
                          <Loader2 className="w-5 h-5 animate-spin text-white" />
                        </div>
                      )}
                    </div>

                    {/* Upload controls */}
                    <div className="flex-1 space-y-2">
                      <p className="text-[11px] font-medium text-foreground">Foto de perfil</p>
                      <p className="text-[10px] text-muted-foreground/60">Opcional · JPG, PNG, WebP</p>
                      <div className="flex gap-2">
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handlePhotoUpload}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-xl text-[11px] gap-1.5 border-border/30"
                          onClick={() => fileRef.current?.click()}
                          disabled={uploading}
                        >
                          <Camera className="w-3 h-3" />
                          {photoUrl ? 'Cambiar' : 'Subir foto'}
                        </Button>
                        {photoUrl && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-xl text-[11px] text-muted-foreground hover:text-red-500 hover:bg-red-500/10 px-2"
                            onClick={() => setPhotoUrl(null)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Name + phone + color */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Nombre *</Label>
                      <Input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Ej: Juan Pérez"
                        className="h-9 text-sm rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Teléfono</Label>
                      <Input
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+56 9..."
                        className="h-9 text-sm rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Color en agenda</Label>
                      <div className="flex gap-1.5 flex-wrap pt-0.5">
                        {TECH_COLORS.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setColor(c)}
                            className="w-6 h-6 rounded-full transition-all duration-150 flex-shrink-0"
                            style={{
                              background: c,
                              transform:  color === c ? 'scale(1.25)' : 'scale(1)',
                              boxShadow:  color === c ? `0 0 0 2px var(--background), 0 0 0 4px ${c}` : 'none',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Jornada laboral */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest">Jornada Laboral</h3>
                  <div className="rounded-xl border border-border/70 overflow-hidden bg-background">
                    {schedules.map((s, i) => (
                      <div
                        key={s.day_of_week}
                        className="flex items-center gap-3 px-3 py-2.5 border-b border-border/40 last:border-0 hover:bg-muted/40 transition-colors"
                      >
                        <span className="w-10 text-[11px] font-semibold text-muted-foreground">
                          {DAY_NAMES[s.day_of_week].slice(0, 3)}
                        </span>
                        <Switch
                          checked={!s.is_day_off}
                          onCheckedChange={v => updateSchedule(i, 'is_day_off', !v)}
                          className="flex-shrink-0"
                        />
                        {!s.is_day_off ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="time"
                              value={s.start_time}
                              onChange={e => updateSchedule(i, 'start_time', e.target.value)}
                              className="flex-1 text-[11px] rounded-lg border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                            <span className="text-[11px] text-muted-foreground/50">—</span>
                            <input
                              type="time"
                              value={s.end_time}
                              onChange={e => updateSchedule(i, 'end_time', e.target.value)}
                              className="flex-1 text-[11px] rounded-lg border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/40 italic">Día libre</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </ScrollArea>

        {view === 'edit' && (
          <DialogFooter className="px-5 py-4 border-t border-border gap-2">
            <Button variant="ghost" onClick={() => setView('list')} disabled={saving} className="rounded-xl">
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving} className="rounded-xl gap-2 min-w-[120px]">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editTech ? 'Guardar cambios' : 'Crear técnico'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
