import { supabase } from "@/integrations/supabase/client";

/**
 * Notificaciones push del Portal Técnicos vía OneSignal (Web Push).
 *
 * Usa la misma cuenta y App ID que la app Android, así el trigger del backend
 * sirve para ambas plataformas sin distinguir el origen.
 *
 * El App ID es público por diseño (va en el código del cliente en cualquier
 * integración web de OneSignal) — no es un secreto.
 */
const ONESIGNAL_APP_ID = "577d115f-604a-449d-b0e5-67a0aa061e8c";
/** Identificador para Safari, generado por OneSignal al configurar la plataforma web. */
const SAFARI_WEB_ID = "web.onesignal.auto.48d9c6a2-4943-4221-b17b-a4e235bf1c7d";
const SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";

/** Scope del service worker del portal — debe coincidir con el de usePwaTecnicos. */
const SW_SCOPE = "/portal-tecnicos";
const SW_PATH = "sw-tecnicos.js";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: any) => void | Promise<void>>;
  }
}

let sdkCargado = false;
/** Resultado de la inicialización, para no pedir permiso sobre un SDK que no arrancó. */
let initPromesa: Promise<boolean> | null = null;
/**
 * El SDK solo admite un `init()` por carga de página: el segundo lanza error.
 *
 * Hace falta recordarlo aparte de `initPromesa` porque al cerrar sesión esa
 * promesa se descarta para que el siguiente técnico se vincule de nuevo, pero el
 * SDK sigue inicializado en la misma página (el portal es una SPA y no recarga).
 */
let sdkIniciado = false;
/**
 * Técnico vinculado ahora mismo. El listener de cambios lo consulta al vuelo en
 * vez de capturarlo, para no guardar el id de suscripción bajo un técnico que ya
 * cerró sesión en este navegador.
 */
let tecnicoActual: string | null = null;

/** Si el SDK no carga (origen no autorizado, red caída, bloqueador) nada de esto llega. */
const LIMITE_INIT_MS = 10_000;
/** Red de seguridad por si el diálogo del navegador nunca devuelve una respuesta. */
const LIMITE_PERMISO_MS = 60_000;

/**
 * Resuelve con `siTarda` si la promesa no termina a tiempo.
 *
 * Es lo que impide que la interfaz quede colgada: sin esto, un `init` que nunca
 * responde dejaba el botón "Activar" girando indefinidamente.
 */
function conLimite<T>(p: Promise<T>, ms: number, siTarda: T): Promise<T> {
  return new Promise(resolve => {
    let resuelto = false;
    const terminar = (v: T) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(temporizador);
      resolve(v);
    };
    const temporizador = setTimeout(() => terminar(siTarda), ms);
    p.then(terminar, () => terminar(siTarda));
  });
}

/** Inyecta el SDK de OneSignal una sola vez. */
function cargarSdk(alFallar?: () => void): void {
  if (sdkCargado || document.getElementById("onesignal-sdk")) return;
  sdkCargado = true;
  const s = document.createElement("script");
  s.id = "onesignal-sdk";
  s.src = SDK_URL;
  s.defer = true;
  // Si el CDN está bloqueado o caído, cortar de inmediato en vez de dejar al
  // técnico diez segundos mirando "Activando..." hasta que salte el tiempo límite.
  s.onerror = () => {
    console.warn("[push] No se pudo descargar el SDK de OneSignal");
    alFallar?.();
  };
  document.head.appendChild(s);
}

/**
 * iOS solo permite notificaciones push si la web fue instalada en la pantalla de
 * inicio y se abre desde ahí (restricción de Apple desde iOS 16.4). En Safari
 * normal no hay forma de recibirlas.
 */
export function esIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** True si la PWA está corriendo instalada (no en una pestaña normal del navegador). */
export function estaInstalada(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
}

/** True si este dispositivo puede recibir push en su estado actual. */
export function puedeRecibirPush(): boolean {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  // En iPhone/iPad hace falta tenerla instalada en la pantalla de inicio.
  if (esIOS() && !estaInstalada()) return false;
  return true;
}

/**
 * Inicializa OneSignal y vincula la suscripción con el técnico.
 *
 * Se usa `login(tecnicoId)` para asociar el dispositivo al técnico mediante el
 * External ID de OneSignal: así un mismo técnico puede tener la app Android y el
 * portal web a la vez y recibir la notificación en ambos, sin que un dispositivo
 * pise al otro.
 *
 * El backend envía por External ID (`include_aliases`), así que el envío ya no
 * depende del player_id. El ID de suscripción se sigue guardando en `technicians`
 * solo como dato de diagnóstico: esa columna guarda una sola suscripción, y entre
 * la web y la app Android se pisan la una a la otra.
 */
export function iniciarPush(tecnicoId: string): Promise<boolean> {
  if (!puedeRecibirPush()) return Promise.resolve(false);
  if (initPromesa) return initPromesa;

  window.OneSignalDeferred = window.OneSignalDeferred || [];

  const arranque = new Promise<boolean>(resolve => {
    cargarSdk(() => resolve(false));

    window.OneSignalDeferred!.push(async (OneSignal: any) => {
    try {
      tecnicoActual = tecnicoId;

      if (!sdkIniciado) {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          safari_web_id: SAFARI_WEB_ID,
          // El worker es el del portal (sw-tecnicos.js), que ya importa el SDK de OneSignal.
          // No se usa el OneSignalSDKWorker.js por defecto en la raíz: dos service workers
          // con distinto scope se pisarían y el de /portal-tecnicos ganaría, dejando la
          // suscripción de push atada a un worker que no controla estas páginas.
          serviceWorkerPath: SW_PATH,
          serviceWorkerParam: { scope: SW_SCOPE },
          // El aviso para activar notificaciones es propio (TecnicoPushBanner), integrado
          // al diseño del portal — la campanita flotante de OneSignal sería un segundo
          // control compitiendo por lo mismo.
          notifyButton: { enable: false },
          allowLocalhostAsSecureOrigin: true,
        });
        sdkIniciado = true;

        // Guardar el ID de suscripción cuando esté disponible. No se lee de forma
        // directa porque tarda en registrarse contra los servidores de OneSignal:
        // leerlo al instante suele devolver vacío.
        OneSignal.User.PushSubscription.addEventListener("change", () => {
          void guardarSuscripcion(OneSignal);
        });
      }

      /*
       * `login()` va siempre, también cuando el SDK ya estaba inicializado.
       *
       * Al cerrar sesión se llama a `logout()`, que deja la suscripción colgando
       * de un usuario anónimo, sin el External ID del técnico. Como el portal es
       * una SPA y no recarga al volver a entrar, si esto quedara dentro del
       * `init()` el dispositivo nunca se revincularía: el backend envía por
       * External ID y no tendría a quién entregarle, con el permiso concedido y
       * todo.
       */
      await OneSignal.login(tecnicoId);

      /*
       * Reactivar la suscripción cuando el navegador ya concede el permiso pero
       * OneSignal la tiene dada de baja (`notification_types` negativo).
       *
       * Queda así al desinstalar la PWA, al limpiar los datos del sitio o tras un
       * logout, y sin esto es un callejón sin salida: el banner de activación no
       * se muestra justamente porque el permiso está concedido, así que nada
       * vuelve a llamar a `optIn()` y el dispositivo no recibe nada nunca más.
       */
      if (permisoConcedido() && OneSignal.User?.PushSubscription?.optedIn === false) {
        try {
          await OneSignal.User.PushSubscription.optIn();
        } catch (e) {
          console.warn("[push] No se pudo reactivar la suscripción:", e);
        }
      }

      // Por si ya estaba suscrito de una sesión anterior
      await guardarSuscripcion(OneSignal);
      resolve(true);
    } catch (e) {
      // Sin push la app sigue funcionando: las notificaciones son un extra.
      console.warn("[push] No se pudo inicializar OneSignal:", e);
      resolve(false);
    }
    });
  });

  initPromesa = conLimite(arranque, LIMITE_INIT_MS, false);
  return initPromesa;
}

/**
 * Pide permiso de notificaciones (debe dispararse desde un gesto del usuario).
 *
 * Devuelve `false` en vez de quedarse esperando cuando OneSignal no llegó a
 * inicializarse: pedir el permiso sobre un SDK a medias deja la promesa pendiente
 * para siempre, que es lo que hacía girar el botón sin parar.
 */
export async function pedirPermisoPush(): Promise<boolean> {
  if (!puedeRecibirPush()) return false;

  const listo = await (initPromesa ?? Promise.resolve(false));
  if (!listo) return false;

  const pedir = new Promise<boolean>(resolve => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        await OneSignal.Notifications.requestPermission();

        /*
         * Conceder el permiso del navegador no basta si la suscripción quedó marcada
         * como dada de baja en OneSignal (`notification_types` negativo). En ese
         * estado el SDK guarda las claves pero no registra el endpoint de entrega, así
         * que OneSignal acepta el envío y no tiene a dónde mandarlo. `optIn()` es lo
         * que la vuelve a dar de alta.
         */
        try {
          await OneSignal.User?.PushSubscription?.optIn?.();
        } catch (e) {
          console.warn("[push] No se pudo reactivar la suscripción:", e);
        }

        resolve(OneSignal.Notifications.permission === true);
      } catch {
        resolve(false);
      }
    });
  });

  // Si el técnico ignora el diálogo del navegador, el botón debe soltarse igual.
  return conLimite(pedir, LIMITE_PERMISO_MS, permisoConcedido());
}

/** True si el técnico ya aceptó recibir notificaciones. */
export function permisoConcedido(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

/** Guarda la suscripción actual bajo el técnico que tenga la sesión abierta. */
async function guardarSuscripcion(OneSignal: any): Promise<void> {
  const id = OneSignal.User?.PushSubscription?.id;
  if (id && tecnicoActual) await guardarPlayerId(tecnicoActual, id);
}

/** Persiste el ID de suscripción para que el backend pueda enviarle push. */
async function guardarPlayerId(tecnicoId: string, playerId: string): Promise<void> {
  try {
    await (supabase as any)
      .from("technicians")
      .update({ onesignal_player_id: playerId })
      .eq("id", tecnicoId);
  } catch (e) {
    console.warn("[push] No se pudo guardar el player id:", e);
  }
}

/** Desvincula el dispositivo al cerrar sesión, para que no reciba avisos ajenos. */
export async function cerrarPush(): Promise<void> {
  // Se olvida el arranque anterior para que el siguiente técnico que entre en este
  // navegador vuelva a vincularse en vez de heredar el resultado del anterior.
  // `sdkIniciado` NO se toca: el SDK sigue vivo en esta página y volver a
  // inicializarlo lanza error.
  initPromesa = null;
  tecnicoActual = null;
  try {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try { await OneSignal.logout(); } catch { /* noop */ }
    });
  } catch { /* noop */ }
}
