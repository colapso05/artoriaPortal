import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Settings2, Wrench, Clock, GripVertical, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Label } from "@/components/ui/label";

export interface ScheduleConfig {
  serviceTypes:    string[];
  durationOptions: number[]; // minutos
  techNotificationTemplateId?: string | null;
}

const DEFAULT_SERVICE_TYPES    = ['Instalación', 'Reparación', 'Retiro', 'Mantenimiento', 'Visita técnica', 'Configuración'];
const DEFAULT_DURATION_OPTIONS = [30, 60, 90, 120, 180, 240, 300, 360];

interface Props {
  companyId: string;
  open: boolean;
  onClose: () => void;
  onChanged: (config: ScheduleConfig) => void;
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

export default function ScheduleConfigManager({ companyId, open, onClose, onChanged }: Props) {
  const { toast } = useToast();
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  const [serviceTypes,    setServiceTypes]    = useState<string[]>(DEFAULT_SERVICE_TYPES);
  const [durationOptions, setDurationOptions] = useState<number[]>(DEFAULT_DURATION_OPTIONS);

  const [newService,  setNewService]  = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [techTemplateId, setTechTemplateId] = useState('');

  useEffect(() => {
    if (open) loadConfig();
  }, [open, companyId]);

  async function loadConfig() {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('schedule_settings')
      .select('service_types, duration_options')
      .eq('company_id', companyId)
      .maybeSingle();
    if (data) {
      setServiceTypes(data.service_types || DEFAULT_SERVICE_TYPES);
      setDurationOptions(data.duration_options || DEFAULT_DURATION_OPTIONS);
      setTechTemplateId(data.tech_notification_template_id || '');
    } else {
      setServiceTypes(DEFAULT_SERVICE_TYPES);
      setDurationOptions(DEFAULT_DURATION_OPTIONS);
      setTechTemplateId('');
    }
    setLoading(false);
  }

  async function save() {
    if (serviceTypes.length === 0) {
      toast({ title: 'Debe haber al menos un tipo de servicio', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from('schedule_settings')
      .upsert({
        company_id:                      companyId,
        service_types:                   serviceTypes,
        duration_options:                durationOptions,
        tech_notification_template_id:   techTemplateId.trim() || null,
        updated_at:                      new Date().toISOString(),
      }, { onConflict: 'company_id' });
    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Configuración guardada ✓' });
      onChanged({ serviceTypes, durationOptions, techNotificationTemplateId: techTemplateId.trim() || null });
      onClose();
    }
    setSaving(false);
  }

  function addServiceType() {
    const v = newService.trim();
    if (!v) return;
    if (serviceTypes.map(s => s.toLowerCase()).includes(v.toLowerCase())) {
      toast({ title: 'Ya existe ese tipo', variant: 'destructive' });
      return;
    }
    setServiceTypes(prev => [...prev, v]);
    setNewService('');
  }

  function removeServiceType(idx: number) {
    setServiceTypes(prev => prev.filter((_, i) => i !== idx));
  }

  function addDuration() {
    const v = parseInt(newDuration);
    if (!v || v < 5 || v > 720) {
      toast({ title: 'Duración inválida (5 – 720 min)', variant: 'destructive' });
      return;
    }
    if (durationOptions.includes(v)) {
      toast({ title: 'Ya existe esa duración', variant: 'destructive' });
      return;
    }
    setDurationOptions(prev => [...prev, v].sort((a, b) => a - b));
    setNewDuration('');
  }

  function removeDuration(mins: number) {
    setDurationOptions(prev => prev.filter(d => d !== mins));
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border shadow-2xl rounded-2xl p-0 overflow-hidden" aria-describedby={undefined}>
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20">
          <DialogTitle className="text-sm font-bold flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Settings2 className="w-4 h-4 text-primary" />
            </div>
            Configuración de Agenda
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[68vh]">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
            </div>
          ) : (
            <div className="p-5 space-y-7">

              {/* ── Tipos de servicio ── */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Wrench className="w-3 h-3 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-bold text-foreground uppercase tracking-widest">
                      Tipos de Servicio
                    </h3>
                    <p className="text-[10px] text-muted-foreground/60">
                      Aparecen como sugerencias al crear una cita
                    </p>
                  </div>
                </div>

                {/* List */}
                <div className="rounded-xl border border-border/60 overflow-hidden bg-background">
                  <AnimatePresence initial={false}>
                    {serviceTypes.map((s, i) => (
                      <motion.div
                        key={s}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-3 px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/40 group transition-colors"
                      >
                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/25 flex-shrink-0" />
                        <span className="flex-1 text-sm font-medium">{s}</span>
                        <button
                          onClick={() => removeServiceType(i)}
                          className="w-6 h-6 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-muted-foreground/30 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {serviceTypes.length === 0 && (
                    <p className="px-4 py-6 text-[11px] text-muted-foreground/40 text-center">
                      Sin tipos de servicio — agrega al menos uno
                    </p>
                  )}
                </div>

                {/* Add new */}
                <div className="flex gap-2">
                  <Input
                    value={newService}
                    onChange={e => setNewService(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addServiceType()}
                    placeholder="Ej: Instalación fibra óptica..."
                    className="flex-1 h-9 text-sm rounded-xl"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-xl gap-1.5 text-[11px] font-semibold"
                    onClick={addServiceType}
                    disabled={!newService.trim()}
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar
                  </Button>
                </div>
              </section>

              {/* ── Duraciones predefinidas ── */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-3 h-3 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-bold text-foreground uppercase tracking-widest">
                      Duraciones Predefinidas
                    </h3>
                    <p className="text-[10px] text-muted-foreground/60">
                      Aparecen en el selector · Siempre puedes ingresar minutos manualmente
                    </p>
                  </div>
                </div>

                {/* Grid de duraciones */}
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence initial={false}>
                    {durationOptions.map(d => (
                      <motion.div
                        key={d}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={{ duration: 0.15 }}
                        className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-muted/50 hover:border-red-500/40 hover:bg-red-500/8 transition-all cursor-default"
                      >
                        <span className="text-[12px] font-semibold">{fmtDuration(d)}</span>
                        <button
                          onClick={() => removeDuration(d)}
                          className="w-4 h-4 rounded flex items-center justify-center text-muted-foreground/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Add duration */}
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Input
                      type="number"
                      value={newDuration}
                      onChange={e => setNewDuration(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addDuration()}
                      placeholder="Minutos (ej: 45)"
                      min={5}
                      max={720}
                      className="h-9 text-sm rounded-xl pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/50 font-medium">
                      min
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-xl gap-1.5 text-[11px] font-semibold"
                    onClick={addDuration}
                    disabled={!newDuration}
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/40 px-0.5">
                  Rango permitido: 5 – 720 minutos (12 horas)
                </p>
              </section>

              {/* ── Notificación al técnico ── */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-3 h-3 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-bold text-foreground uppercase tracking-widest">
                      Notificación al Técnico
                    </h3>
                    <p className="text-[10px] text-muted-foreground/60">
                      Template de YCloud para el botón "Enviar tarea"
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                  <p className="text-[10px] text-muted-foreground/60">Plantilla configurada actualmente</p>
                  {techTemplateId ? (
                    <p className="text-sm font-mono font-semibold text-foreground">{techTemplateId}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/40 italic">Sin plantilla configurada</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 leading-relaxed pt-1">
                    Para cambiarla, usa el botón <span className="font-semibold">⚙️</span> junto a "Enviar tarea" en el panel de detalle de cualquier cita.
                  </p>
                </div>
              </section>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="px-5 py-4 border-t border-border bg-muted/20 gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving} className="rounded-xl">
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || loading} className="rounded-xl gap-2 min-w-[130px]">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Guardar configuración
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
