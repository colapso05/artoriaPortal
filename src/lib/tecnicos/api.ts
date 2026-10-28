import { supabase } from "@/integrations/supabase/client";

/**
 * Capa de datos del Portal Técnicos.
 *
 * Replica la lógica de la app Android (artoria-soporte) para que ambas plataformas
 * se comporten igual: mismo login, mismos estados y el mismo flujo de cierre de trabajo.
 * Referencia: AuthManager.kt y TicketViewModel.kt.
 */

export interface Tecnico {
  id: string;
  name: string | null;
  phone: string | null;
  username: string | null;
  company_id: string | null;
  photo_url?: string | null;
  color?: string | null;
}

export interface Appointment {
  id: string;
  service_type: string | null;
  notes: string | null;
  client_name: string | null;
  client_rut: string | null;
  client_phone: string | null;
  client_address: string | null;
  status: string | null;
  start_datetime: string | null;
  duration_minutes: number | null;
  conversation_id: string | null;
  /** Vínculo directo con el ticket. Las citas antiguas lo tienen vacío. */
  ticket_id?: string | null;
  technician_id: string | null;
  created_at: string | null;
}

/**
 * Marca que el backend deja en `notes` cuando cierra una cita automáticamente al
 * resolverse el ticket. Significa que el caso se resolvió (a veces por teléfono),
 * no que el técnico fuera al domicilio.
 */
const MARCA_CIERRE_AUTO = "[auto]";

export const cerradaSinVisita = (a: Appointment): boolean =>
  (a.notes ?? "").includes(MARCA_CIERRE_AUTO);

/** Estados que dan por terminada una cita (igual que en TicketViewModel.kt). */
const FINISHED_STATUSES = ["completado", "completada", "cancelado", "resuelto"];

export const isFinished = (status: string | null | undefined) =>
  FINISHED_STATUSES.includes((status ?? "").toLowerCase());

/** Dominio ficticio con que se registran los técnicos en Auth. No recibe correo real. */
export const DOMINIO_TECNICOS = "@tech.artoria.cl";

/** El técnico se autentica con un email derivado de su teléfono (mismo formato que el servidor). */
export function phoneToEmail(phone: string): string {
  return phone.replace(/\+/g, "").replace(/\s/g, "").trim() + DOMINIO_TECNICOS;
}

/**
 * ¿Esta sesión de Auth pertenece a un técnico y no a un operador/admin?
 *
 * Técnicos y operadores comparten el mismo cliente de Supabase, así que comparten
 * la misma llave de sesión en localStorage. Sin esto, un técnico con sesión abierta
 * que entra a /portal termina redirigido al dashboard de operadores.
 *
 * Solo sirve para decidir a qué portal mandar a alguien; quién puede ver qué dato
 * lo siguen decidiendo las políticas RLS de la base.
 */
export function esSesionTecnico(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase().endsWith(DOMINIO_TECNICOS);
}

/** Normaliza un teléfono chileno: 9xxxxxxxx → +569xxxxxxxx */
function normalizePhone(input: string): string {
  const clean = input.replace(/\s/g, "");
  if (clean.startsWith("+56")) return clean;
  if (clean.length === 9 && clean.startsWith("9")) return `+56${clean}`;
  return clean;
}

/** Traduce errores de Supabase Auth a mensajes claros (equivalente a mapAuthError de Kotlin). */
export function mapAuthError(message: string | undefined): string {
  const msg = (message ?? "").toLowerCase();
  if (msg.includes("invalid login credentials")) return "Usuario o contraseña incorrectos";
  if (msg.includes("password should be")) return "La contraseña debe tener al menos 8 caracteres";
  if (msg.includes("jwt expired")) return "Tu sesión venció, vuelve a iniciar sesión";
  if (msg.includes("network") || msg.includes("fetch")) return "Sin conexión a internet";
  if (msg.includes("email not confirmed")) return "La cuenta aún no está confirmada";
  return message || "Ocurrió un error. Intenta nuevamente";
}

/** La función de la base todavía no existe (se publica el portal antes de crearla). */
const funcionInexistente = (e: { code?: string; message?: string; status?: number } | null) =>
  !!e && (e.code === "PGRST202" || e.status === 404 || /could not find the function|does not exist/i.test(e.message ?? ""));

/**
 * Busca el teléfono de un técnico por usuario o teléfono, antes de tener sesión.
 *
 * Usa la función `tecnico_login_lookup`, que responde solo con el teléfono y solo del
 * técnico exacto que se pide. Así la tabla `technicians` no tiene que estar abierta a
 * cualquiera: antes este login leía la tabla directo, y para eso había una política
 * que dejaba leer los nombres, teléfonos y usuarios de todos los técnicos.
 *
 * Devuelve `undefined` si la función no existe todavía, y `null` si existe y no hay
 * ningún técnico así.
 */
async function telefonoPorLookup(input: string): Promise<string | null | undefined> {
  const { data, error } = await (supabase as any).rpc("tecnico_login_lookup", { p_input: input });
  if (error) {
    if (funcionInexistente(error)) return undefined;
    throw new Error(mapAuthError(error.message));
  }
  const fila = Array.isArray(data) ? data[0] : data;
  return fila?.phone ?? null;
}

/**
 * Login con usuario (o teléfono) + contraseña.
 * 1) Busca el teléfono del técnico (función `tecnico_login_lookup`).
 * 2) Convierte su teléfono a email y hace signInWithPassword.
 * 3) Recarga el perfil por `user_id` para tomar los valores actuales de la BD.
 */
export async function loginTecnico(userInput: string, password: string): Promise<Tecnico> {
  const input = userInput.trim();
  if (!input) throw new Error("Ingresa tu usuario o teléfono");

  let tech: Tecnico | null = null;
  let telefono = await telefonoPorLookup(input);

  if (telefono === undefined) {
    /*
     * Respaldo: la consulta de antes, mientras la función no exista.
     *
     * Existe para poder publicar el portal ANTES de que la base cierre la política
     * que dejaba leer la tabla. Cuando la función esté en producción y esta rama
     * deje de ejecutarse, se puede borrar.
     */
    const byUsername = await (supabase as any)
      .from("technicians")
      .select("id, name, phone, username, company_id, photo_url, color")
      .eq("username", input)
      .maybeSingle();
    tech = byUsername.data ?? null;
    if (!tech) {
      const byPhone = await (supabase as any)
        .from("technicians")
        .select("id, name, phone, username, company_id, photo_url, color")
        .eq("phone", normalizePhone(input))
        .maybeSingle();
      tech = byPhone.data ?? null;
    }
    telefono = tech?.phone ?? null;
  }

  if (!telefono) {
    throw new Error("No se encontró ningún técnico con ese usuario o teléfono");
  }
  // Con la función solo se conoce el teléfono; el resto del perfil llega con la sesión.
  if (!tech) tech = { id: "", name: null, phone: telefono, username: null, company_id: null };

  // 3. Autenticar con el email derivado del teléfono
  const email = phoneToEmail(tech.phone);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(mapAuthError(authError.message));

  const authUserId = authData.user?.id;
  if (!authUserId) throw new Error("No se pudo iniciar sesión. Intenta nuevamente");

  // 4. Perfil actualizado desde la BD (por user_id, que es el vínculo real con Auth)
  const { data: profile } = await (supabase as any)
    .from("technicians")
    .select("id, name, phone, username, company_id, photo_url, color")
    .eq("user_id", authUserId)
    .maybeSingle();

  /*
   * Sin perfil no se devuelve el técnico "a medias".
   *
   * Antes se devolvía el que se había leído sin sesión. Ahora que esa lectura ya no
   * existe, la única fuente es la tabla con la sesión abierta; si no responde,
   * seguir sería entrar a la app con un técnico vacío y sin id.
   */
  if (!profile && !tech.id) {
    await supabase.auth.signOut();
    throw new Error("No se pudo cargar tu perfil. Intenta nuevamente.");
  }
  return (profile as Tecnico) ?? tech;
}

/* ─── Registro y recuperación de contraseña ──────────────────────────────
 * Ambos flujos comparten los mismos pasos que la app Android:
 *   teléfono → código por WhatsApp → definir contraseña.
 * El registro además pide un nombre de usuario.
 */

/** Valida y normaliza un celular chileno: 9 dígitos que parten con 9 → +569XXXXXXXX */
export function validarCelular(input: string): { ok: boolean; phone: string; error?: string } {
  const limpio = input.replace(/\s/g, "").replace(/^\+?56/, "");
  if (!/^9\d{8}$/.test(limpio)) {
    return { ok: false, phone: "", error: "Ingresa un celular de 9 dígitos que comience con 9." };
  }
  return { ok: true, phone: `+56${limpio}` };
}

/** Reglas de contraseña, iguales a las de la app: 8+ caracteres, con letras y números. */
export function validarPassword(password: string, confirm: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "La contraseña debe contener letras y números.";
  if (password !== confirm) return "Las contraseñas no coinciden.";
  return null;
}

/** Reglas de nombre de usuario: 4-20 caracteres, letras, números, punto, guion o guion bajo. */
export function validarUsername(username: string): string | null {
  if (username.length < 4 || username.length > 20) return "El usuario debe tener entre 4 y 20 caracteres.";
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) return "Solo se permiten letras, números, punto, guion y guion bajo.";
  return null;
}

/** Envía el código de verificación por WhatsApp. */
export async function requestOtp(phone: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("technician-request-otp", { body: { phone } });
  if (error) throw new Error("No se pudo enviar el código. Revisa tu conexión e intenta de nuevo.");
  if (data?.found === false) throw new Error("Este número no está registrado como técnico.");
}

/**
 * Verifica el código y deja la sesión activa.
 * La edge function devuelve la sesión de Supabase junto con el perfil del técnico.
 */
export async function verifyOtp(phone: string, code: string): Promise<Tecnico> {
  const { data, error } = await supabase.functions.invoke("technician-verify-otp", { body: { phone, code } });
  if (error) throw new Error("Código incorrecto o vencido.");
  if (data?.error) throw new Error(data.error);

  const tech = data?.technician ?? data;
  const techId = tech?.id ?? tech?.technician_id;
  if (!techId) throw new Error("Código incorrecto o vencido.");

  // Activar la sesión devuelta para poder actualizar la contraseña a continuación
  const session = data?.session;
  if (session?.access_token && session?.refresh_token) {
    const { error: sessErr } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (sessErr) throw new Error("No se pudo validar la sesión. Intenta nuevamente.");
  }

  return {
    id: techId,
    name: tech?.name ?? null,
    phone: tech?.phone ?? phone,
    username: tech?.username ?? null,
    company_id: tech?.company_id ?? null,
  };
}

/** Define la contraseña del técnico (usa la sesión abierta por verifyOtp). */
export async function setupPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(mapAuthError(error.message));
}

/**
 * True si el nombre de usuario está libre.
 *
 * Con la tabla cerrada, un técnico solo ve sus propias filas y esta consulta
 * diría "libre" para un usuario que ya tiene otro técnico. Por eso se pregunta a
 * la función `tecnico_username_disponible`, que mira todos. Si todavía no existe se
 * usa la consulta de antes, y en cualquier caso `crearCuenta` rechaza un usuario
 * repetido (lo impide la base con una restricción única).
 */
export async function usernameDisponible(username: string): Promise<boolean> {
  const { data: libre, error } = await (supabase as any).rpc("tecnico_username_disponible", { p_username: username });
  if (!error && typeof libre === "boolean") return libre;

  const { data } = await (supabase as any)
    .from("technicians")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  return !data;
}

/** Registro: guarda el nombre de usuario y define la contraseña. */
export async function crearCuenta(techId: string, username: string, password: string): Promise<void> {
  const { error: userErr } = await (supabase as any)
    .from("technicians")
    .update({ username })
    .eq("id", techId);
  if (userErr) {
    // 23505: la base rechazó el usuario porque ya existe. Es la red de seguridad que
    // sigue funcionando aunque la comprobación de antes no pueda ver a los demás.
    if ((userErr as any).code === "23505") throw new Error("Ese nombre de usuario ya está en uso. Elige otro.");
    throw new Error("No se pudo guardar el nombre de usuario.");
  }

  await setupPassword(password);
}

/** Devuelve el técnico de la sesión activa, o null si no hay sesión de técnico. */
export async function getTecnicoActual(): Promise<Tecnico | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const { data } = await (supabase as any)
    .from("technicians")
    .select("id, name, phone, username, company_id, photo_url, color")
    .eq("user_id", userId)
    .maybeSingle();

  return (data as Tecnico) ?? null;
}

export async function logoutTecnico(): Promise<void> {
  await supabase.auth.signOut();
}

/** Citas del técnico, separadas en próximas (activas) e historial (finalizadas). */
export async function loadAppointments(techId: string): Promise<{ upcoming: Appointment[]; past: Appointment[] }> {
  const { data, error } = await (supabase as any)
    .from("appointments")
    .select("*")
    .eq("technician_id", techId)
    .order("start_datetime", { ascending: true });

  if (error) throw new Error(error.message);
  const all = (data ?? []) as Appointment[];

  /*
   * Pendientes de la más reciente a la más antigua.
   *
   * El orden natural de una agenda sería el inverso —lo más próximo primero—, pero
   * arrastramos citas viejas que quedaron marcadas como pendientes sin estarlo
   * (cuando el operador cierra el caso desde el panel, el ticket se cierra y la cita
   * se queda igual). Con el orden ascendente esas se colocaban arriba del todo y el
   * técnico tenía que bajar por toda la lista para llegar a lo de hoy.
   */
  const upcoming = all
    .filter(a => !isFinished(a.status))
    .sort((a, b) => (b.start_datetime ?? "").localeCompare(a.start_datetime ?? ""));

  const past = all
    .filter(a => isFinished(a.status))
    .sort((a, b) => (b.start_datetime ?? "").localeCompare(a.start_datetime ?? ""));

  return { upcoming, past };
}

/** Cambia el estado de una cita (p. ej. "en_camino"). */
export async function updateAppointmentStatus(appointmentId: string, newStatus: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("appointments")
    .update({ status: newStatus })
    .eq("id", appointmentId);
  if (error) throw new Error(error.message);
}

/**
 * Cierre de trabajo — replica paso a paso `completeAppointment` de TicketViewModel.kt:
 *  1. Ubica el ticket por conversation_id.
 *  2. Sube las fotos al bucket `tickets_attachments`.
 *  3. Inserta la nota en `ticket_notes`.
 *  4. Registra cada foto en `ticket_attachments`.
 *  5. Cambia el estado del ticket — un "Retiro" queda en `en_espera` (requiere confirmación
 *     del operador), el resto pasa a `resuelto`.
 *  6. Marca la cita como `completado`.
 */
export async function completeAppointment(
  appointment: Appointment,
  notes: string,
  photos: File[],
  tecnico: Tecnico
): Promise<{ isRetiro: boolean; sinTicket?: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();
  const authUserId = session?.user?.id;
  if (!authUserId) throw new Error("Tu sesión venció. Vuelve a iniciar sesión.");

  const isRetiro = (appointment.service_type ?? "").trim().toLowerCase() === "retiro";

  /*
   * Cita sin ticket ni conversación. Antes moría acá y el técnico no tenía forma
   * de cerrar ese trabajo nunca — hay dos así, abiertas desde agosto. Existen
   * porque son anteriores al trigger que llena `ticket_id`, o porque no había
   * ningún ticket abierto cuando se agendaron.
   */
  if (!appointment.ticket_id && !appointment.conversation_id) {
    await cerrarCitaSinTicket(appointment, notes, photos.length > 0, tecnico);
    return { isRetiro, sinTicket: true };
  }

  /*
   * 1. Ticket asociado a la conversación.
   *
   * Una conversación acumula varios tickets con el tiempo (un mismo cliente vuelve
   * a escribir), y la cita no guarda a cuál pertenece: el único vínculo es
   * `conversation_id`, que es uno a muchos. Antes se tomaba `tickets[0]` sin
   * ordenar, y PostgREST no garantiza ningún orden — el cierre marcaba como
   * resuelto un ticket cualquiera de la conversación en vez del que el técnico
   * acababa de atender, dejando el suyo abierto.
   *
   * Mientras la cita no guarde su `ticket_id`, lo más cercano es el ticket abierto
   * más reciente: es el que puede corresponder al trabajo que se está cerrando.
   *
   * "Abierto" se define por exclusión y no por `status = "abierto"`. La tabla usa
   * once estados y solo `resuelto` y `cerrado` significan cerrado: filtrar por el
   * literal se saltaría tickets perfectamente vivos en `en_proceso`, `agendado` o
   * `esperando_respuesta`.
   */
  /*
   * Si la cita trae `ticket_id` no hay nada que deducir: es el vínculo exacto que el
   * backend agregó justamente para esto. La búsqueda por conversación queda solo
   * como respaldo para las citas antiguas, que lo tienen vacío.
   */
  const consulta = (supabase as any)
    .from("tickets")
    .select("id, company_id, status, closed_at")
    .is("deleted_at", null);

  const { data: tickets, error: errTickets } = appointment.ticket_id
    ? await consulta.eq("id", appointment.ticket_id)
    : await consulta
        .eq("conversation_id", appointment.conversation_id)
        .order("created_at", { ascending: false });
  if (errTickets) throw new Error(`No se pudo consultar el ticket: ${errTickets.message}`);

  const CERRADOS = new Set(["resuelto", "cerrado"]);
  type Fila = { id: string; company_id: string; status: string | null; closed_at: string | null };
  const lista = (tickets ?? []) as Fila[];
  const abierto = (t: Fila) => !CERRADOS.has((t.status ?? "").trim().toLowerCase()) && !t.closed_at;

  // Si no queda ninguno abierto se usa el más reciente: cerrar la cita no puede
  // quedar bloqueado porque los tickets de la conversación ya estén todos cerrados.
  const ticket = lista.find(abierto) ?? lista[0];
  if (!ticket) {
    // Misma salida: sin ticket no hay dónde guardar la nota, pero la cita se cierra.
    await cerrarCitaSinTicket(appointment, notes, photos.length > 0, tecnico);
    return { isRetiro, sinTicket: true };
  }

  const ticketId = ticket.id as string;
  const companyId = (ticket.company_id as string) ?? tecnico.company_id ?? "";

  // 2. Subir fotos al bucket público
  const publicUrls: string[] = [];
  for (const file of photos) {
    const unique = Math.random().toString(36).slice(2, 8);
    const path = `${ticketId}/foto_${Date.now()}_${unique}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("tickets_attachments")
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    if (upErr) throw new Error(`Error al subir la foto: ${upErr.message}`);
    const { data: pub } = supabase.storage.from("tickets_attachments").getPublicUrl(path);
    publicUrls.push(pub.publicUrl);
  }

  // 3. Nota del técnico
  const hasText = notes.trim().length > 0;
  if (hasText || publicUrls.length > 0) {
    const { error } = await (supabase as any).from("ticket_notes").insert({
      ticket_id: ticketId,
      content: hasText ? notes.trim() : "Evidencia fotográfica adjunta por el técnico.",
      author_id: authUserId,
      author_name: tecnico.name ?? "Técnico",
      is_internal: false,
    });
    if (error) throw new Error(`No se pudo guardar la nota del trabajo: ${error.message}`);
  }

  // 4. Registrar las fotos como adjuntos del ticket
  for (const url of publicUrls) {
    const { error } = await (supabase as any).from("ticket_attachments").insert({
      ticket_id: ticketId,
      company_id: companyId,
      uploaded_by: authUserId,
      file_url: url,
      mime_type: "image/jpeg",
    });
    if (error) throw new Error(`No se pudo registrar la evidencia: ${error.message}`);
  }

  /*
   * 5. Estado del ticket — "Retiro" espera confirmación del operador.
   *
   * El error se comprueba a propósito. Antes estos `await` descartaban la
   * respuesta, así que un rechazo de la base pasaba inadvertido: el técnico veía
   * "Trabajo completado" y el ticket seguía abierto, sin rastro de por qué.
   */
  const { error: errTicket } = await (supabase as any)
    .from("tickets")
    .update({ status: isRetiro ? "en_espera" : "resuelto" })
    .eq("id", ticketId);
  if (errTicket) throw new Error(`No se pudo cerrar el ticket: ${errTicket.message}`);

  // 6. Cita completada
  const { error: errCita } = await (supabase as any)
    .from("appointments")
    .update({ status: "completado" })
    .eq("id", appointment.id);
  if (errCita) throw new Error(`El ticket se cerró, pero no se pudo marcar la cita: ${errCita.message}`);

  return { isRetiro };
}

/**
 * Cierre de una cita que no tiene ticket asociado.
 *
 * `ticket_notes`, `ticket_attachments` y la ruta del bucket cuelgan todos de un
 * ticket, así que no hay dónde poner la nota ni la foto. Se escribe en la propia
 * cita y se deja dicho que la foto no se pudo adjuntar, en vez de decir que todo
 * salió bien.
 */
async function cerrarCitaSinTicket(
  appointment: Appointment,
  notes: string,
  habiaFotos: boolean,
  tecnico: Tecnico,
): Promise<void> {
  const previas = (appointment.notes ?? "").trim();
  const partes = [`[Cierre técnico — ${tecnico.name ?? "Técnico"}]`];
  if (notes.trim()) partes.push(notes.trim());
  if (habiaFotos) partes.push("(las fotos no se pudieron adjuntar: esta cita no tiene ticket)");
  const cierre = partes.join(" ");

  const { error } = await (supabase as any)
    .from("appointments")
    .update({ status: "completado", notes: previas ? `${previas}

${cierre}` : cierre })
    .eq("id", appointment.id);
  if (error) throw new Error(`No se pudo cerrar la cita: ${error.message}`);
}
