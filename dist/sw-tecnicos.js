/*
 * Service worker del Portal Técnicos.
 *
 * Cumple dos funciones:
 *  1. Habilitar la instalación como app (Android Chrome exige un service worker
 *     con manejador de `fetch`).
 *  2. Recibir las notificaciones push de OneSignal.
 *
 * El SDK de OneSignal se importa aquí en vez de registrar un worker aparte: dos
 * service workers compitiendo por el mismo scope se pisan entre sí. Este import
 * es el método que la propia documentación de OneSignal indica para sitios que ya
 * tienen su propio worker — OneSignal registra internamente sus manejadores de
 * `push` y `notificationclick`, por eso aquí no se definen (duplicarlos mostraría
 * la notificación dos veces).
 */
/*
 * Va protegido a propósito. Si el CDN de OneSignal no responde —sin conexión, un
 * bloqueador de anuncios, o la red de un cliente que lo filtre— `importScripts`
 * lanza y el service worker entero queda sin evaluar. Como este worker maneja
 * `fetch`, eso tumbaba TODAS las peticiones de la página, no solo el push.
 * Sin OneSignal el portal funciona igual; lo único que se pierde son los avisos.
 */
try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (e) {
  console.warn("[sw-tecnicos] OneSignal no disponible, se sigue sin push:", e);
}

/*
 * DELIBERADAMENTE NO CACHEA NADA. El portal ya tiene auto-actualización por versión
 * (ver src/components/AppUpdater.tsx); un service worker cacheando HTML o JS
 * reintroduciría el problema de usuarios atrapados en una versión vieja.
 */

self.addEventListener("install", () => {
  // Activar de inmediato, sin esperar a que se cierren las pestañas viejas.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Tomar control de las pestañas abiertas y limpiar cachés de versiones anteriores.
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

/*
 * Chrome exige que exista un manejador de `fetch` para considerar la web
 * instalable, pero no exige que responda. Este no llama a `respondWith` a
 * propósito: así cada petición sigue su camino normal por el navegador.
 *
 * Antes hacía `event.respondWith(fetch(event.request))`, y ahí estaba el
 * problema: si esa promesa se rechazaba —red caída, un recurso bloqueado— el
 * navegador convertía la petición en un error de red en vez de aplicar su
 * manejo propio, y además dejaba un rechazo sin capturar por cada recurso.
 */
self.addEventListener("fetch", () => {
  // Sin respondWith: passthrough nativo.
});
