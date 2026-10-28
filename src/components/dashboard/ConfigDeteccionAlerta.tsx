import { useEffect, useState } from "react";
import { Loader2, Radar, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  guardarConfigAlerta, leerConfigAlerta, LIMITES_ALERTA, validarConfigAlerta,
} from "@/lib/alertaReclamos";

/**
 * Cuántos reclamos seguidos, y en cuánto tiempo, hacen que el sistema avise.
 *
 * Antes eso estaba fijo en el backend (diez minutos). Acá cada empresa lo ajusta:
 * una empresa chica con diez reclamos ya tiene un problema; una grande necesita un
 * umbral más alto para no alertar por ruido.
 *
 * Si la base todavía no tiene las columnas, esto no se dibuja: un formulario que no
 * guarda nada es peor que no tenerlo.
 */
export default function ConfigDeteccionAlerta({ companyId, tarjeta = false }: { companyId: string; tarjeta?: boolean }) {
  const { toast } = useToast();
  const [estado, setEstado] = useState<"cargando" | "no-disponible" | "listo">("cargando");
  const [ventana, setVentana] = useState("");
  const [umbral, setUmbral] = useState("");
  const [original, setOriginal] = useState<{ v: string; u: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    leerConfigAlerta(companyId).then(c => {
      if (cancelado) return;
      if (c === undefined) { setEstado("no-disponible"); return; }
      const v = c ? String(c.ventanaMin) : "";
      const u = c ? String(c.umbral) : "";
      setVentana(v); setUmbral(u); setOriginal({ v, u });
      setEstado("listo");
    });
    return () => { cancelado = true; };
  }, [companyId]);

  if (estado === "no-disponible") return null;

  const valores = { ventanaMin: Number(ventana), umbral: Number(umbral) };
  const error = ventana === "" || umbral === "" ? null : validarConfigAlerta(valores);
  const incompleto = ventana === "" || umbral === "";
  const sinCambios = original?.v === ventana && original?.u === umbral;

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarConfigAlerta(companyId, valores);
      setOriginal({ v: ventana, u: umbral });
      toast({
        title: "Configuración guardada",
        description: `La alerta se activa con ${umbral} reclamos en un máximo de ${ventana} minutos.`,
      });
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={tarjeta ? "space-y-1 p-6 rounded-xl border border-border/20 bg-card/40" : "border-t border-border/10 pt-6"}>
      <div className="flex items-center gap-2 mb-1">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Radar className="h-4 w-4 text-primary" />
        </div>
        <h4 className="font-bold text-sm">¿Cuándo se activa la alerta?</h4>
      </div>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        Cuando varios clientes reclaman casi al mismo tiempo, probablemente hay una falla general (por ejemplo,
        un corte de servicio). El sistema la detecta contando los reclamos y, al llegar al límite que defines
        acá, activa la alerta y avisa a los números de WhatsApp de arriba.
      </p>

      {estado === "cargando" ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold">Cantidad de reclamos</label>
              <Input type="number" inputMode="numeric" value={umbral} placeholder="Ej: 10"
                min={LIMITES_ALERTA.umbral.min} max={LIMITES_ALERTA.umbral.max}
                onChange={e => setUmbral(e.target.value)} className="h-10" />
              <p className="text-[10.5px] text-muted-foreground/70 leading-snug">
                Cuántos reclamos seguidos activan la alerta ({LIMITES_ALERTA.umbral.min} a {LIMITES_ALERTA.umbral.max}).
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold">Tiempo (minutos)</label>
              <Input type="number" inputMode="numeric" value={ventana} placeholder="Ej: 10"
                min={LIMITES_ALERTA.ventanaMin.min} max={LIMITES_ALERTA.ventanaMin.max}
                onChange={e => setVentana(e.target.value)} className="h-10" />
              <p className="text-[10.5px] text-muted-foreground/70 leading-snug">
                En cuánto tiempo tienen que llegar ({LIMITES_ALERTA.ventanaMin.min} a {LIMITES_ALERTA.ventanaMin.max} min).
              </p>
            </div>
          </div>

          {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
          {!error && !incompleto && (
            <div className="mt-4 rounded-lg bg-primary/[0.06] border border-primary/15 px-3.5 py-2.5 max-w-xl">
              <p className="text-xs leading-relaxed">
                La alerta se activa si llegan <strong>{umbral} reclamos</strong> en un máximo de <strong>{ventana} minutos</strong>.
              </p>
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-1">
                Si pasan {ventana} minutos sin completar los {umbral}, la cuenta vuelve a cero y se empieza de nuevo.
                Con un número bajo la alerta salta antes (y puede avisar por poco); con uno alto avisa más tarde, pero solo
                cuando es seguro que es una falla general.
              </p>
            </div>
          )}

          <Button size="sm" className="mt-4 gap-2" onClick={guardar}
            disabled={guardando || !!error || incompleto || sinCambios}>
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar
          </Button>
        </>
      )}
    </div>
  );
}
