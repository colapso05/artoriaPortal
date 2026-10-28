import * as Sentry from "@sentry/react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Por dónde sale un mensaje al cliente.
 *
 * - `ycloud`: API oficial de Meta. Cuesta ~$20 CLP por mensaje y es la única que
 *   puede mandar plantillas.
 * - `evolution`: sesión de WhatsApp Web (Baileys). Sin costo, pero se desconecta
 *   sola cuando el teléfono se apaga o WhatsApp desvincula el dispositivo.
 */
export type Proveedor = "ycloud" | "evolution";

export const ES_PROVEEDOR = (v: unknown): v is Proveedor => v === "ycloud" || v === "evolution";

/** Nombre de la edge function de cada canal. Son endpoints distintos, no un parámetro. */
export const FUNCION_ENVIO: Record<Proveedor, string> = {
  ycloud: "ycloud-send",
  evolution: "evolution-send",
};

export interface CuerpoEnvio {
  to: string;
  message: string | null;
  conversationId: string;
  senderName?: string;
  mediaUrl?: string;
  mediaType?: string;
  /**
   * Nombre original del archivo, con su extensión.
   *
   * Es lo que ve el cliente en WhatsApp. Sin esto el backend lo deduce de la URL
   * y le llega algo como `1756_a3f9.pdf`, que no dice qué es ni de qué caso.
   */
  fileName?: string;
}

export interface ResultadoEnvio {
  ok: boolean;
  /**
   * La sesión de Baileys se cayó (HTTP 409). No es un error del operador ni del
   * mensaje: lo mismo sale bien por el canal oficial, así que quien llame debe
   * ofrecer el reenvío en vez de mostrar un error rojo.
   */
  sesionCaida?: boolean;
  /**
   * Fallo de transporte: no hubo respuesta (red caída, timeout, CORS). No es un
   * rechazo del proveedor, pero para el fallback cuenta igual: el mensaje no salió.
   */
  red?: boolean;
  /** Estado que informe el servidor en un 200 (`open`, `close`, `connecting`…). */
  estado?: string | null;
  /** HTTP del error, cuando se pudo leer. */
  status?: number;
  mensaje?: string;
}

/**
 * Lee el cuerpo del error de una edge function.
 *
 * `functions.invoke` no expone el JSON del error directamente: hay que sacarlo de
 * la Response que viene en `context`. Sin esto, un 409 de sesión caída se ve igual
 * que cualquier otro fallo y se pierde la única señal que permite reaccionar bien.
 */
export async function detalleDelError(error: any): Promise<{ status?: number; cuerpo?: any }> {
  const ctx = error?.context;
  if (!ctx || typeof ctx.json !== "function") return {};
  const cuerpo = await ctx.json().catch(() => undefined);
  return { status: ctx.status, cuerpo };
}

export async function enviarPorCanal(proveedor: Proveedor, body: CuerpoEnvio): Promise<ResultadoEnvio> {
  let data: any = null;
  let error: any = null;
  try {
    const r = await supabase.functions.invoke(FUNCION_ENVIO[proveedor], { body });
    data = r.data;
    error = r.error;
  } catch (e: any) {
    // `invoke` puede lanzar en vez de devolver `{ error }` cuando no hay respuesta
    // (red caída, timeout). Sin este catch el que llama se queda con la burbuja
    // optimista puesta y sin forma de saber que el mensaje no salió.
    Sentry.captureException(e, { tags: { area: "envio", proveedor, motivo: "transporte" } });
    return { ok: false, red: true, mensaje: e?.message ?? "No hubo respuesta del servidor." };
  }
  if (!error) {
    /*
     * El canal sin costo puede contestar 200 con la sesión ya caída. Si informa un
     * estado distinto de `open`, el mensaje no salió: se trata como caída para que
     * el fallback al oficial se dispare igual que con un 409.
     */
    const estado = proveedor === "evolution" && data && typeof data === "object"
      ? (data.state ?? data.estado ?? data.instance?.state ?? null)
      : null;
    if (proveedor === "evolution" && estado && estado !== "open") {
      return { ok: false, sesionCaida: true, estado, mensaje: "La sesión de WhatsApp no está conectada." };
    }
    return { ok: true, estado };
  }

  const { status, cuerpo } = await detalleDelError(error);
  if (proveedor === "evolution" && (status === 409 || cuerpo?.error === "sesion_caida")) {
    return {
      ok: false,
      sesionCaida: true,
      status,
      estado: cuerpo?.state ?? null,
      mensaje: cuerpo?.detail ?? "La sesión de WhatsApp no está conectada.",
    };
  }
  /*
   * Un envio que falla se muestra en un toast y ahi muere. El SDK de errores solo
   * ve lo que nadie atrapa, y por eso el panel estaba en cero: los fallos que
   * importan estan todos atrapados. Este se reporta a mano.
   *
   * La sesion caida no entra: es un estado esperado del canal sin costo, no un
   * error, y llenaria el panel de ruido.
   */
  Sentry.captureException(error, {
    tags: { area: "envio", proveedor },
    extra: { status, cuerpo },
  });
  return { ok: false, mensaje: cuerpo?.error ?? cuerpo?.detail ?? error.message ?? "Error al enviar" };
}

/** Canal guardado para esta conversación. La RPC resuelve la cascada y nunca devuelve null. */
export async function canalDeConversacion(conversationId: string): Promise<Proveedor> {
  const { data, error } = await (supabase as any).rpc("canal_de_conversacion", {
    p_conversation_id: conversationId,
  });
  return !error && ES_PROVEEDOR(data) ? data : "ycloud";
}

export interface CambioCanal {
  ok: boolean;
  /** Lo que quedó guardado: un canal, o "auto" si sigue el default de la empresa. */
  provider?: string;
  /** Qué canal le toca ahora de verdad, una vez resuelta la cascada. */
  efectivo?: Proveedor;
  error?: string;
}

/** Guarda el canal en la conversación, para que el resto del equipo vea lo mismo. */
export async function fijarCanalConversacion(conversationId: string, proveedor: ProveedorElegible): Promise<CambioCanal> {
  const { data, error } = await (supabase as any).rpc("conversacion_set_canal", {
    p_conversation_id: conversationId,
    p_provider: proveedor,
  });
  if (error) return { ok: false, error: error.message };
  if (!data || typeof data !== "object") return { ok: false, error: "respuesta_inesperada" };
  return data as CambioCanal;
}

/* ── Sesión de WhatsApp Web (vinculación por QR) ─────────────────────────── */

export interface EstadoEvolution {
  ok: boolean;
  /** La empresa tiene el canal contratado. Si es false, no se muestra nada. */
  enabled: boolean;
  instancia?: string | null;
  /** 'open' vinculada · 'connecting' esperando el escaneo · 'close' sin sesión. */
  state?: string | null;
  numero?: string | null;
  desde?: string | null;
  /**
   * `enabled && state === 'open'`. Es la única condición para poder mandar por el
   * canal sin costo — no alcanza con que la empresa lo tenga contratado.
   */
  usable: boolean;
  /**
   * Versión de Evolution corriendo y cuándo se actualizó por última vez.
   *
   * Opcionales: cuando WhatsApp cambia su protocolo, el canal deja de funcionar
   * hasta que se aplica una actualización a mano en el servidor, y sin este dato
   * no hay forma de saber desde el portal si el parche ya está puesto.
   */
  version?: string | null;
  actualizado_en?: string | null;
  /** Canal por defecto configurado para la empresa. */
  canal_default?: string | null;
  /**
   * Por dónde saldrían los mensajes ahora mismo. Puede diferir de `canal_default`:
   * si el default es "evolution" y la sesión está caída, esto dice "ycloud".
   * Se usa tal cual en vez de deducirlo — si cambia la cascada, el panel no miente.
   */
  canal_efectivo?: string | null;
}

const SIN_CANAL: EstadoEvolution = { ok: false, enabled: false, usable: false };

/**
 * Estado de la sesión. Va por RPC a propósito: `company_config` guarda el token de
 * la instancia y no debe leerse desde el cliente.
 */
export async function evolutionEstado(companyId: string): Promise<EstadoEvolution> {
  const { data, error } = await (supabase as any).rpc("evolution_estado", { p_company_id: companyId });
  if (error || !data || typeof data !== "object") return SIN_CANAL;
  return data as EstadoEvolution;
}

export interface RespuestaVinculo {
  ok: boolean;
  state?: string;
  qr?: string;
  expiraEnSegundos?: number;
  yaVinculado?: boolean;
  error?: string;
}

export async function evolutionVincular(
  companyId: string,
  action: "connect" | "logout" | "restart",
): Promise<RespuestaVinculo> {
  const { data, error } = await supabase.functions.invoke("evolution-link", { body: { action, companyId } });
  if (!error) return (data ?? { ok: true }) as RespuestaVinculo;

  const { status, cuerpo } = await detalleDelError(error);
  if (status === 403 || cuerpo?.error === "sin_permiso") {
    return { ok: false, error: "No tienes permiso para administrar la sesión de esta empresa." };
  }
  return { ok: false, error: cuerpo?.error ?? cuerpo?.detail ?? error.message ?? "No se pudo contactar al servidor." };
}

/* ── Editar y borrar un mensaje ya enviado (sólo canal sin costo) ────────── */

/**
 * La API oficial de Meta no permite tocar un mensaje entregado, así que estas dos
 * acciones existen únicamente para `evolution`. El servidor vuelve a validar
 * empresa, sesión y la ventana de tiempo; acá sólo se traduce la respuesta.
 */
export interface ResultadoEdicion {
  ok: boolean;
  /** Texto que quedó en WhatsApp según el servidor. */
  content?: string;
  /** Pasaron más de 15 minutos: WhatsApp ya no deja editar. */
  fueraDeVentana?: boolean;
  /** La sesión de Baileys se cayó; no es culpa del mensaje. */
  sesionCaida?: boolean;
  mensaje?: string;
}

export async function editarMensajeEvolution(messageId: string, newText: string): Promise<ResultadoEdicion> {
  try {
    const { data, error } = await supabase.functions.invoke("evolution-edit-message", {
      body: { messageId, newText },
    });
    if (!error) return { ok: true, content: (data as { content?: string } | null)?.content };

    const { status, cuerpo } = await detalleDelError(error);
    const detalle = cuerpo?.detail ?? cuerpo?.error ?? error.message ?? "No se pudo editar el mensaje.";
    return {
      ok: false,
      fueraDeVentana: cuerpo?.error === "fuera_de_ventana",
      sesionCaida: status === 409 || status === 401 || cuerpo?.error === "sesion_caida",
      mensaje: detalle,
    };
  } catch (e: any) {
    return { ok: false, mensaje: e?.message ?? "No se pudo editar el mensaje." };
  }
}

export interface ResultadoBorrado {
  ok: boolean;
  /** El servidor dice que ya estaba borrado: el estado local igual hay que corregirlo. */
  yaBorrado?: boolean;
  /** Pasaron más de 48 horas. */
  fueraDeVentana?: boolean;
  sesionCaida?: boolean;
  mensaje?: string;
}

export async function borrarMensajeEvolution(messageId: string): Promise<ResultadoBorrado> {
  try {
    const { data, error } = await supabase.functions.invoke("evolution-delete-message", {
      body: { messageId },
    });
    if (!error) return { ok: true, ...(data as object | null) };

    const { status, cuerpo } = await detalleDelError(error);
    const detalle = cuerpo?.detail ?? cuerpo?.error ?? error.message ?? "No se pudo eliminar el mensaje.";
    return {
      ok: false,
      yaBorrado: cuerpo?.error === "Ese mensaje ya está borrado",
      fueraDeVentana: cuerpo?.error === "fuera_de_ventana",
      sesionCaida: status === 409 || status === 401 || cuerpo?.error === "sesion_caida",
      mensaje: detalle,
    };
  } catch (e: any) {
    return { ok: false, mensaje: e?.message ?? "No se pudo eliminar el mensaje." };
  }
}

/** Mensajes de los errores que devuelve `conversacion_set_canal`. */
export const MOTIVO_CANAL: Record<string, string> = {
  provider_invalido: "Ese canal no existe.",
  sin_permiso: "No tienes permiso para cambiar el canal de esta conversación.",
  conversacion_inexistente: "La conversación ya no está disponible.",
  evolution_no_habilitado: "El canal sin costo no está habilitado para esta empresa.",
};

/* ── Canal por defecto de la empresa ─────────────────────────────────────── */

/**
 * `'auto'` no es un canal: limpia la preferencia de la conversación y la devuelve
 * a la cascada (default de la empresa → ycloud). Sin él, una conversación fijada
 * una vez ignoraba el default para siempre.
 */
export type ProveedorElegible = Proveedor | "auto";

export interface CambioDefault {
  ok: boolean;
  provider?: Proveedor;
  /** Falso si eligieron el canal sin costo con la sesión caída. */
  sesion_activa?: boolean;
  /** Advertencia del backend para mostrar tal cual. */
  aviso?: string;
  error?: string;
}

/**
 * Fija el canal por defecto de la empresa. Exige admin de plataforma o
 * `administrador` de la empresa: afecta a todos los chats y a la factura.
 */
export async function fijarCanalDefault(companyId: string, proveedor: Proveedor): Promise<CambioDefault> {
  const { data, error } = await (supabase as any).rpc("empresa_set_canal_default", {
    p_company_id: companyId,
    p_provider: proveedor,
  });
  if (error) return { ok: false, error: error.message };
  if (!data || typeof data !== "object") return { ok: false, error: "respuesta_inesperada" };
  return data as CambioDefault;
}

export interface CanalConversacion {
  ok: boolean;
  efectivo: Proveedor;
  /** false = la conversación sigue la cascada (automático). */
  fijado: boolean;
  canal_default?: string | null;
  sesion_activa?: boolean;
}

/**
 * Estado de canal de una conversación, con el detalle que la RPC vieja no daba.
 * `canal_de_conversacion` sigue existiendo y devolviendo un string; esta es la
 * función nueva que convive con ella.
 */
export async function conversacionCanal(conversationId: string): Promise<CanalConversacion | null> {
  const { data, error } = await (supabase as any).rpc("conversacion_canal", {
    p_conversation_id: conversationId,
  });
  if (error || !data || typeof data !== "object" || !ES_PROVEEDOR(data.efectivo)) return null;
  return data as CanalConversacion;
}

export interface FilaMetrica {
  dia: string;
  oficial: number;
  sin_costo: number;
  /** Mensajes que el cliente escribió desde su celular: ya no cuentan dentro de `oficial`. */
  movil?: number;
  costo_estimado: number;
  /** Lo que habría costado enviar por el canal oficial lo que salió gratis. */
  ahorro_estimado: number;
}

/**
 * Mensajes por canal, día a día. `null` en las fechas significa "mes en curso".
 * La suma la hace Postgres — son miles de filas y no tiene sentido bajarlas.
 */
export async function metricasCanal(companyId: string, desde?: string | null, hasta?: string | null): Promise<FilaMetrica[]> {
  const { data, error } = await (supabase as any).rpc("metricas_canal", {
    p_company_id: companyId,
    p_desde: desde ?? null,
    p_hasta: hasta ?? null,
  });
  return !error && Array.isArray(data) ? (data as FilaMetrica[]) : [];
}
