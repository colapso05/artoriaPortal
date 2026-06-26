import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

// ── Monitoreo de errores JS — GlitchTip (self-hosted en errors.artoria.cl) ────
// Compatible con @sentry/react. DSN es público por diseño (va en el bundle del cliente).
Sentry.init({
  dsn: "https://7a1c87792ef24d08add417af0489a880@errors.artoria.cl/1",
  environment: import.meta.env.PROD ? "production" : "development",

  // Solo activo en producción — en desarrollo local no genera ruido en el panel
  enabled: import.meta.env.PROD,

  // Captura el 10% de sesiones para performance — suficiente para detectar cuellos de botella
  tracesSampleRate: 0.1,

  // Sin replay — los formularios de pago (MercadoPago) tienen datos de tarjeta sensibles
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Filtrar ruido conocido: ad-blockers bloqueando tracking de MP, errores de extensiones
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    /^Could not send event/,
    /ERR_BLOCKED_BY_CLIENT/,
    /^Non-Error promise rejection/,
    /^Script error/,
  ],

  beforeSend(event) {
    // Descartar errores que vienen del SDK interno de MercadoPago (no son nuestros)
    const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
    const fromMP = frames.some(f =>
      f.filename?.includes("mercadopago") ||
      f.filename?.includes("mlstatic") ||
      f.filename?.includes("cardPayment")
    );
    if (fromMP) return null;
    return event;
  },
});

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

createRoot(document.getElementById("root")!).render(<App />);
