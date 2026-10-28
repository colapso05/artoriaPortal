import type { Appointment } from "./api";

/**
 * Cita de mentira que solo existe durante el tour.
 *
 * El recorrido necesita entrar a un trabajo para explicar el detalle, el botón de
 * "ir al trabajo" y el cierre con fotos. Sin esto, un técnico recién llegado —que
 * es justo quien ve el tour— no tendría ninguna cita que abrir y Arto explicaría
 * pantallas que el técnico nunca llega a ver.
 *
 * Equivale a TourDemoData.kt en la app Android.
 */
export const ID_CITA_DEMO = "demo-tour-id";

export const CITA_DEMO: Appointment = {
  id: ID_CITA_DEMO,
  service_type: "Instalación de Fibra Óptica",
  notes: "Este es un trabajo de ejemplo para el recorrido guiado. No es real.",
  client_name: "Cliente Ejemplo",
  client_rut: null,
  client_phone: "+56 9 1234 5678",
  client_address: "Calle Tutorial 123, Ciudad",
  status: "pendiente",
  start_datetime: "2026-01-01T10:00:00+00:00",
  duration_minutes: 60,
  conversation_id: null,
  technician_id: "demo",
  created_at: null,
};

/** True si la cita es la del tour: nunca debe escribirse en la base de datos. */
export const esCitaDemo = (id: string | null | undefined) => id === ID_CITA_DEMO;
