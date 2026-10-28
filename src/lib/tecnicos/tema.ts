import { useCallback, useEffect, useState } from "react";

export type Tema = "oscuro" | "claro";

const CLAVE = "tec_tema";

/** Preferencia guardada; si no hay, la del sistema operativo. */
function temaInicial(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === "claro" || guardado === "oscuro") return guardado;
  } catch { /* modo privado: se usa la del sistema */ }
  const claro = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return claro ? "claro" : "oscuro";
}

/**
 * Tema del Portal Técnicos.
 *
 * Las variables viven en `:root[data-tema-tec=...]` (index.css) y no en un
 * contenedor, para que también alcancen a los toasts y overlays que React
 * monta fuera del árbol del portal. El atributo se quita al desmontar: el
 * resto del sitio tiene su propio tema y no debe verse afectado.
 */
export function useTemaTecnicos() {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.setAttribute("data-tema-tec", tema);

    // Barra del sistema del color del fondo (visible en la PWA instalada).
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previo = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", tema === "claro" ? "#EEF2F7" : "#050B14");

    return () => {
      raiz.removeAttribute("data-tema-tec");
      if (meta && previo !== null) meta.setAttribute("content", previo);
    };
  }, [tema]);

  const alternar = useCallback(() => {
    setTema(prev => {
      const siguiente: Tema = prev === "oscuro" ? "claro" : "oscuro";
      try { localStorage.setItem(CLAVE, siguiente); } catch { /* noop */ }
      return siguiente;
    });
  }, []);

  return { tema, alternar };
}
