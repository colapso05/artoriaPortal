import { supabase } from "@/integrations/supabase/client";

/**
 * Las plantillas de WhatsApp que envió la empresa, por categoría y por nombre.
 *
 * Existe para explicar el saldo: una empresa puede ver que se le descuenta crédito
 * sin haber llegado todavía a los mensajes gratuitos de Meta, y la causa son las
 * plantillas (mensajes que se mandan fuera de la ventana de conversación). Acá se
 * ve cuántas y cuáles.
 *
 * La función de la base se llama `plantillas_mensajeria(p_company_id, p_dias)`.
 * Qué cuenta como "días" lo decide ella; acá solo se le pasa el número.
 */

export interface PlantillaUso {
  nombre: string;
  cantidad: number;
}

export interface CategoriaUso {
  categoria: string;
  cantidad: number;
  plantillas: PlantillaUso[];
}

export interface UsoPlantillas {
  total: number;
  categorias: CategoriaUso[];
}

/** Resultado de pedirlo: lo que se pudo leer, o por qué no. Nunca un cero inventado. */
export type ResultadoUso =
  | { ok: true; uso: UsoPlantillas }
  | { ok: false; razon: "error" | "formato"; detalle: string };

/*
 * Los nombres de las columnas se leen con alternativas.
 *
 * El contrato de la función no está escrito en ningún lado del repositorio, así
 * que en vez de apostar por un único nombre se aceptan los habituales. Lo que no
 * se reconozca no se rellena con cero: se avisa (ver `normalizar`).
 */
const CLAVES_CATEGORIA = ["categoria", "category", "tipo"];
const CLAVES_NOMBRE = ["plantilla", "nombre_plantilla", "template", "template_name", "nombre"];
const CLAVES_CANTIDAD = ["cantidad", "total", "enviadas", "enviados", "count", "n", "mensajes", "usos"];

const primera = (fila: any, claves: string[]) => {
  for (const c of claves) if (fila && fila[c] !== undefined && fila[c] !== null) return fila[c];
  return undefined;
};

const aNumero = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** La lista de objetos dentro de una fila, si trae el detalle anidado. */
const hijos = (fila: any): any[] | null => {
  if (!fila || typeof fila !== "object") return null;
  for (const v of Object.values(fila)) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") return v as any[];
  }
  return null;
};

const ordenar = <T extends { cantidad: number }>(xs: T[]) => xs.sort((a, b) => b.cantidad - a.cantidad);

/**
 * Convierte lo que devuelva la base a una sola forma.
 *
 * Acepta tanto filas planas {categoria, plantilla, cantidad} como categorías con
 * sus plantillas adentro, y tanto una lista como un objeto que la contiene.
 * Devuelve null si no reconoce la estructura: mostrar ceros por no entender la
 * respuesta le diría a una empresa que no envió plantillas cuando sí lo hizo.
 */
export function normalizar(crudo: unknown): UsoPlantillas | null {
  let filas: any[] | null = null;
  if (Array.isArray(crudo)) filas = crudo;
  else if (crudo && typeof crudo === "object") {
    filas = hijos(crudo) ?? Object.values(crudo as any).find(Array.isArray) as any[] ?? null;
  }
  if (!filas) return null;
  if (filas.length === 0) return { total: 0, categorias: [] };

  const porCategoria = new Map<string, Map<string, number>>();
  const sumar = (cat: string, nombre: string, n: number) => {
    const plantillas = porCategoria.get(cat) ?? new Map<string, number>();
    plantillas.set(nombre, (plantillas.get(nombre) ?? 0) + n);
    porCategoria.set(cat, plantillas);
  };

  for (const fila of filas) {
    const cat = String(primera(fila, CLAVES_CATEGORIA) ?? "").trim();
    if (!cat) return null;

    const detalle = hijos(fila);
    if (detalle) {
      for (const p of detalle) {
        const nombre = String(primera(p, CLAVES_NOMBRE) ?? "").trim();
        const n = aNumero(primera(p, CLAVES_CANTIDAD));
        if (!nombre || n === null) return null;
        sumar(cat, nombre, n);
      }
    } else {
      const nombre = String(primera(fila, CLAVES_NOMBRE) ?? "").trim();
      const n = aNumero(primera(fila, CLAVES_CANTIDAD));
      if (!nombre || n === null) return null;
      sumar(cat, nombre, n);
    }
  }

  const categorias = ordenar(
    [...porCategoria.entries()].map(([categoria, plantillas]) => {
      const lista = ordenar([...plantillas.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })));
      return { categoria, cantidad: lista.reduce((s, p) => s + p.cantidad, 0), plantillas: lista };
    }),
  );
  return { total: categorias.reduce((s, c) => s + c.cantidad, 0), categorias };
}

export async function plantillasEnviadas(companyId: string, dias: number): Promise<ResultadoUso> {
  const { data, error } = await (supabase as any).rpc("plantillas_mensajeria", {
    p_company_id: companyId,
    p_dias: dias,
  });
  if (error) return { ok: false, razon: "error", detalle: error.message };

  const uso = normalizar(data);
  if (!uso) {
    // Se deja el crudo en consola: es lo que hace falta para ajustar la lectura.
    console.error("[plantillas_mensajeria] formato no reconocido:", data);
    return { ok: false, razon: "formato", detalle: "La respuesta de la base no tiene la forma esperada." };
  }
  return { ok: true, uso };
}

/** Las categorías de Meta, con nombre legible. El resto se muestra tal cual vino. */
const NOMBRE_CATEGORIA: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utilidad",
  utilidad: "Utilidad",
  authentication: "Autenticación",
  autenticacion: "Autenticación",
  autenticación: "Autenticación",
  service: "Servicio",
  servicio: "Servicio",
};
export const nombreCategoria = (c: string) => NOMBRE_CATEGORIA[c.trim().toLowerCase()] ?? c;
