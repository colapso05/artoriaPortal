import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { animate, useMotionValue, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

/**
 * El panel grande que sale de una tarjeta.
 *
 * Se "despliega" desde la tarjeta: arranca recortado exactamente al rectángulo de la tarjeta
 * y se abre hasta ocupar el centro de la pantalla; al cerrar hace el camino inverso. Solo
 * cambian un recorte (clip-path) y la opacidad —nada de filtros ni de reescalar el
 * contenido—, así el texto no se deforma y la animación se mantiene fluida aunque el
 * panel traiga muchos gráficos.
 *
 * Con "reducir movimiento" activado solo aparece y desaparece con un fundido.
 */
const DURACION_ABRE = 0.42;
const DURACION_CIERRA = 0.3;
const CURVA: [number, number, number, number] = [0.22, 1, 0.36, 1];
const RADIO = 22;

const medida = () => ({
  ancho: Math.max(320, Math.min(1480, window.innerWidth - 48)),
  alto: Math.max(360, window.innerHeight - 48),
});

export default function PanelVortice({
  abierto, alCerrar, origen, titulo, subtitulo, children, precalentar = false,
}: {
  abierto: boolean;
  alCerrar: () => void;
  /** La tarjeta desde la que sale y a la que vuelve. */
  origen: RefObject<HTMLElement>;
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  /** Mantiene el panel armado (y oculto) para que al abrirse ya tenga todo cargado. */
  precalentar?: boolean;
}) {
  const reducido = useReducedMotion();
  const progreso = useMotionValue(0);
  const panel = useRef<HTMLDivElement>(null);
  const fondo = useRef<HTMLDivElement>(null);
  /** El rectángulo de la tarjeta respecto del panel, al abrir: { arriba, derecha, abajo, izquierda } en px. */
  const recorte = useRef({ t: 0, r: 0, b: 0, l: 0 });
  const estuvoMontado = useRef(false);

  const [montado, setMontado] = useState(false);
  const [dim, setDim] = useState(medida);

  useEffect(() => {
    if (!montado) return;
    const alRedimensionar = () => setDim(medida());
    window.addEventListener("resize", alRedimensionar);
    return () => window.removeEventListener("resize", alRedimensionar);
  }, [montado]);

  /** Pinta un instante: `e` va de 0 (en la tarjeta) a 1 (panel completo). */
  const aplicar = useCallback((e: number) => {
    const el = panel.current;
    if (!el) return;
    if (fondo.current) fondo.current.style.opacity = String(e);
    if (reducido) { el.style.opacity = String(e); return; }
    const { t, r, b, l } = recorte.current;
    const k = 1 - e;
    el.style.clipPath = e >= 0.999 ? "none"
      : `inset(${t * k}px ${r * k}px ${b * k}px ${l * k}px round ${RADIO}px)`;
    el.style.opacity = String(Math.min(1, e * 6));
  }, [reducido]);

  useEffect(() => progreso.on("change", aplicar), [progreso, aplicar]);

  useEffect(() => { if (abierto) setMontado(true); }, [abierto]);

  useLayoutEffect(() => {
    if (!montado) { estuvoMontado.current = false; return; }
    let control: ReturnType<typeof animate> | undefined;
    if (abierto) {
      const caja = panel.current?.getBoundingClientRect();
      const t = origen.current?.getBoundingClientRect();
      if (caja && t) {
        recorte.current = {
          t: Math.max(0, t.top - caja.top), l: Math.max(0, t.left - caja.left),
          b: Math.max(0, caja.bottom - t.bottom), r: Math.max(0, caja.right - t.right),
        };
      } else {
        recorte.current = { t: dim.alto / 2, b: dim.alto / 2, l: dim.ancho / 2, r: dim.ancho / 2 };
      }
      if (!estuvoMontado.current) { progreso.set(0); aplicar(0); }
      estuvoMontado.current = true;
      // Se espera a que el contenido termine de montarse y pintarse: el reloj de la
      // animación corre desde que arranca, y el montaje pesado se comería los primeros cuadros.
      let r1 = 0, r2 = 0;
      r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => {
        control = animate(progreso, 1, { duration: reducido ? 0.2 : DURACION_ABRE, ease: CURVA });
      }); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); control?.stop(); };
    }
    control = animate(progreso, 0, { duration: reducido ? 0.15 : DURACION_CIERRA, ease: CURVA });
    control.then(() => { if (progreso.get() <= 0.001) setMontado(false); });
    return () => control?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, montado]);

  useEffect(() => {
    if (import.meta.env.DEV) (window as any).__vorticeT = progreso;
  }, [progreso]);

  useEffect(() => {
    if (!montado) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") alCerrar(); };
    window.addEventListener("keydown", alTeclear);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", alTeclear); document.body.style.overflow = antes; };
  }, [montado, alCerrar]);

  if (!montado && !precalentar) return null;

  // Precalentado: está en la página pero invisible y sin recibir clics. Al cerrar deja de
  // recibirlos desde el primer instante, para que la tarjeta de abajo sienta el cursor enseguida.
  return createPortal(
    <div className={`fixed inset-0 z-[80] flex items-center justify-center ${montado ? "" : "invisible"} ${abierto ? "" : "pointer-events-none"}`}>
      <div ref={fondo} className="absolute inset-0 bg-slate-900/45" style={{ opacity: 0 }} onClick={alCerrar} aria-hidden="true" />

      <div
        ref={panel}
        role="dialog" aria-modal="true" aria-label={titulo}
        className="relative rounded-[22px] bg-background shadow-[0_40px_100px_-20px_rgba(10,25,60,0.45)] flex flex-col overflow-hidden"
        style={{ width: dim.ancho, height: dim.alto, opacity: 0 }}
      >
        <div className="flex items-start justify-between gap-4 px-8 pt-7 pb-5 border-b border-border/60 flex-shrink-0 bg-card">
          <div className="min-w-0">
            <h2 className="text-[28px] font-extrabold tracking-tight leading-tight">{titulo}</h2>
            {subtitulo && <p className="text-[15px] text-muted-foreground mt-1">{subtitulo}</p>}
          </div>
          <button
            onClick={alCerrar} aria-label="Cerrar"
            className="w-11 h-11 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="panel-amplio flex-1 overflow-y-auto px-8 py-7 bg-muted/60">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
