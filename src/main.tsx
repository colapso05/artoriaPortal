import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

// ── Monitoreo de errores JS — compatible con GlitchTip / Sentry ──────────────
//
// El servidor que recibia esto (errors.artoria.cl) se dio de baja: no hay contenedor
// y el dominio no responde. Con el DSN quemado en el codigo, cada captureException
// intentaba una conexion que fallaba y ensuciaba la consola justo encima del error
// que uno queria leer.
//
// Ahora el DSN viene de VITE_SENTRY_DSN. Sin esa variable, Sentry queda inerte: no
// abre conexiones y no imprime nada, pero los captureException repartidos por el
// portal siguen compilando y no hay que tocarlos. Si algun dia vuelve a levantarse
// GlitchTip, se define la variable, se abre el CSP para ese dominio, y revive sin
// cambiar una linea de codigo.
//
// El DSN es publico por diseno: va en el bundle del cliente.
const DSN_ERRORES = import.meta.env.VITE_SENTRY_DSN as string | undefined;

Sentry.init({
  dsn: DSN_ERRORES || undefined,
  environment: import.meta.env.PROD ? "production" : "development",

  // Sin servidor configurado no se activa ni en produccion.
  enabled: import.meta.env.PROD && !!DSN_ERRORES,

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
