/**
 * Archivos del chat de soporte.
 *
 * El cliente puede mandar lo mismo que por WhatsApp: fotos, audios, videos, PDFs,
 * Word, lo que sea. Acá vive todo lo que es "entender el archivo" (qué tipo es,
 * cuánto pesa, cómo se convierte para viajar), separado del envío en sí.
 */

export type TipoAdjunto = "imagen" | "audio" | "video" | "documento";

export interface Adjunto {
  /** URL pública cuando ya está subido, o `blob:` local mientras se envía. */
  url: string;
  tipo: TipoAdjunto;
  nombre: string;
  mime: string;
  /** Bytes. */
  tamano: number;
}

/**
 * Tope por archivo. En modo "directo" el archivo viaja en base64 dentro del mismo
 * POST (crece ~33%), así que un tope alto ahogaría al webhook. WhatsApp permite
 * 16 MB en audio/video y 100 MB en documentos: cuando el backend suba los archivos
 * a Storage se puede subir este número.
 */
export const MAX_ARCHIVO_MB = 10;

const EXT_IMAGEN = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif|svg)$/i;
const EXT_AUDIO = /\.(mp3|ogg|oga|wav|m4a|aac|amr|opus|weba)$/i;
const EXT_VIDEO = /\.(mp4|mov|avi|3gp|mkv|webm|wmv)$/i;

/** Clasifica por MIME y, si el navegador no lo informa, por la extensión. */
export function tipoDeArchivo(mime: string, nombre = ""): TipoAdjunto {
  if (mime.startsWith("image/")) return "imagen";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";

  if (EXT_IMAGEN.test(nombre)) return "imagen";
  if (EXT_AUDIO.test(nombre)) return "audio";
  if (EXT_VIDEO.test(nombre)) return "video";

  return "documento";
}

export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** True si el archivo supera el tope permitido. */
export function pesaDemasiado(archivo: File): boolean {
  return archivo.size > MAX_ARCHIVO_MB * 1024 * 1024;
}

/** Contenido del archivo en base64, sin el prefijo `data:...;base64,`. */
export function aBase64(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.onload = () => {
      const resultado = String(lector.result);
      resolve(resultado.slice(resultado.indexOf(",") + 1));
    };
    lector.readAsDataURL(archivo);
  });
}

/** Descripción corta para el resumen de texto del mensaje ("📷 Foto"). */
export function etiquetaAdjunto(tipo: TipoAdjunto): string {
  switch (tipo) {
    case "imagen": return "📷 Foto";
    case "audio": return "🎤 Audio";
    case "video": return "🎥 Video";
    default: return "📎 Archivo";
  }
}
