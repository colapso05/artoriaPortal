import { supabase } from "@/integrations/supabase/client";
import { detalleDelError } from "@/lib/canalSalida";

/**
 * Capa de acceso del Simulador de WhatsApp.
 *
 * Todo pasa por la edge function `sim-proxy`, que es la única que conoce el
 * agente en modo prueba. Acá no se toca `canalSalida` ni ninguna función de
 * envío real (evolution-send / ycloud-send): el simulador no puede mandarle
 * un WhatsApp a nadie.
 */

export type CompanyKey = "dropp" | "optve";

export interface ConversacionSim {
  id: string;
  company_key: string;
  phone: string;
  client_name: string | null;
  created_at: string;
  updated_at: string;
}

export type RolMensaje = "user" | "agent";

export interface MensajeSim {
  id: string;
  role: RolMensaje;
  kind: string;
  content: string;
  created_at: string;
}

export interface EventoSim {
  seq: number;
  kind: string;
  name: string | null;
  ok: boolean | null;
  ms: number | null;
  payload: unknown;
}

/**
 * Veredicto del juez LLM. Corre en segundo plano: no viene en la respuesta del
 * turno, aparece unos segundos después dentro de cada run (`action:'obtener'`
 * → `runs[].veredictos`). Los valores vienen tal cual de SQLite: `falla` es
 * 0/1, no boolean.
 */
export type TipoFallaJuez =
  | "derivacion_falsa"
  | "no_derivo_cuando_correspondia"
  | "pidio_dato_innecesario"
  | "repitio_pregunta"
  | "afirmo_pago_sin_verificar"
  | "respondio_dato_no_verificado"
  | "prometio_fecha"
  | "ignoro_pedido"
  | "tono_inadecuado"
  | "fuga_interna"
  | "otro";

export type SeveridadJuez = "baja" | "media" | "alta";

export interface Veredicto {
  id: number;
  run_id: number;
  /** 0 = el turno estuvo bien, 1 = hubo falla. SQLite, no boolean. */
  falla: 0 | 1;
  tipo: TipoFallaJuez | null;
  severidad: SeveridadJuez | null;
  evidencia: string;
  correccion: string;
  /** 0..1 */
  confianza: number;
  modelo: string;
  ms: number;
  /** USD del juez, separado del costo del turno. */
  costo: number;
  /** ISO */
  created_at: string;
}

export interface RunSim {
  id: string;
  ms: number | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  verdict: string | null;
  fail_type: string | null;
  eventos: EventoSim[];
  /** Veredictos del juez, cuando ya terminó de correr. */
  veredictos?: Veredicto[];
}

export interface DetalleConversacion {
  conversacion: ConversacionSim;
  mensajes: MensajeSim[];
  runs: RunSim[];
  tickets: unknown[];
}

export interface PerfilSim {
  rut: string;
  nombre: string;
  /** Ahora viene en el perfil: el número con el que se abre la conversación de prueba. */
  telefono: string | null;
  direccion: string | null;
  plan: string | null;
  estado: string | null;
  equipos: unknown;
  boletas: unknown;
}

export interface HerramientaSim {
  name: string;
  ok: boolean | null;
  ms: number | null;
}

export interface ViolacionSim {
  regla: string;
  severidad: string;
  evidencia: string | null;
}

/** Lo que devuelve un turno del simulador, tal cual lo manda sim-proxy. */
export interface RespuestaTurno {
  runId: string;
  reply: string;
  intencion: string | null;
  via: string | null;
  ms: number | null;
  costo: number | null;
  modelo: string | null;
  tools: HerramientaSim[];
  violaciones: ViolacionSim[];
  veredicto: string | null;
  tipo_falla: string | null;
}

export interface ImagenEntrante {
  /** data URL base64, ya validada en el cliente (máx 5 MB). */
  dataUrl: string;
  nombre: string;
  mime: string;
  tamano: number;
}

/** Audio del cliente: data URL base64, ogg/mp3/m4a/wav/webm, máx 12 MB. */
export interface AudioEntrante {
  dataUrl: string;
  nombre: string;
  mime: string;
  tamano: number;
}

export class ErrorSimulador extends Error {
  status?: number;
  constructor(mensaje: string, status?: number) {
    super(mensaje);
    this.name = "ErrorSimulador";
    this.status = status;
  }
}

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  let data: any = null;
  let error: any = null;
  try {
    const r = await supabase.functions.invoke("sim-proxy", { body });
    data = r.data;
    error = r.error;
  } catch (e: any) {
    // `invoke` lanza cuando no hay respuesta en absoluto (red caída, timeout).
    throw new ErrorSimulador(
      e?.message ? `No hubo respuesta del simulador: ${e.message}` : "No hubo respuesta del simulador.",
    );
  }

  if (error) {
    const { status, cuerpo } = await detalleDelError(error);
    const motivo =
      (cuerpo && (cuerpo.error || cuerpo.detail || cuerpo.message)) ||
      error?.message ||
      "El simulador rechazó la operación.";
    throw new ErrorSimulador(String(motivo), status);
  }

  if (!data || typeof data !== "object") {
    throw new ErrorSimulador("El simulador devolvió una respuesta vacía.");
  }

  return data as T;
}

export const simuladorApi = {
  listar: () => invocar<{ conversaciones: ConversacionSim[] }>({ action: "listar" }),

  crear: (p: {
    companyKey: CompanyKey;
    phone: string;
    clientName?: string;
    clientRut?: string;
  }) =>
    invocar<{ conversacion: ConversacionSim }>({
      action: "crear",
      companyKey: p.companyKey,
      phone: p.phone,
      clientName: p.clientName,
      clientRut: p.clientRut,
    }),

  obtener: (id: string) => invocar<DetalleConversacion>({ action: "obtener", id }),

  borrar: (id: string) => invocar<{ ok: true }>({ action: "borrar", id }),

  mensaje: (p: { id: string; texto: string; imagen?: ImagenEntrante; audio?: AudioEntrante }) =>
    invocar<RespuestaTurno>({
      action: "mensaje",
      id: p.id,
      texto: p.texto,
      ...(p.imagen ? { imagen: p.imagen } : {}),
      ...(p.audio ? { audio: p.audio } : {}),
    }),

  perfiles: () => invocar<{ perfiles: PerfilSim[] }>({ action: "perfiles" }),
};
