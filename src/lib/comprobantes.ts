import { supabase } from "@/integrations/supabase/client";

/**
 * Pagos / Comprobantes: el humano valida un comprobante de pago y recién ahí se
 * registra en ISPControl. Nada se registra solo.
 *
 * Esta capa es la única que conoce los nombres de las funciones del backend, así que si
 * cambian se cambian acá. Lo que el backend no pudo leer llega como `null` y se muestra
 * como "no se pudo leer": nunca se rellena ni se calcula un valor por él.
 *
 * Todo lo que todavía no exista en la base se trata como "módulo no disponible", no
 * como un error del usuario.
 */

export const BUCKET = "comprobantes";
export const MAX_BYTES = 10 * 1024 * 1024;
export const TIPOS_OK = ["image/jpeg", "image/png", "application/pdf", "text/plain"];

/**
 * Webhook de n8n que dispara el análisis justo después de crear el comprobante. Es "lo
 * mejor posible": si falla no se avisa como error, porque el workflow además barre cada
 * 2 minutos las filas que quedaron en "analizando".
 * TODO: confirmar la ruta definitiva con el backend.
 */
export const WEBHOOK_ANALISIS = "https://bot.artoria.cl/webhook/comprobante-analizar";

export type EstadoAnalisis = "analizando" | "listo" | "error";
export type EstadoFactura = "pendiente" | "registrado" | "rechazado";

export interface FacturaComprobante {
  nfactura: string;
  /** De qué cliente es, si el backend lo informa: une la factura con su pago. */
  cliente_id: string | null;
  /** El orden del pago (en `pagos`) del que salió esta factura: el vínculo exacto. */
  pago_orden: number | null;
  monto: number | null;
  vencimiento: string | null;
  estado: EstadoFactura;
  /** La propuesta del backend: esta factura es la que cubre el pago. */
  propuesta: boolean;
  registrado_por: string | null;
  registrado_at: string | null;
  motivo_rechazo: string | null;
  /** Lo que devolvió ISPControl si el intento de registrar falló. */
  error_ispcontrol: string | null;
}

/**
 * Un pago dentro del comprobante. Un solo archivo puede traer muchos (uno real trajo 31).
 * Los campos `rut` y `monto` de más arriba son solo los del primero: el detalle sale de acá.
 */
export interface Pago {
  orden: number;
  rut: string | null;
  nombre: string | null;
  monto: number | null;
  fecha: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  propuesta_tipo: "una" | "varias" | "ninguna" | null;
  estado: string;
  /** Facturas que el backend propone para este pago. */
  match_nfacturas: string[];
  error_mensaje: string | null;
  /** La línea del archivo que generó este pago, tal cual vino (ancho fijo). Se copia sin tocar. */
  linea_original: string | null;
  /** true = el backend no mandó `pagos` y este se armó con los campos del primer pago. */
  sintetico: boolean;
}

export interface Comprobante {
  id: string;
  pagos: Pago[];
  estado: EstadoAnalisis;
  error_mensaje: string | null;
  rut: string | null;
  nombre: string | null;
  monto: number | null;
  fecha: string | null;
  banco: string | null;
  cliente: {
    id: string | number | null;
    nombre: string | null;
    /** La línea del cliente en ISPControl. Cada dato puede venir vacío. */
    plan: string | null;
    direccion: string | null;
    estado: string | null;
    onu: string | null;
  } | null;
  facturas: FacturaComprobante[];
  /** Cuántas pendientes tiene el cliente en total, si el backend recortó la lista. */
  facturas_total: number | null;
  propuesta_tipo: "una" | "varias" | "ninguna" | null;
  archivo_url: string | null;
  /** Lo que decía el comprobante, tal cual lo extrajo el analizador, para compararlo con lo interpretado. */
  texto_extraido: string | null;
  analizado_at: string | null;
  /** Ruta dentro del bucket privado: es la que se firma para abrir el archivo. */
  storage_path: string | null;
}

export interface ResumenComprobante {
  id: string;
  creado_at: string | null;
  /** Nombre del archivo subido, si el backend lo informa. */
  archivo: string | null;
  error_mensaje: string | null;
  /** null = el backend no lo informa (no se asume que no se encontró). */
  cliente_encontrado: boolean | null;
  rut: string | null;
  nombre: string | null;
  monto: number | null;
  estado: string;
  registrado_por: string | null;
  registrado_at: string | null;
}

export type ResultadoCrear =
  | { tipo: "nuevo"; id: string }
  | { tipo: "duplicado"; registradoAt: string | null; registradoPor: string | null; id: string | null };

export interface ResultadoFactura { nfactura: string; ok: boolean; error?: string | null }

/** `undefined` = la función o el bucket todavía no existen. */
const faltaAlgo = (e: { code?: string; message?: string; status?: number; statusCode?: string | number } | null) =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || e.status === 404 || String(e.statusCode) === "404"
    || /could not find|does not exist|bucket not found/i.test(e.message ?? ""));

export class ModuloNoDisponible extends Error {
  constructor() { super("El módulo de pagos todavía no está disponible."); }
}

const lanzar = (e: { message?: string } & Record<string, any>): never => {
  if (faltaAlgo(e)) throw new ModuloNoDisponible();
  throw new Error(e?.message || "Error desconocido");
};

const fila = (data: any) => (Array.isArray(data) ? data[0] : data);
const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** ¿Existe el módulo en la base? Se usa para mostrar u ocultar la entrada del menú. */
export async function moduloDisponible(companyId: string): Promise<boolean> {
  const { error } = await (supabase as any).rpc("comprobantes_listar", { p_company_id: companyId, p_limit: 1, p_offset: 0 });
  return !error;
}

export interface Capacidades {
  puedeRegistrar: boolean;
  /** Por qué no se puede registrar, cuando no se puede. */
  motivo: string | null;
}

/**
 * Si la API de ISPControl permite hoy registrar pagos. Mientras no, la pantalla muestra
 * todo pero bloquea el registro. Si no se puede consultar, se asume que NO se puede:
 * es el lado seguro.
 */
export async function capacidades(): Promise<Capacidades> {
  const { data, error } = await (supabase as any).rpc("comprobantes_capacidades");
  if (error) return { puedeRegistrar: false, motivo: "No se pudo verificar si ISPControl permite registrar pagos." };
  const f = fila(data);
  return { puedeRegistrar: f?.puede_registrar === true, motivo: txt(f?.motivo) };
}

/** SHA-256 del archivo en hexadecimal: es lo que detecta el mismo comprobante subido dos veces. */
export async function hashArchivo(file: File): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Un texto de error si el archivo no sirve, null si está bien. */
export function validarArchivo(file: File): string | null {
  if (!TIPOS_OK.includes(file.type)) return "Sube una foto (JPG o PNG), un PDF o un archivo de texto (TXT).";
  if (file.size > MAX_BYTES) return "El archivo pesa más de 10 MB.";
  if (file.size === 0) return "El archivo está vacío.";
  return null;
}

export async function subirComprobante(companyId: string, file: File): Promise<ResultadoCrear> {
  const hash = await hashArchivo(file);
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "text/plain" ? "txt" : "jpg";
  const path = `${companyId}/${crypto.randomUUID()}.${ext}`;

  const { error: errSubida } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (errSubida) lanzar(errSubida as any);

  const { data, error } = await (supabase as any).rpc("comprobante_crear", { p_company_id: companyId, p_path: path, p_hash: hash });
  if (error) lanzar(error);
  const f = fila(data);
  if (f?.estado === "duplicado") {
    // El archivo ya existe en otra fila: el que se acaba de subir sobra.
    supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    return { tipo: "duplicado", registradoAt: txt(f.registrado_at), registradoPor: txt(f.registrado_por), id: txt(f.id) };
  }
  if (!f?.id) throw new Error("El servidor no devolvió el comprobante creado.");

  // Aviso a n8n para que analice ya. Si falla, el barrido periódico lo recoge.
  fetch(WEBHOOK_ANALISIS, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comprobante_id: f.id, company_id: companyId }),
  }).catch(() => {});

  return { tipo: "nuevo", id: String(f.id) };
}

/** La línea puede venir anidada en `linea` o suelta en el propio cliente. */
const aCliente = (c: any): NonNullable<Comprobante["cliente"]> => {
  const l = c?.linea ?? c ?? {};
  return {
    id: c?.id ?? null, nombre: txt(c?.nombre),
    plan: txt(l.plan), direccion: txt(l.direccion), estado: txt(l.estado), onu: txt(l.onu),
  };
};

const aFactura = (f: any): FacturaComprobante => ({
  nfactura: String(f?.nfactura ?? ""),
  cliente_id: f?.cliente_id != null ? String(f.cliente_id) : null,
  pago_orden: num(f?.pago_orden),
  monto: num(f?.monto),
  vencimiento: txt(f?.vencimiento),
  estado: f?.estado === "registrado" || f?.estado === "rechazado" ? f.estado : "pendiente",
  propuesta: !!f?.propuesta,
  registrado_por: txt(f?.registrado_por),
  registrado_at: txt(f?.registrado_at),
  motivo_rechazo: txt(f?.motivo_rechazo),
  error_ispcontrol: txt(f?.error_ispcontrol),
});

/** `todas` pide la lista completa de pendientes en vez de las primeras que trae el backend. */
export async function estadoComprobante(id: string, todas = false): Promise<Comprobante> {
  let { data, error } = await (supabase as any).rpc("comprobante_estado", todas ? { p_id: id, p_todas: true } : { p_id: id });
  // El backend no confirmó que acepte `p_todas`: si no lo conoce, se pide sin él.
  if (error && todas && faltaAlgo(error)) {
    ({ data, error } = await (supabase as any).rpc("comprobante_estado", { p_id: id }));
  }
  if (error) lanzar(error);
  const f = fila(data);
  if (!f) throw new Error("No se encontró el comprobante.");
  // Solo "analizando" (o sin estado) significa que el análisis sigue en curso. Cualquier otro
  // estado, incluidos los finales como "registrado" o "rechazado", es un análisis terminado.
  const estado: EstadoAnalisis = f.estado === "error" ? "error" : !f.estado || f.estado === "analizando" ? "analizando" : "listo";
  const facturas: FacturaComprobante[] = Array.isArray(f.facturas) ? f.facturas.map(aFactura) : [];
  const propuestaTipo = (v: unknown): Pago["propuesta_tipo"] => (v === "una" || v === "varias" || v === "ninguna" ? v : null);
  let pagos: Pago[] = Array.isArray(f.pagos) ? f.pagos.map((p: any, i: number): Pago => ({
    orden: num(p?.orden) ?? i + 1,
    rut: txt(p?.rut), nombre: txt(p?.nombre), monto: num(p?.monto), fecha: txt(p?.fecha),
    cliente_id: p?.cliente_id != null ? String(p.cliente_id) : null,
    cliente_nombre: txt(p?.cliente_nombre),
    propuesta_tipo: propuestaTipo(p?.propuesta_tipo),
    estado: String(p?.estado ?? ""),
    match_nfacturas: (Array.isArray(p?.match_nfacturas) ? p.match_nfacturas : []).map((m: any) => String(m?.nfactura ?? m)),
    error_mensaje: txt(p?.error_mensaje),
    // Sin recortar ni reformatear: en un archivo de ancho fijo cada espacio cuenta.
    linea_original: typeof p?.linea_original === "string" && p.linea_original.length > 0 ? p.linea_original : null,
    sintetico: false,
  })).sort((a: Pago, b: Pago) => a.orden - b.orden) : [];
  // Respuesta de antes de `pagos`: un solo pago, armado con los campos del primero.
  if (pagos.length === 0 && estado !== "analizando" && estado !== "error") {
    pagos = [{
      orden: 1, rut: txt(f.rut), nombre: txt(f.nombre), monto: num(f.monto), fecha: txt(f.fecha),
      cliente_id: f.cliente?.id != null ? String(f.cliente.id) : null, cliente_nombre: txt(f.cliente?.nombre),
      propuesta_tipo: propuestaTipo(f.propuesta_tipo), estado: "listo",
      match_nfacturas: facturas.filter(x => x.propuesta).map(x => x.nfactura),
      error_mensaje: null, linea_original: null, sintetico: true,
    }];
  }
  return {
    id: String(f.id ?? id),
    pagos,
    estado,
    error_mensaje: txt(f.error_mensaje),
    rut: txt(f.rut), nombre: txt(f.nombre), monto: num(f.monto), fecha: txt(f.fecha), banco: txt(f.banco),
    cliente: f.cliente ? aCliente(f.cliente) : null,
    facturas,
    facturas_total: num(f.facturas_total),
    propuesta_tipo: f.propuesta_tipo === "una" || f.propuesta_tipo === "varias" || f.propuesta_tipo === "ninguna" ? f.propuesta_tipo : null,
    archivo_url: txt(f.archivo_url),
    texto_extraido: typeof f.texto_extraido === "string" && f.texto_extraido.trim() ? f.texto_extraido : null,
    analizado_at: txt(f.analizado_at),
    storage_path: txt(f.storage_path),
  };
}

/** Un resultado por factura: una que falla no arrastra a las demás. */
export async function registrarFacturas(id: string, nfacturas: string[]): Promise<ResultadoFactura[]> {
  const { data, error } = await (supabase as any).rpc("comprobante_registrar", { p_id: id, p_nfacturas: nfacturas });
  if (error) lanzar(error);
  const lista: any[] = Array.isArray(data) ? data : [];
  // Lo que el backend no confirma no cuenta como registrado.
  return nfacturas.map(n => {
    const r = lista.find(x => String(x?.nfactura) === n);
    return r ? { nfactura: n, ok: r.ok === true, error: txt(r.error) } : { nfactura: n, ok: false, error: "El servidor no confirmó este registro." };
  });
}

export async function rechazarFacturas(id: string, nfacturas: string[], motivo: string): Promise<ResultadoFactura[]> {
  const { data, error } = await (supabase as any).rpc("comprobante_rechazar", {
    p_id: id, p_nfacturas: nfacturas, p_motivo: motivo.trim() || null,
  });
  if (error) lanzar(error);
  const lista: any[] = Array.isArray(data) ? data : [];
  return nfacturas.map(n => {
    const r = lista.find(x => String(x?.nfactura) === n);
    return r ? { nfactura: n, ok: r.ok === true, error: txt(r.error) } : { nfactura: n, ok: false, error: "El servidor no confirmó este rechazo." };
  });
}

export async function listarComprobantes(companyId: string, limit: number, offset: number): Promise<ResumenComprobante[]> {
  const { data, error } = await (supabase as any).rpc("comprobantes_listar", { p_company_id: companyId, p_limit: limit, p_offset: offset });
  if (error) lanzar(error);
  return (Array.isArray(data) ? data : []).map((f: any) => ({
    id: String(f.id), creado_at: txt(f.creado_at ?? f.created_at),
    archivo: txt(f.archivo ?? f.nombre_archivo) ?? (txt(f.storage_path)?.split("/").pop() ?? null),
    error_mensaje: txt(f.error_mensaje),
    cliente_encontrado: typeof f.cliente_encontrado === "boolean" ? f.cliente_encontrado
      : f.cliente_nombre !== undefined ? !!txt(f.cliente_nombre) : null,
    rut: txt(f.rut), nombre: txt(f.nombre), monto: num(f.monto),
    estado: String(f.estado ?? ""), registrado_por: txt(f.registrado_por), registrado_at: txt(f.registrado_at),
  }));
}

/** El archivo puede venir como URL completa o como ruta dentro del bucket (privado). */
export async function urlDelArchivo(valor: string): Promise<string | null> {
  if (/^https?:\/\//i.test(valor)) return valor;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(valor, 300);
  return data?.signedUrl ?? null;
}
