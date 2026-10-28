import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArtoSprite, type ArtoMood } from "./ArtoSprite";

/**
 * Tour guiado del Portal Técnicos, equivalente al de la app Android.
 *
 * Arto se va moviendo por la pantalla siguiendo al elemento que explica, en vez de
 * quedarse fijo abajo: es lo que hace que el recorrido se lea como un personaje
 * mostrando cosas y no como un cartel de ayuda.
 *
 * Los pasos que ocurren dentro de un trabajo (detalle y cierre) los orquesta
 * PortalTecnicos, que navega de verdad usando la cita de ejemplo.
 */

export type VistaTour = "agenda" | "detalle" | "cierre" | "historial";

type Paso = {
  mensaje: string;
  mood: ArtoMood;
  /** Valor del atributo `data-tour` al que apuntar, si corresponde. */
  foco?: string;
  /** Pantalla en la que debe ocurrir este paso. */
  vista: VistaTour;
};

const CLAVE = "tec_tour_visto";

export const TOTAL_PASOS = 8;

/** True si a este técnico todavía no se le mostró el tour en este dispositivo. */
export function tourPendiente(tecnicoId: string): boolean {
  try {
    return localStorage.getItem(`${CLAVE}_${tecnicoId}`) !== "1";
  } catch {
    // Si el navegador bloquea el almacenamiento, mejor no insistir con el tour.
    return false;
  }
}

export function marcarTourVisto(tecnicoId: string) {
  try { localStorage.setItem(`${CLAVE}_${tecnicoId}`, "1"); } catch { /* noop */ }
}

/** Pantalla que corresponde a cada paso, para que PortalTecnicos navegue solo. */
export function vistaDelPaso(paso: number): VistaTour {
  return construirPasos("", true)[paso - 1]?.vista ?? "agenda";
}

function construirPasos(nombre: string, hayTrabajos: boolean): Paso[] {
  return [
    {
      mensaje: `¡Hola ${nombre}! 👋 Soy Arto, tu asistente en Artoria. Te muestro cómo funciona tu agenda.`,
      mood: "saludo",
      vista: "agenda",
    },
    {
      mensaje: hayTrabajos
        ? "Aquí están tus trabajos. Vamos a abrir uno de ejemplo para que veas cómo es 👆"
        : "Aquí verás tus trabajos cuando te los asignen 📋. Te muestro uno de ejemplo 👆",
      mood: "apunta-arriba",
      foco: "tarjeta",
      vista: "agenda",
    },
    {
      mensaje: "Adentro está la info del cliente: nombre, dirección y teléfono 📋 Puedes tocar la dirección para abrir el mapa.",
      mood: "apunta-arriba",
      foco: "cliente",
      vista: "detalle",
    },
    {
      mensaje: "Cuando salgas, marca «Ir al trabajo» 🚗 — tus operadores sabrán que vas para allá.",
      mood: "apunta-abajo",
      foco: "en-camino",
      vista: "detalle",
    },
    {
      mensaje: "Y al terminar, «Marcar como completado» ✅ — ojo que es distinto del anterior.",
      mood: "baila",
      foco: "completar",
      vista: "detalle",
    },
    {
      mensaje: "Aquí subes las fotos de lo que hiciste y agregas tus notas 📸",
      mood: "baila",
      foco: "fotos",
      vista: "cierre",
    },
    {
      mensaje: "En «Historial» revisas todos tus trabajos anteriores con sus fotos.",
      mood: "apunta-arriba",
      foco: "historial",
      vista: "historial",
    },
    {
      mensaje: "¡Y eso es todo! 💪 Ya sabes usar tu agenda. ¡Mucho éxito en tu trabajo hoy!",
      mood: "celebra",
      vista: "agenda",
    },
  ];
}

type Recuadro = { top: number; left: number; width: number; height: number };

const ALTO_ARTO = 96;
const ANCHO_ARTO = Math.round(ALTO_ARTO * (124 / 132));
/** Separación entre Arto y su globo, y de ambos con el borde de la pantalla. */
const HUECO = 8;
const MARGEN = 12;
/** Bajo esto el texto queda ilegible, así que conviene mandar el globo al otro lado. */
const MIN_GLOBO = 200;
/** Tope de ancho: sin esto el globo se estiraba de lado a lado en pantallas anchas. */
const MAX_GLOBO = 440;

/**
 * Coloca a Arto junto al elemento que explica y decide de qué lado va el globo.
 *
 * Arto se acerca horizontalmente al foco (por eso en «Historial» queda justo bajo
 * la pestaña, a la derecha) y el globo ocupa el lado donde queda más pantalla libre.
 */
function calcularPosicion(recuadro: Recuadro | null, vw: number) {
  const centroFoco = recuadro ? recuadro.left + recuadro.width / 2 : vw / 2;
  let artoLeft = Math.max(MARGEN, Math.min(centroFoco - ANCHO_ARTO / 2, vw - ANCHO_ARTO - MARGEN));

  const libreDerecha = vw - (artoLeft + ANCHO_ARTO) - HUECO - MARGEN;
  const libreIzquierda = artoLeft - HUECO - MARGEN;

  let globoDerecha = libreDerecha >= libreIzquierda;
  let ancho = Math.min(MAX_GLOBO, globoDerecha ? libreDerecha : libreIzquierda);

  // Con Arto cerca del centro no queda sitio cómodo a ningún lado: se le corre al
  // borde para liberar el ancho de una sola vez en lugar de partirlo en dos mitades.
  if (ancho < MIN_GLOBO) {
    globoDerecha = centroFoco <= vw / 2;
    artoLeft = globoDerecha ? MARGEN : vw - ANCHO_ARTO - MARGEN;
    ancho = Math.min(MAX_GLOBO, vw - ANCHO_ARTO - HUECO - MARGEN * 2);
  }

  return { artoLeft, globoDerecha, ancho };
}

export function TecnicoTour({
  paso,
  nombre,
  hayTrabajos,
  onSiguiente,
  onSalir,
}: {
  paso: number;
  nombre: string;
  hayTrabajos: boolean;
  onSiguiente: () => void;
  onSalir: () => void;
}) {
  const pasos = construirPasos(nombre.split(" ")[0] || "técnico", hayTrabajos);
  const actual = pasos[paso - 1];
  const [recuadro, setRecuadro] = useState<Recuadro | null>(null);
  const [ventana, setVentana] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  useEffect(() => {
    const alRedimensionar = () => setVentana({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", alRedimensionar);
    return () => window.removeEventListener("resize", alRedimensionar);
  }, []);

  const huella = useRef("");

  const medirFoco = useCallback(() => {
    const clave = actual?.foco;
    if (!clave) {
      if (huella.current !== "") { huella.current = ""; setRecuadro(null); }
      return;
    }
    const el = document.querySelector(`[data-tour="${clave}"]`);
    // Todavía sin montar: se conserva el foco anterior hasta que aparezca, que es
    // menos brusco que dejar la pantalla entera oscura por un instante.
    if (!el) return;

    const r = el.getBoundingClientRect();
    const actualHuella = `${clave}|${r.top}|${r.left}|${r.width}|${r.height}`;
    if (actualHuella === huella.current) return;
    huella.current = actualHuella;
    setRecuadro({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [actual?.foco]);

  // Tras cada render, sin lista de dependencias: los pasos que cambian de pantalla
  // (agenda → detalle → cierre) montan su contenido en el render siguiente, y así el
  // foco salta al elemento nuevo en cuanto existe, sin esperar a un temporizador.
  useLayoutEffect(medirFoco);

  // Y mientras el paso está en pantalla, por si algo se mueve solo: scroll, teclado
  // del móvil, o imágenes que terminan de cargar y recolocan la lista.
  useEffect(() => {
    const cronometro = setInterval(medirFoco, 150);
    window.addEventListener("resize", medirFoco);
    window.addEventListener("scroll", medirFoco, true);
    return () => {
      clearInterval(cronometro);
      window.removeEventListener("resize", medirFoco);
      window.removeEventListener("scroll", medirFoco, true);
    };
  }, [medirFoco]);

  // Permite avanzar con el teclado (cómodo al probarlo desde un computador).
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onSalir(); return; }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSiguiente(); }
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onSiguiente, onSalir]);

  if (!actual) return null;

  const ultimo = paso >= pasos.length;
  const { artoLeft, globoDerecha, ancho } = calcularPosicion(recuadro, ventana.w);

  // Arto se pone al lado contrario del elemento destacado para no taparlo.
  const focoArriba = recuadro ? recuadro.top + recuadro.height / 2 < ventana.h * 0.5 : false;
  const top = !recuadro
    ? ventana.h * 0.42
    : focoArriba
      ? Math.min(recuadro.top + recuadro.height + 20, ventana.h - 240)
      : Math.max(recuadro.top - 210, 16);

  const globoLeft = globoDerecha ? artoLeft + ANCHO_ARTO + HUECO : artoLeft - HUECO - ancho;

  /*
   * El desplazamiento se hace con transiciones CSS y no con framer-motion a
   * propósito: framer interpola sobre requestAnimationFrame, y si la pestaña no
   * está visible no llega a escribir la posición final, dejando a Arto y al foco
   * clavados donde estaban. Con CSS el valor queda aplicado siempre.
   */
  const desliz = "top .42s cubic-bezier(.22,1,.36,1), left .42s cubic-bezier(.22,1,.36,1), width .42s cubic-bezier(.22,1,.36,1), height .42s cubic-bezier(.22,1,.36,1)";

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      {/* Fondo oscuro. Con foco se usa una sombra enorme alrededor del recuadro:
          así el hueco queda recortado sin necesidad de máscaras SVG. */}
      {recuadro ? (
        <div
          className="absolute rounded-2xl pointer-events-none"
          style={{
            top: recuadro.top - 6,
            left: recuadro.left - 6,
            width: recuadro.width + 12,
            height: recuadro.height + 12,
            transition: desliz,
            boxShadow: "0 0 0 9999px rgba(2, 6, 15, 0.9), 0 0 28px 2px rgba(0, 163, 255, 0.55)",
            border: "2px solid var(--tec-acento)",
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(2, 6, 15, 0.9)" }} />
      )}

      {/* El tour avanza tocando cualquier parte de la pantalla. */}
      <button className="absolute inset-0 w-full h-full cursor-default" onClick={onSiguiente} aria-label="Continuar" />

      {/* Arto. Se posiciona aparte del globo para poder quedar a la derecha de la
          pantalla cuando el elemento que explica está a ese lado. */}
      <div
        className="absolute pointer-events-none"
        style={{ top, left: artoLeft, width: ANCHO_ARTO, transition: desliz }}
      >
        {/* Resplandor detrás del personaje: sin esto se pierde contra el fondo oscuro. */}
        <div className="relative">
          <div
            className="absolute inset-0 -m-3 rounded-full blur-xl"
            style={{ background: "radial-gradient(circle, rgba(0,163,255,0.45) 0%, rgba(124,58,237,0.25) 45%, transparent 70%)" }}
          />
          <div className="relative" style={{ filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.8))" }}>
            <ArtoSprite mood={actual.mood} alto={ALTO_ARTO} />
          </div>
        </div>
      </div>

      {/* Globo tipo cómic: la punta apunta hacia Arto. */}
      <div
        className="absolute pointer-events-auto"
        style={{ top: top + 10, left: globoLeft, width: ancho, transition: desliz }}
      >
            <div className="relative rounded-2xl border-2 border-[var(--tec-acento)]/70 bg-[var(--tec-globo)] p-3.5 shadow-[0_10px_40px_-6px_rgba(0,0,0,0.9),0_0_30px_-10px_var(--tec-acento-glow)]">
              {/* Punta del globo (un cuadrado girado que continúa el borde), siempre
                  del lado en que está Arto. */}
              <span
                className={`absolute w-3 h-3 bg-[var(--tec-globo)] border-[var(--tec-acento)]/70 ${
                  globoDerecha ? "border-l-2 border-b-2" : "border-r-2 border-t-2"
                }`}
                style={{ [globoDerecha ? "left" : "right"]: -8, top: 22, transform: "rotate(45deg)" }}
                aria-hidden
              />

              <p className="text-[13.5px] leading-relaxed text-[var(--tec-texto)]">{actual.mensaje}</p>

              {/* El globo es angosto porque Arto ocupa su parte. Con `flex-wrap`, si
                  los puntos no caben junto a los botones bajan solos a otra línea en
                  vez de encimarse. */}
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 mt-3">
                <div className="flex gap-1 flex-shrink-0" aria-hidden>
                  {pasos.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1 rounded-full transition-all ${
                        i === paso - 1 ? "w-3 bg-[var(--tec-acento)]" : "w-1 bg-[var(--tec-borde)]"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                  {!ultimo && (
                    <button onClick={onSalir} className="text-[12px] font-medium text-[var(--tec-texto-3)] px-1 active:text-[var(--tec-texto-2)]">
                      Saltar
                    </button>
                  )}
                  <button
                    onClick={onSiguiente}
                    className="h-8 px-3.5 rounded-xl bg-[var(--tec-acento)] text-[var(--tec-sobre-acento)] text-[12.5px] font-bold active:scale-[0.98] transition-transform"
                  >
                    {ultimo ? "¡Entendido!" : "Siguiente"}
                  </button>
                </div>
              </div>
        </div>
      </div>
    </div>
  );
}

export default TecnicoTour;
