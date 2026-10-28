import { useEffect, useRef, useState } from "react";

/** Cuánto hay que mantener el cursor sobre una tarjeta para que se abra su panel. */
export const ESPERA_HOVER_MS = 1000;

/** Tras cerrar un panel, cuánto se ignora el cursor que aparece sobre la tarjeta. */
const PAUSA_TRAS_CERRAR_MS = 500;

/**
 * El gesto que abre un panel: mantener el cursor sobre la tarjeta durante un segundo (o
 * hacer clic, para quien quiere abrirla ya o no usa mouse).
 *
 * `encima` dice si la cuenta está corriendo, para dibujar la barra que se va llenando.
 * Sacar el cursor la cancela. `alEntrar` avisa apenas el cursor llega, para que quien lo
 * use vaya preparando el panel durante ese segundo.
 *
 * Al cerrar un panel el cursor suele quedar justo sobre la tarjeta, y sin una pausa el
 * panel reaparecería un segundo después: por eso el cursor que "aparece" encima justo tras
 * cerrar se ignora hasta que salga y vuelva a entrar. Pero solo ese: si el cursor estaba
 * lejos al cerrar, la primera vez que llegue a la tarjeta cuenta normal.
 */
export function useHoverAbre(alAbrir: () => void, abierto: boolean, alEntrar?: () => void) {
  const [encima, setEncima] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bloqueado = useRef(false);
  const cerroEn = useRef(0);

  const cancelar = () => { if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null; } };
  useEffect(() => cancelar, []);
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    cancelar(); setEncima(false);
    if (!abierto) cerroEn.current = performance.now();
  }, [abierto]);

  return {
    encima,
    manejadores: {
      onMouseEnter: () => {
        if (abierto) return;
        if (performance.now() - cerroEn.current < PAUSA_TRAS_CERRAR_MS) { bloqueado.current = true; return; }
        alEntrar?.();
        if (bloqueado.current) return;
        cancelar(); setEncima(true);
        temporizador.current = setTimeout(() => { setEncima(false); bloqueado.current = true; alAbrir(); }, ESPERA_HOVER_MS);
      },
      onMouseLeave: () => { cancelar(); setEncima(false); bloqueado.current = false; },
      onClick: () => { cancelar(); setEncima(false); bloqueado.current = true; alAbrir(); },
    },
  };
}
