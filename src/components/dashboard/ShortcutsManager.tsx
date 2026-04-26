import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Zap, Search, Loader2 } from "lucide-react";

export interface Shortcut {
  id: string;
  trigger: string;
  title: string;
  message: string;
}

/* ─── localStorage cache (used by WhatsAppInbox synchronously) ────────────── */
export const shortcutsKey = (companyId?: string) => `shortcuts_${companyId || "global"}`;

export function getShortcuts(companyId?: string): Shortcut[] {
  try {
    return JSON.parse(localStorage.getItem(shortcutsKey(companyId)) || "[]");
  } catch {
    return [];
  }
}

function writeCache(list: Shortcut[], companyId?: string) {
  localStorage.setItem(shortcutsKey(companyId), JSON.stringify(list));
}

/* ─── Supabase helpers ────────────────────────────────────────────────────── */
async function fetchFromSupabase(companyId?: string): Promise<Shortcut[]> {
  let q = (supabase.from as any)("shortcuts")
    .select("id, trigger, title, message")
    .order("created_at", { ascending: true });
  if (companyId) {
    q = q.eq("company_id", companyId);
  } else {
    q = q.is("company_id", null);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data as Shortcut[]) || [];
}

/** Call this from Dashboard on startup so WhatsAppInbox cache is warm */
export async function syncShortcutsCache(companyId?: string) {
  try {
    const list = await fetchFromSupabase(companyId);
    writeCache(list, companyId);
  } catch {
    // silently fall back to existing cache
  }
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function ShortcutsManager({ companyId }: { companyId?: string }) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Shortcut | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ trigger: "", title: "", message: "" });
  const { toast } = useToast();

  /* Load from Supabase on mount and sync to localStorage cache */
  useEffect(() => {
    loadShortcuts();
  }, [companyId]);

  const loadShortcuts = async () => {
    setLoading(true);
    try {
      const list = await fetchFromSupabase(companyId);
      setShortcuts(list);
      writeCache(list, companyId);
    } catch (err: any) {
      toast({ title: "Error al cargar atajos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ trigger: "", title: "", message: "" });
    setDialogOpen(true);
  };

  const openEdit = (s: Shortcut) => {
    setEditing(s);
    setForm({ trigger: s.trigger, title: s.title, message: s.message });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const trigger = form.trigger.replace(/^\/+/, "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!trigger || !form.message.trim()) {
      toast({ title: "Faltan datos", description: "El atajo y el mensaje son obligatorios.", variant: "destructive" });
      return;
    }
    const duplicate = shortcuts.find(s => s.trigger === trigger && s.id !== editing?.id);
    if (duplicate) {
      toast({ title: "Atajo duplicado", description: `/${trigger} ya existe.`, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const { error } = await (supabase.from as any)("shortcuts")
          .update({ trigger, title: form.title || trigger, message: form.message })
          .eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Atajo actualizado" });
      } else {
        const { error } = await (supabase.from as any)("shortcuts").insert({
          company_id: companyId || null,
          trigger,
          title: form.title || trigger,
          message: form.message,
        });
        if (error) throw error;
        toast({ title: "✅ Atajo creado" });
      }
      setDialogOpen(false);
      await loadShortcuts();
    } catch (err: any) {
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await (supabase.from as any)("shortcuts").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Atajo eliminado" });
      await loadShortcuts();
    } catch (err: any) {
      toast({ title: "Error al eliminar", description: err.message, variant: "destructive" });
    }
  };

  const filtered = shortcuts.filter(s =>
    s.trigger.includes(search.toLowerCase()) ||
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.message.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 md:p-8 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Atajos de Mensaje
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Escribe{" "}
            <kbd className="px-1.5 py-0.5 text-xs bg-secondary rounded font-mono border border-border/40">/</kbd>
            {" "}en la bandeja para insertar mensajes rápidos
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Nuevo atajo
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
        <Input
          placeholder="Buscar atajos..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground/50">
            <Zap className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-semibold">{search ? "Sin resultados" : "Aún no hay atajos"}</p>
            {!search && (
              <p className="text-sm mt-1">
                Crea tu primer atajo con el botón de arriba
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {filtered.map(s => (
              <div
                key={s.id}
                className="group flex items-start gap-3 p-4 rounded-xl bg-card/60 border border-border/20 hover:border-primary/30 hover:bg-card/80 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <Badge className="font-mono text-[11px] bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                      /{s.trigger}
                    </Badge>
                    {s.title !== s.trigger && (
                      <span className="text-sm font-medium text-foreground/80 truncate">{s.title}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed whitespace-pre-wrap">{s.message}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 hover:bg-secondary"
                    onClick={() => openEdit(s)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDelete(s.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border/30 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              {editing ? "Editar atajo" : "Nuevo atajo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>
                Atajo{" "}
                <span className="text-muted-foreground text-xs font-normal">(sin espacios, se usa con /)</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary font-bold font-mono select-none">/</span>
                <Input
                  className="pl-7 font-mono"
                  placeholder="bienvenida"
                  value={form.trigger}
                  onChange={e => setForm(p => ({ ...p, trigger: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Nombre descriptivo{" "}
                <span className="text-muted-foreground text-xs font-normal">(opcional)</span>
              </Label>
              <Input
                placeholder="Ej: Mensaje de bienvenida"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mensaje predefinido</Label>
              <Textarea
                placeholder="Escribe el texto que se insertará cuando uses este atajo..."
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
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {editing ? "Guardar cambios" : "Crear atajo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
