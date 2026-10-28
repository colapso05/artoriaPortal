import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";

// Inyectado en build por Vite (define). En dev es el timestamp del arranque del server.
declare const __APP_VERSION__: string;
declare const __BUILD_NUMBER__: number;

const POLL_MS = 5 * 60 * 1000; // revisar cada 5 minutos

/**
 * Mantiene la app actualizada sin depender de que el usuario recargue con F5.
 *
 * 1) Chequeo de version.json: compara la versión cargada con la del servidor. Cuando difieren,
 *    marca que hay actualización y la aplica SOLA al próximo cambio de sección (momento seguro:
 *    el operador ya terminó lo que hacía, no está escribiendo un mensaje). Además muestra un
 *    aviso discreto con botón "Actualizar ahora" como respaldo.
 * 2) Red de seguridad: si tras un deploy la app vieja intenta cargar un chunk que ya no existe,
 *    recarga automáticamente (con tope para no entrar en bucle).
 */
export function AppUpdater() {
  const [updateReady, setUpdateReady] = useState(false);
  const updateReadyRef = useRef(false);
  const location = useLocation();
  const prevNavKey = useRef<string | null>(null);

  // ── Red de seguridad: chunk viejo inexistente tras un deploy → recargar una vez ──
  useEffect(() => {
    const reloadOnce = () => {
      const KEY = "app_chunk_reload_at";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    };
    const onPreloadError = (e: Event) => { e.preventDefault?.(); reloadOnce(); };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String((e?.reason && ((e.reason as any).message || e.reason)) || "");
      if (/dynamically imported module|Loading chunk|Importing a module script failed/i.test(msg)) {
        reloadOnce();
      }
    };
    window.addEventListener("vite:preloadError", onPreloadError as EventListener);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("vite:preloadError", onPreloadError as EventListener);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // ── Chequeo de versión (solo en producción; en dev no existe version.json) ──
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let stopped = false;

    const check = async () => {
      if (stopped || updateReadyRef.current) return;
      try {
        const res = await fetch(`/version.json?_=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.version && data.version !== __APP_VERSION__) {
          updateReadyRef.current = true;
          setUpdateReady(true);
        }
      } catch {
        // Sin conexión o archivo ausente: ignorar, se reintenta en el próximo ciclo.
      }
    };

    check();
    const interval = setInterval(check, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);

  // ── Auto-recarga al cambiar de sección/ruta ──
  // Se usa solo la ruta + el parámetro `view` (la sección del dashboard). Deliberadamente NO
  // reacciona a ?conv=/?ticket=/?appt= (subselecciones dentro de una sección) para no recargar
  // mientras el operador navega entre conversaciones con un mensaje a medio escribir.
  useEffect(() => {
    const view = new URLSearchParams(location.search).get("view") ?? "";
    const key = `${location.pathname}|${view}`;
    if (prevNavKey.current === null) { prevNavKey.current = key; return; }
    if (key !== prevNavKey.current) {
      prevNavKey.current = key;
      if (updateReadyRef.current) window.location.reload();
    }
  }, [location.pathname, location.search]);

  if (!updateReady) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000] max-w-[92vw] w-max animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-xl px-4 py-3 shadow-2xl">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <RefreshCw className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">Hay una versión nueva del portal</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
            Se aplicará sola al cambiar de sección, o actualiza ahora.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex-shrink-0 text-xs font-bold uppercase tracking-wider bg-primary text-primary-foreground rounded-xl px-3 py-2 hover:bg-primary/90 transition-colors"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}

export default AppUpdater;
