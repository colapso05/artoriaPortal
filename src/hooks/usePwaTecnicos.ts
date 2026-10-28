import { useEffect } from "react";

/**
 * Prepara el Portal Técnicos para instalarse como app desde el navegador.
 *
 * El manifest y las meta de iOS se inyectan SOLO mientras esta pantalla está montada
 * (y se quitan al salir), para que el resto del sitio —la landing, el portal admin—
 * no quede instalable como "Artoria Técnicos" por error.
 */
export function usePwaTecnicos() {
  useEffect(() => {
    const creados: HTMLElement[] = [];

    const addTag = (tag: "link" | "meta", attrs: Record<string, string>) => {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
      creados.push(el);
      return el;
    };

    // Manifest de la app de técnicos
    addTag("link", { rel: "manifest", href: "/tecnicos.webmanifest", id: "tec-manifest" });

    // iOS: permite abrirla en pantalla completa desde el ícono de inicio.
    // La variante con prefijo `apple-` está obsoleta pero sigue siendo la única
    // que respetan las versiones de Safari en uso, así que van las dos.
    addTag("meta", { name: "mobile-web-app-capable", content: "yes" });
    addTag("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
    addTag("meta", { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" });
    addTag("meta", { name: "apple-mobile-web-app-title", content: "Técnicos" });
    addTag("link", { rel: "apple-touch-icon", href: "/apple-touch-icon.png" });

    // Barra del sistema del color del portal
    const themeColor = addTag("meta", { name: "theme-color", content: "#050B14" });

    // Registrar el service worker (habilita instalación en Android y push a futuro)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw-tecnicos.js", { scope: "/portal-tecnicos" })
        .catch(() => { /* sin SW la app sigue funcionando, solo no se instala en Android */ });
    }

    return () => {
      creados.forEach(el => el.remove());
      void themeColor;
    };
  }, []);
}
