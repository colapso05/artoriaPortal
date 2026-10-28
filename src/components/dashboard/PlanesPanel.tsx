import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Wifi, Tv, Layers, X } from "lucide-react";
import {
  listarPlanes, guardarPlan, desactivarPlan, clp,
  CATEGORIAS, PLAN_VACIO, type Plan, type PlanEditable, type CategoriaPlan,
} from "@/lib/planes";

const ICONO: Record<CategoriaPlan, any> = { internet: Wifi, tv: Tv, duo: Layers };

/**
 * Parrilla de planes de la empresa.
 *
 * Es la fuente de precios del agente: lo que se guarda acá es lo que le cotiza al
 * cliente en la próxima conversación. Por eso el panel lo dice en voz alta en vez
 * de dar por hecho que quien edita conoce el alcance.
 */
export default function PlanesPanel({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [planes, setPlanes] = useState<Plan[] | null>(null);
  const [editando, setEditando] = useState<{ id?: string; datos: PlanEditable } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setPlanes(await listarPlanes(companyId));
    } catch (e: any) {
      setPlanes([]);
      toast({ title: "No se pudo cargar la parrilla", description: e.message, variant: "destructive" });
    }
  }, [companyId, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    if (!editando) return;
    const d = editando.datos;
    if (!d.nombre.trim()) {
      toast({ title: "Falta el nombre del plan", variant: "destructive" });
      return;
    }
    if (!(d.precio_normal > 0)) {
      toast({ title: "El precio normal tiene que ser mayor a 0", variant: "destructive" });
      return;
    }
    // Una oferta sin duración no se puede aplicar: el agente no sabría hasta cuándo.
    if (d.precio_oferta != null && !(d.meses_oferta && d.meses_oferta > 0)) {
      toast({
        title: "Falta la duración de la oferta",
        description: "Un precio de oferta necesita cuántos meses dura.",
        variant: "destructive",
      });
      return;
    }
    setGuardando(true);
    try {
      await guardarPlan(companyId, { ...d, nombre: d.nombre.trim(), zona: d.zona?.trim() || null }, editando.id);
      toast({ title: "Plan guardado", description: "El agente ya cotiza con este precio." });
      setEditando(null);
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (p: Plan) => {
    try {
      await desactivarPlan(p.id);
      toast({ title: `"${p.nombre}" desactivado`, description: "Deja de ofrecerse. Las ventas anteriores no cambian." });
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo desactivar", description: e.message, variant: "destructive" });
    }
  };

  if (planes === null) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>;
  }

  const campo = (k: keyof PlanEditable, v: any) =>
    setEditando(e => e ? { ...e, datos: { ...e.datos, [k]: v } } : e);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-base font-bold">Planes y precios</h3>
          <p className="text-[12px] text-muted-foreground/60 leading-relaxed max-w-xl">
            De acá saca el agente los precios que le da al cliente. Lo que cambies se
            usa en la próxima conversación.
          </p>
        </div>
        <Button size="sm" className="rounded-xl gap-1.5 flex-shrink-0"
          onClick={() => setEditando({ datos: { ...PLAN_VACIO } })}>
          <Plus className="w-3.5 h-3.5" /> Nuevo plan
        </Button>
      </div>

      {CATEGORIAS.map(({ id, label }) => {
        const delGrupo = planes.filter(p => p.categoria === id);
        if (delGrupo.length === 0) return null;
        const Icon = ICONO[id];
        return (
          <div key={id} className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" /> {label}
            </p>
            {delGrupo.map(p => (
              <div key={p.id}
                className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 ${
                  p.activo ? "border-border/25 bg-card/40" : "border-border/15 bg-card/20 opacity-55"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold truncate">{p.nombre}</span>
                    {p.velocidad_mbps != null && (
                      <span className="text-[10px] font-bold px-1.5 py-px rounded bg-primary/15 text-primary">
                        {p.velocidad_mbps} Mbps
                      </span>
                    )}
                    {/* La zona solo se pinta cuando la hay: en la parrilla general
                        sería una etiqueta vacía en todas las filas. */}
                    {p.zona && (
                      <span className="text-[10px] font-medium px-1.5 py-px rounded bg-amber-500/15 text-amber-500 truncate max-w-[220px]">
                        {p.zona}
                      </span>
                    )}
                    {!p.activo && <span className="text-[10px] text-muted-foreground/50">desactivado</span>}
                  </div>
                  <p className="text-[11.5px] text-muted-foreground/70 tabular-nums mt-0.5">
                    {p.precio_oferta != null ? (
                      <>
                        <span className="font-bold text-emerald-500">{clp(p.precio_oferta)}</span>
                        {p.meses_oferta ? ` por ${p.meses_oferta} meses` : ""}
                        <span className="mx-1.5 text-muted-foreground/30">·</span>
                        después {clp(p.precio_normal)}
                      </>
                    ) : (
                      <span className="font-bold">{clp(p.precio_normal)}</span>
                    )}
                  </p>
                </div>
                <button onClick={() => setEditando({ id: p.id, datos: { ...p } })}
                  className="w-8 h-8 rounded-lg hover:bg-muted/60 flex items-center justify-center flex-shrink-0"
                  aria-label={`Editar ${p.nombre}`}>
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground/70" />
                </button>
                {p.activo && (
                  <button onClick={() => quitar(p)}
                    className="w-8 h-8 rounded-lg hover:bg-destructive/10 flex items-center justify-center flex-shrink-0"
                    aria-label={`Desactivar ${p.nombre}`}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {planes.length === 0 && (
        <p className="text-[12px] text-muted-foreground/50 text-center py-8">
          Todavía no hay planes cargados. El agente no puede cotizar sin ellos.
        </p>
      )}

      {editando && (
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold">{editando.id ? "Editar plan" : "Nuevo plan"}</p>
            <button onClick={() => setEditando(null)}
              className="w-7 h-7 rounded-lg hover:bg-muted/60 flex items-center justify-center">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[11px] text-muted-foreground">Nombre</Label>
              <Input value={editando.datos.nombre} onChange={e => campo("nombre", e.target.value)}
                placeholder="Fibra 600 Megas" className="h-9 text-sm rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Categoría</Label>
              <div className="flex gap-1.5">
                {CATEGORIAS.map(c => (
                  <button key={c.id} onClick={() => campo("categoria", c.id)}
                    className={`flex-1 h-9 rounded-xl text-[12px] font-semibold border transition-colors ${
                      editando.datos.categoria === c.id
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/30 hover:bg-muted/40"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Velocidad (Mbps)</Label>
              <Input type="number" min={0} value={editando.datos.velocidad_mbps ?? ""}
                onChange={e => campo("velocidad_mbps", e.target.value === "" ? null : parseInt(e.target.value))}
                placeholder="600" className="h-9 text-sm rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Precio normal (CLP)</Label>
              <Input type="number" min={0} value={editando.datos.precio_normal || ""}
                onChange={e => campo("precio_normal", parseInt(e.target.value) || 0)}
                placeholder="25990" className="h-9 text-sm rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Precio de oferta (opcional)</Label>
              <Input type="number" min={0} value={editando.datos.precio_oferta ?? ""}
                onChange={e => campo("precio_oferta", e.target.value === "" ? null : parseInt(e.target.value))}
                placeholder="sin oferta" className="h-9 text-sm rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Meses de oferta</Label>
              <Input type="number" min={1} max={36} value={editando.datos.meses_oferta ?? ""}
                onChange={e => campo("meses_oferta", e.target.value === "" ? null : parseInt(e.target.value))}
                placeholder="6" disabled={editando.datos.precio_oferta == null}
                className="h-9 text-sm rounded-xl" />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[11px] text-muted-foreground">Zona (opcional)</Label>
              <Input value={editando.datos.zona ?? ""} onChange={e => campo("zona", e.target.value)}
                placeholder="Dejar vacío para la parrilla general" className="h-9 text-sm rounded-xl" />
              <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
                Solo si en un sector la oferta es distinta. Con zona, el agente usa este
                plan cuando el cliente es de ahí; si no, el general.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between py-1 border-t border-border/20 pt-3">
            <div>
              <Label className="text-[12px] font-semibold">Activo</Label>
              <p className="text-[10px] text-muted-foreground/50">Si está apagado, el agente no lo ofrece</p>
            </div>
            <Switch checked={editando.datos.activo} onCheckedChange={v => campo("activo", v)} />
          </div>

          <div className="flex gap-2">
            <Button onClick={guardar} disabled={guardando} className="rounded-xl gap-2 flex-1">
              {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Guardar
            </Button>
            <Button variant="outline" onClick={() => setEditando(null)} className="rounded-xl">
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
