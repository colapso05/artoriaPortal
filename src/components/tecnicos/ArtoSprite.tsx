import { useEffect, useRef, useState } from "react";

/**
 * Arto animado a partir de una hoja de sprites.
 *
 * Cada animación es una sola imagen con los frames en cuadrícula: así se descarga
 * de una vez en lugar de pedir 36 archivos sueltos. Los originales de la app pesan
 * 43 MB entre todos; estas versiones reducidas al tamaño en que se ven suman 3 MB
 * y solo se descarga la animación del paso en pantalla.
 */

export type ArtoMood = "saludo" | "apunta-abajo" | "apunta-arriba" | "baila" | "celebra";

/** Debe coincidir con public/arto/arto.json (lo genera el script de sprites). */
const HOJAS: Record<ArtoMood, { frames: number; cols: number; filas: number; fps: number }> = {
  "saludo":        { frames: 16, cols: 4, filas: 4, fps: 14 },
  "apunta-abajo":  { frames: 36, cols: 6, filas: 6, fps: 24 },
  "apunta-arriba": { frames: 36, cols: 6, filas: 6, fps: 24 },
  "baila":         { frames: 36, cols: 6, filas: 6, fps: 24 },
  "celebra":       { frames: 36, cols: 6, filas: 6, fps: 24 },
};

/** Proporción del personaje, para reservar el ancho sin deformarlo. */
const RELACION = 124 / 132;

export function ArtoSprite({ mood, alto = 96 }: { mood: ArtoMood; alto?: number }) {
  const hoja = HOJAS[mood];
  const [frame, setFrame] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    setFrame(0);
    // Se anima con requestAnimationFrame en vez de un intervalo para que el
    // navegador pause la animación solo cuando la pestaña no está visible.
    let ultimo = performance.now();
    let actual = 0;
    const intervalo = 1000 / hoja.fps;

    const tick = (ahora: number) => {
      if (ahora - ultimo >= intervalo) {
        ultimo = ahora;
        actual = (actual + 1) % hoja.frames;
        setFrame(actual);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [mood, hoja.fps, hoja.frames]);

  const col = frame % hoja.cols;
  const fila = Math.floor(frame / hoja.cols);

  return (
    <div
      aria-hidden
      style={{
        height: alto,
        width: alto * RELACION,
        backgroundImage: `url(/arto/${mood}.png)`,
        backgroundSize: `${hoja.cols * 100}% ${hoja.filas * 100}%`,
        // En porcentajes, 100% equivale al último frame, de ahí el (cols - 1).
        backgroundPosition: `${(col / (hoja.cols - 1)) * 100}% ${(fila / (hoja.filas - 1)) * 100}%`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

export default ArtoSprite;
