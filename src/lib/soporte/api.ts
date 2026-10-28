import { supabase } from "@/integrations/supabase/client";
import {
  MAX_ARCHIVO_MB, aBase64, pesaDemasiado, tipoDeArchivo,
  type Adjunto, type TipoAdjunto,
} from "./adjuntos";

/**
 * Capa de datos del chat de soporte web ("Arto").
 *
 * Existe para sacar la conversación de WhatsApp: desde octubre Meta cobra cada
 * mensaje por separado, y en la web no cuesta nada. El flujo del bot sigue siendo
 * el mismo de n8n; lo único que cambia es el canal por donde entra y sale el texto.
 *
 * Dos transportes posibles:
 *  - "directo": el navegador postea al webhook de n8n y este contesta en el mismo
 *    request (nodo "Respond to Webhook"). No necesita backend nuevo — es el modo
 *    para probar el flujo hoy mismo.
 *  - "proxy": pasa por la edge function `soporte-chat`, que valida el token, guarda
 *    el mensaje en `messages` y llama al webhook. Las respuestas (del bot y del
 *    técnico que tome el caso) llegan por Realtime. Es el modo definitivo.
 */

export const WEBHOOK_CHAT = "https://bot.artoria.cl/webhook/test-chat";

export type Transporte = "directo" | "proxy";
export const TRANSPORTE: Transporte = "directo";

/** El bot puede demorar en responder; más allá de esto se da por caído. */
const TIMEOUT_MS = 45_000;

export interface SesionSoporte {
  /** Token del link que se le mandó al cliente por WhatsApp (?t=...). */
  token: string;
  nombre: string | null;
  /** Teléfono enmascarado solo para mostrar (+56 9 •••• 1234); nunca el completo. */
  telefonoVisible: string | null;
  waId: string | null;
  companyId: string | null;
  conversationId: string | null;
}

export interface MensajeChat {
  id: string;
  origen: "cliente" | "arto";
  texto: string;
  /** ISO. */
  hora: string;
  estado?: "enviando" | "enviado" | "error";
  /** Nombre del técnico cuando responde una persona en vez del bot. */
  autor?: string | null;
  /** Foto, audio, video o documento que acompaña al mensaje. */
  adjunto?: Adjunto;
}

/** Lo que manda el cliente: texto, un archivo, o ambos (el texto va como pie). */
export interface Envio {
  texto: string;
  archivo?: File | null;
}

export function nuevoId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/**
 * Identificador de esta visita. Se genera al cargar la página y **no se guarda**.
 *
 * Deliberadamente no persiste: si sobreviviera a la recarga, el agente retomaría
 * la conversación anterior y el cliente que vuelve por un problema nuevo se
 * encontraría con el hilo del anterior. El registro permanente vive en el portal,
 * no en el navegador del cliente.
 */
const ID_VISITA = nuevoId();

export function idVisitante(): string {
  return ID_VISITA;
}

/** Lo que devuelve la edge function `soporte-session`. */
interface RespuestaSesion {
  error?: string;
  name?: string | null;
  phone_masked?: string | null;
  wa_id?: string | null;
  company_id?: string | null;
  conversation_id?: string | null;
}

/**
 * Traduce el token del link al cliente que hay detrás.
 * Si no hay token, o el backend aún no tiene la función, devuelve null y el chat
 * funciona igual: Arto le pedirá el número dentro de la conversación.
 */
export async function resolverSesion(token: string | null): Promise<SesionSoporte | null> {
  if (!token) return null;

  /*
   * Si la función `soporte-session` no existe o falla, igual se conserva el token.
   *
   * Antes se devolvía null y con eso se perdía: el chat seguía funcionando, pero
   * todos los mensajes salían con `token: null` y n8n no tenía cómo saber qué
   * cliente escribía. Lo único que se pierde sin esa función son el nombre y el
   * teléfono para mostrar, no la identidad de la conversación.
   */
  const soloToken: SesionSoporte = {
    token, nombre: null, telefonoVisible: null, waId: null, companyId: null, conversationId: null,
  };

  try {
    const { data, error } = await supabase.functions.invoke("soporte-session", {
      body: { token, device: idVisitante() },
    });
    const d = (data ?? {}) as RespuestaSesion;
    if (error || !data || d.error) return soloToken;

    return {
      token,
      nombre: d.name ?? null,
      telefonoVisible: d.phone_masked ?? null,
      waId: d.wa_id ?? null,
      companyId: d.company_id ?? null,
      conversationId: d.conversation_id ?? null,
    };
  } catch {
    return soloToken;
  }
}

/**
 * Avisa al flujo de n8n que el cliente abrió el link, y devuelve el saludo con
 * que arranca la conversación.
 *
 * Va con `message: ""` a propósito: así el workflow lo reconoce como apertura
 * (`es_apertura`) y contesta retomando lo que se venía hablando por WhatsApp, en
 * vez del saludo genérico. Marca además el link como abierto en la base.
 */
export async function abrirConversacion(sesion: SesionSoporte | null): Promise<RespuestaChat> {
  return enviarMensaje({ texto: "" }, sesion);
}

/**
 * Cómo viaja un archivo dentro del mensaje.
 * En modo "proxy" se sube primero y va solo la `url`; en "directo" viaja el
 * contenido en base64, que es lo que n8n puede convertir a binario sin backend.
 */
interface MediaPayload {
  file_name: string;
  mime_type: string;
  size: number;
  kind: TipoAdjunto;
  url?: string;
  data_base64?: string;
}

/** Lo que devuelve el flujo tras cada mensaje. */
export interface RespuestaChat {
  textos: string[];
  /**
   * Conversación en la base, para escuchar por Realtime lo que escriba el
   * especialista. Llega null hasta que el cliente entrega su teléfono: sin
   * número no hay a quién asociar el hilo.
   */
  conversationId: string | null;
  /**
   * JWT corto que autoriza a leer SOLO esta conversación.
   *
   * El `conversation_id` viaja al navegador y no es un secreto, así que no sirve
   * como credencial: cualquiera con ese id leería la conversación entera. El
   * token va firmado por el servidor y lleva la conversación adentro, y la
   * política de la base solo deja leer la que el token declara.
   *
   * Llega uno nuevo con cada mensaje, así que no alcanza a vencerse.
   */
  realtimeToken: string | null;
}

/** Envía el mensaje del cliente y devuelve las respuestas inmediatas del bot. */
export async function enviarMensaje(envio: Envio, sesion: SesionSoporte | null): Promise<RespuestaChat> {
  const media = envio.archivo ? await prepararMedia(envio.archivo, sesion) : null;

  const cuerpo = {
    source: "web",
    session_id: idVisitante(),
    token: sesion?.token ?? null,
    wa_id: sesion?.waId ?? null,
    company_id: sesion?.companyId ?? null,
    conversation_id: sesion?.conversationId ?? null,
    message: envio.texto,
    media,
    sent_at: new Date().toISOString(),
  };

  if (TRANSPORTE === "proxy") {
    const { data, error } = await supabase.functions.invoke("soporte-chat", { body: cuerpo });
    if (error) throw new Error("No se pudo enviar el mensaje.");
    // En este modo la respuesta suele llegar por Realtime, así que puede venir vacía.
    return interpretar(data);
  }

  const corte = new AbortController();
  const temporizador = setTimeout(() => corte.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(WEBHOOK_CHAT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: corte.signal,
    });
    if (!res.ok) throw new Error(`webhook respondió ${res.status}`);

    const crudo = (await res.text()).trim();
    return crudo ? interpretar(parsear(crudo)) : { textos: [], conversationId: null, realtimeToken: null };
  } finally {
    clearTimeout(temporizador);
  }
}

/** Deja el archivo listo para viajar según el transporte activo. */
async function prepararMedia(archivo: File, sesion: SesionSoporte | null): Promise<MediaPayload> {
  if (pesaDemasiado(archivo)) {
    throw new Error(`El archivo supera los ${MAX_ARCHIVO_MB} MB.`);
  }

  const comun = {
    file_name: archivo.name,
    mime_type: archivo.type || "application/octet-stream",
    size: archivo.size,
    kind: tipoDeArchivo(archivo.type, archivo.name),
  };

  if (TRANSPORTE === "proxy") {
    return { ...comun, url: await subirArchivo(archivo, sesion) };
  }
  return { ...comun, data_base64: await aBase64(archivo) };
}

/**
 * Sube el archivo al bucket `whatsapp_media` — el mismo que ya usa la bandeja de
 * los operadores, para que el adjunto se vea igual desde el portal.
 *
 * Pasa por la edge function `soporte-upload` y no por el cliente de Storage: el
 * visitante no tiene sesión de Supabase, y abrir el bucket a escritura anónima
 * sería un buzón abierto para cualquiera.
 */
export async function subirArchivo(archivo: File, sesion: SesionSoporte | null): Promise<string> {
  const { data, error } = await supabase.functions.invoke("soporte-upload", {
    body: {
      token: sesion?.token ?? null,
      session_id: idVisitante(),
      conversation_id: sesion?.conversationId ?? null,
      file_name: archivo.name,
      mime_type: archivo.type || "application/octet-stream",
      size: archivo.size,
      data_base64: await aBase64(archivo),
    },
  });

  const url = (data as { url?: string } | null)?.url;
  if (error || !url) throw new Error("No se pudo subir el archivo.");
  return url;
}

/** Fila de `messages` tal como llega por Realtime. */
interface FilaMensaje {
  id: string;
  direction: string | null;
  content: string | null;
  created_at: string | null;
  sender_name: string | null;
  media_url: string | null;
  media_type: string | null;
  message_type: string | null;
}

/**
 * Escucha las respuestas que el bot o un técnico escriben en la conversación.
 * Solo aplica en modo "proxy", con una conversación ya creada en la BD.
 */
export function escucharMensajes(
  conversationId: string,
  realtimeToken: string | null,
  alLlegar: (m: MensajeChat) => void,
) {
  /*
   * Realtime aplica RLS igual que una consulta normal, y el visitante de la web no
   * tiene sesión: sin credencial no ve ninguna fila y la suscripción queda muda,
   * sin error. El token firmado que entrega el servidor es lo que la autoriza, y
   * solo para esta conversación.
   */
  if (realtimeToken) {
    try {
      supabase.realtime.setAuth(realtimeToken);
    } catch (e) {
      console.warn("[soporte] No se pudo autorizar Realtime:", e);
    }
  }

  const canal = supabase
    .channel(`soporte:${conversationId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      payload => {
        const fila = payload.new as FilaMensaje;
        // Los entrantes son los del propio cliente: ya están pintados en pantalla.
        if (fila.direction === "inbound") return;
        alLlegar({
          id: fila.id,
          origen: "arto",
          texto: fila.content ?? "",
          hora: fila.created_at ?? new Date().toISOString(),
          autor: fila.sender_name ?? null,
          adjunto: fila.media_url ? adjuntoDeFila(fila) : undefined,
        });
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(canal); };
}

/** Adjunto de un mensaje que llega desde la BD (lo mandó el bot o un técnico). */
function adjuntoDeFila(fila: FilaMensaje): Adjunto {
  const url = fila.media_url!;
  const nombre = decodeURIComponent(url.split("/").pop() ?? "archivo").split("?")[0];
  const mime = fila.media_type ?? "";
  // `message_type` de WhatsApp ya trae la pista cuando no viene el MIME.
  const porTipo = (fila.message_type ?? "").toLowerCase();
  const tipo = mime || !porTipo
    ? tipoDeArchivo(mime, nombre)
    : tipoDeArchivo(`${porTipo === "short_video" ? "video" : porTipo}/*`, nombre);

  return { url, tipo, nombre, mime, tamano: 0 };
}

/* ─── Interpretación de la respuesta de n8n ──────────────────────────────────
 * El nodo "Respond to Webhook" puede devolver texto plano, un objeto o un array,
 * y la clave del texto cambia según cómo esté armado el flujo. En vez de exigir
 * un formato, se buscan las claves habituales y se aceptan varios mensajes.
 */

const CLAVES_TEXTO = ["reply", "respuesta", "output", "text", "message", "mensaje", "answer", "content"];

function parsear(crudo: string): unknown {
  try {
    return JSON.parse(crudo);
  } catch {
    return crudo;
  }
}

/**
 * Separa el texto del agente de los datos que vienen con él.
 *
 * El texto se sigue buscando de forma tolerante (el flujo puede devolver string,
 * objeto o array); `conversation_id` en cambio tiene un nombre fijo, así que se
 * busca en el primer nivel y, si la respuesta vino envuelta en un array, dentro
 * de su primer elemento — que es como los devuelve n8n.
 */
function interpretar(valor: unknown): RespuestaChat {
  const textos = normalizarRespuesta(valor);
  const raiz = Array.isArray(valor) ? valor[0] : valor;
  const campo = (nombre: string): string | null => {
    if (!raiz || typeof raiz !== "object") return null;
    const v = (raiz as Record<string, unknown>)[nombre];
    return typeof v === "string" && v ? v : null;
  };

  return {
    textos,
    conversationId: campo("conversation_id"),
    realtimeToken: campo("realtime_token"),
  };
}

function normalizarRespuesta(valor: unknown): string[] {
  if (valor == null) return [];
  if (typeof valor === "string") {
    const limpio = valor.trim();
    return limpio ? [limpio] : [];
  }
  if (Array.isArray(valor)) return valor.flatMap(normalizarRespuesta);
  if (typeof valor === "object") {
    for (const clave of CLAVES_TEXTO) {
      const dentro = (valor as Record<string, unknown>)[clave];
      if (dentro != null) return normalizarRespuesta(dentro);
    }
  }
  return [];
}
