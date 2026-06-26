import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { BookMarked, Plus, Pencil, Trash2, Loader2, ChevronRight } from "lucide-react";

interface AlertPreset { id: string; title: string; message: string; }

interface Props {
  companyId: string;
  onSelect: (message: string) => void;
}

async function fetchPresets(companyId: string): Promise<AlertPreset[]> {
  const { data, error } = await (supabase.from as any)("alert_presets")
    .select("id, title, message")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as AlertPreset[]) || [];
}

export default function AlertPresetPicker({ companyId, onSelect }: Props) {
  const [open, setOpen]             = useState(false);
  const [presets, setPresets]       = useState<AlertPreset[]>([]);
  const [loading, setLoading]       = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState<AlertPreset | null>(null);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState({ title: "", message: "" });
  const { toast } = useToast();

  useEffect(() => {
    if (open) load();
  }, [open, companyId]);

  async function load() {
    setLoading(true);
    try { setPresets(await fetchPresets(companyId)); }
    catch { /* silently fail */ }
    finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm({ title: "", message: "" });
    setOpen(false);
    setDialogOpen(true);
  }

  function openEdit(p: AlertPreset, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(p);
    setForm({ title: p.title, message: p.message });
    setOpen(false);
    setDialogOpen(true);
  }

  async function handleDelete(p: AlertPreset, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const { error } = await (supabase.from as any)("alert_presets").delete().eq("id", p.id);
      if (error) throw error;
      toast({ title: "Preset eliminado" });
      load();
    } catch (err: any) {
      toast({ title: "Error al eliminar", description: err.message, variant: "destructive" });
    }
  }

  async function handleSave() {
    if (!form.title.trim() || !form.message.trim()) {
      toast({ title: "Faltan datos", description: "El nombre y el mensaje son obligatorios.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await (supabase.from as any)("alert_presets")
          .update({ title: form.title.trim(), message: form.message.trim() })
          .eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Preset actualizado" });
      } else {
        const { error } = await (supabase.from as any)("alert_presets").insert({
          company_id: companyId,
          title: form.title.trim(),
          message: form.message.trim(),
        });
        if (error) throw error;
        toast({ title: "✅ Preset guardado" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs border-dashed px-2.5"
          >
            <BookMarked className="w-3.5 h-3.5" />
            Presets
            {presets.length > 0 && (
              <span className="ml-0.5 text-[10px] bg-primary/15 text-primary rounded-full px-1.5 py-0 font-bold">
                {presets.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-72 p-2" align="start">
          <div className="flex items-center justify-between px-1 pb-2 border-b border-border/20 mb-2">
            <p className="text-xs font-bold text-muted-foreground/70 uppercase tracking-wide">Mensajes guardados</p>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={openCreate}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
            </div>
          ) : presets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <BookMarked className="w-7 h-7 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground/50">Sin presets guardados</p>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5 mt-1" onClick={openCreate}>
                <Plus className="w-3 h-3" /> Crear el primero
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-60">
              <div className="space-y-1 pr-1">
                {presets.map(p => (
                  <div
                    key={p.id}
                    className="group flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => { onSelect(p.message); setOpen(false); }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{p.title}</p>
                      <p className="text-[10px] text-muted-foreground/60 truncate">{p.message}</p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        className="p-1 rounded hover:bg-secondary"
                        onClick={(e) => openEdit(p, e)}
                      >
                        <Pencil className="w-3 h-3 text-muted-foreground/60" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-destructive/10"
                        onClick={(e) => handleDelete(p, e)}
                      >
                        <Trash2 className="w-3 h-3 text-destructive/60" />
                      </button>
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary/60 transition-colors flex-shrink-0" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </PopoverContent>
      </Popover>

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border/30 bg-card sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-primary" />
              {editing ? "Editar preset" : "Nuevo preset"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Nombre del preset</Label>
              <Input
                placeholder="Ej: Corte de luz zona norte"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mensaje de alerta</Label>
              <Textarea
                placeholder="Escribe el mensaje que se enviará como alerta..."
                value={form.message}
                onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                className="min-h-[130px] resize-y text-sm"
              />
              <p className="text-[11px] text-right text-muted-foreground/50">{form.message.length} caracteres</p>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} className="gap-1.5" disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookMarked className="w-3.5 h-3.5" />}
              {editing ? "Guardar cambios" : "Crear preset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
