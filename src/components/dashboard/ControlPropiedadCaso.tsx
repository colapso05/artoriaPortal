import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hand, Lock, CheckCircle2, Forward, LogOut, Loader2, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  /** Dueño actual del caso (`conversations.taken_by`). */
  duenoId?: string | null;
  duenoNombre?: string | null;
  tomadoEn?: string | null;
  userId?: string | null;
  /** Sin actividad desde hace horas: se muestra apagado para que otro pueda agarrarlo. */
  abandonado?: boolean;
  ocupado?: boolean;
  simulando?: boolean;
  onTomar: () => void;
  onArrebatar: () => void;
  onLiberar: () => void;
  onTransferir: () => void;
}

const desde = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true, locale: es });
};

const iniciales = (nombre: string) =>
  nombre.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join("") || "??";

/**
 * Quién lleva esta conversación.
 *
 * Es un solo control: un botón que dice el estado y, al pulsarlo, despliega las
 * acciones. Antes eran hasta tres botones sueltos y una etiqueta, y entre eso, la
 * ONU y FINALIZAR el encabezado no cabía en pantallas chicas.
 *
 * Sigue distinguiéndose de los avatares de presencia que tiene al lado: la
 * presencia dice quién está mirando ahora, esto dice de quién es el caso.
 */
export function ControlPropiedadCaso({
  duenoId, duenoNombre, tomadoEn, userId, abandonado,
  ocupado, simulando, onTomar, onArrebatar, onLiberar, onTransferir,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const esMio = !!duenoId && duenoId === userId;
  const nombre = duenoNombre ?? "otro operador";

  const cerrarY = (fn: () => void) => () => { setAbierto(false); fn(); };

  // Libre: no hace falta desplegar nada, la única acción es tomarlo.
  if (!duenoId) {
    return (
      <Button
        size="sm"
        onClick={onTomar}
        disabled={ocupado}
        title="Tomar este caso"
        className="h-8 gap-1.5 px-2.5 text-[10px] font-black tracking-wider uppercase bg-emerald-500 hover:bg-emerald-600 text-white"
      >
        {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hand className="w-3.5 h-3.5" />}
        <span className="hidden lg:inline">Tomar</span>
      </Button>
    );
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={esMio ? "Este caso es tuyo" : `Caso de ${nombre} · ${desde(tomadoEn)}`}
          className={`h-8 px-2.5 rounded-md border inline-flex items-center gap-1.5 transition-colors ${
            esMio
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
              : abandonado
                ? "border-border/60 bg-muted/60 text-muted-foreground hover:bg-muted"
                : "border-amber-500/60 bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30"
          }`}
        >
          {esMio ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          <span className="text-[10px] font-black tracking-wider uppercase">
            {esMio ? "Tuyo" : iniciales(nombre)}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-2 bg-card border-border/40">
        <div className="px-2 py-1.5">
          <p className="text-[12px] font-bold leading-tight">
            {esMio ? "Este caso es tuyo" : `Lo lleva ${nombre}`}
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            {abandonado ? `Sin actividad ${desde(tomadoEn)}` : `Tomado ${desde(tomadoEn)}`}
          </p>
          {simulando && (
            <p className="text-[10px] text-amber-500 font-semibold mt-1.5 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 mt-px flex-shrink-0" />
              Estás simulando: lo que hagas queda a tu nombre de administrador.
            </p>
          )}
        </div>

        <div className="h-px bg-border/30 my-1" />

        {!esMio && (
          <button
            onClick={cerrarY(onArrebatar)}
            disabled={ocupado}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[12px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
          >
            <Hand className="w-3.5 h-3.5" /> Tomarlo igual
          </button>
        )}
        <button
          onClick={cerrarY(onTransferir)}
          disabled={ocupado}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[12px] font-medium text-blue-500 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
        >
          <Forward className="w-3.5 h-3.5" /> Transferir a un compañero
        </button>
        {esMio && (
          <button
            onClick={cerrarY(onLiberar)}
            disabled={ocupado}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[12px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors disabled:opacity-50"
          >
            {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            Liberar
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Chip chico con las iniciales del dueño, para barrer la lista de un vistazo. */
export function ChipDueno({ nombre, iniciales: ini, esMio, abandonado }: {
  nombre: string; iniciales: string; esMio: boolean; abandonado?: boolean;
}) {
  return (
    <span
      title={esMio ? `Tu caso — ${nombre}` : `Caso de ${nombre}`}
      className={`inline-flex items-center gap-1 text-[8px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded border ${
        esMio
          ? "border-primary/60 bg-primary/20 text-primary"
          : abandonado
            ? "border-border/40 bg-muted/40 text-muted-foreground/70"
            : "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400"
      }`}
    >
      <Lock className="w-2 h-2" />
      {ini}
    </span>
  );
}
