/**
 * Lo que Meta cobra por los mensajes de WhatsApp en Chile.
 *
 * Las cifras salen del archivo de tarifas que Meta publica en su documentación
 * ("Cost per message … effective October 1, 2026"), fila de Chile:
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
 *
 * Meta puede cambiarlas solo el primer día de cada trimestre (1 de enero, abril,
 * julio y octubre). Cuando eso pase hay que actualizar este archivo y la fecha.
 *
 * Importante: esto es una referencia, no la factura. Lo que de verdad cobró cada
 * mensaje queda registrado en su estado de entrega, y esa cifra manda cuando
 * existe (ver `lib/plantillasHistorial.ts`).
 */

export const TARIFAS_VIGENTES_DESDE = "2026-10-01";
export const TARIFAS_FUENTE = "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing";

export type CategoriaMeta = "marketing" | "utility" | "authentication" | "service";

/** Por mensaje entregado, en dólares. */
export const TARIFA_USD: Record<CategoriaMeta, number> = {
  marketing: 0.0889,
  utility: 0.02,
  authentication: 0.02,
  service: 0.02,
};

/** Por mensaje entregado, en pesos chilenos (para empresas facturadas en CLP). */
export const TARIFA_CLP: Record<CategoriaMeta, number> = {
  marketing: 78.4917,
  utility: 17.6584,
  authentication: 17.6584,
  service: 17.6584,
};

/**
 * Mensajes de servicio que Meta no cobra cada mes, desde el 1 de octubre de 2026.
 *
 * Va por número de teléfono y no por cuenta: una empresa con tres números tiene
 * tres mil. Cubre solo la categoría servicio: las plantillas de utilidad, marketing
 * y autenticación se cobran desde la primera.
 *
 * No aparece en la tabla de tarifas, que solo trae precios; es una franquicia que
 * se aplica aparte.
 */
export const FRANQUICIA_SERVICIO = 1000;

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El nombre de una categoría como lo escribe la base → la clave de las tarifas. */
export function categoriaMeta(nombre: string): CategoriaMeta | null {
  const n = sinTildes(nombre);
  if (n === "marketing") return "marketing";
  if (n === "utility" || n === "utilidad") return "utility";
  if (n === "authentication" || n === "autenticacion") return "authentication";
  if (n === "service" || n === "servicio") return "service";
  return null;
}

/** La tarifa en dólares de una categoría, o null si no se reconoce. */
export function tarifaUsd(nombre: string): number | null {
  const c = categoriaMeta(nombre);
  return c ? TARIFA_USD[c] : null;
}
