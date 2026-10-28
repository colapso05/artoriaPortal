import type { ReactNode } from "react";
import { Pin, PinOff } from "lucide-react";

/**
 * Le pone a una tarjeta el botón para fijarla en el inicio (o quitarla de ahí).
 *
 * El botón flota sobre el borde superior de la tarjeta para no pelear lugar con lo que
 * la tarjeta ya trae en su cabecera, como el botón de actualizar.
 */
export default function Fijable({
  fijado, alAlternar, modo = "panel", children, className = "",
}: {
  fijado: boolean;
  alAlternar: () => void;
  /** En el panel dice "Fijar"/"Fijado"; en el inicio, "Quitar". */
  modo?: "panel" | "inicio";
  children: ReactNode;
  className?: string;
}) {
  const etiqueta = modo === "inicio" ? "Quitar" : fijado ? "Fijado" : "Fijar";
  return (
    <div className={`relative ${className}`}>
      {children}
      {/* Zona sensible en la esquina: el botón solo aparece al acercar el cursor (o al
          navegar con teclado), para no estorbar la lectura de los datos. */}
      <div className="group/pin absolute -top-4 right-3 z-10 w-44 h-8 flex items-center justify-end pr-1">
        <button
          onClick={alAlternar}
          aria-pressed={fijado}
          aria-label={fijado ? "Quitar del inicio" : "Fijar en el inicio"}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm transition-all duration-200
            ${modo === "panel"
              ? "opacity-100"
              : "opacity-0 -translate-y-1 group-hover/pin:opacity-100 group-hover/pin:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0"} ${
            fijado && modo === "panel"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"}`}
        >
          {modo === "inicio" ? <PinOff className="w-3 h-3" /> : <Pin className={`w-3 h-3 ${fijado ? "fill-current" : ""}`} />}
          {etiqueta}
        </button>
      </div>
    </div>
  );
}
