import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download, FileText } from "lucide-react";

export interface LightboxMedia {
  url: string;
  /** Si no se pasa, se infiere por la extensión de la URL. */
  type?: "image" | "pdf" | "video" | "other";
  name?: string;
}

function inferType(url: string): "image" | "pdf" | "video" | "other" {
  if (/\.(jpe?g|png|webp|gif|heic|bmp|avif)(\?|$)/i.test(url)) return "image";
  if (/\.pdf(\?|$)/i.test(url)) return "pdf";
  if (/\.(mp4|mov|avi|3gp|mkv|webm)(\?|$)/i.test(url)) return "video";
  return "other";
}

/**
 * Visor de medios a pantalla completa, dentro del portal (no abre pestañas nuevas).
 * Muestra imágenes y PDFs; para otros archivos ofrece descarga. Cierra con la X,
 * clic en el fondo o Escape.
 */
export function MediaLightbox({ media, onClose }: { media: LightboxMedia | null; onClose: () => void }) {
  useEffect(() => {
    if (!media) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [media, onClose]);

  if (!media) return null;
  const kind = media.type ?? inferType(media.url);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Controles */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <a
          href={media.url}
          download={media.name || ""}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          title="Descargar"
        >
          <Download className="w-5 h-5" />
        </a>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          title="Cerrar (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {media.name && (
        <div className="absolute top-6 left-6 max-w-[60vw] truncate text-white/80 text-sm font-medium z-10">
          {media.name}
        </div>
      )}

      {/* La imagen ocupa todo el visor aunque sea chica: antes solo se limitaba el máximo, y
          una foto de poca resolución se veía como una estampilla en medio de la pantalla. */}
      <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
        {kind === "image" ? (
          <img
            src={media.url}
            alt={media.name || "Vista previa"}
            className="max-w-[92vw] max-h-[88vh] min-w-[min(92vw,720px)] min-h-[min(88vh,540px)] object-contain rounded-lg"
          />
        ) : kind === "pdf" ? (
          <iframe
            src={media.url}
            title={media.name || "PDF"}
            className="w-[90vw] h-[88vh] rounded-lg bg-white shadow-2xl"
          />
        ) : kind === "video" ? (
          <video
            src={media.url}
            controls
            autoPlay
            playsInline
            className="max-w-[92vw] max-h-[88vh] rounded-lg shadow-2xl bg-black"
          />
        ) : (
          <a
            href={media.url}
            download={media.name || ""}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white px-10 py-12 transition-colors"
          >
            <FileText className="w-12 h-12" />
            <span className="text-sm font-medium">{media.name || "Descargar archivo"}</span>
            <span className="text-xs text-white/60">Este tipo de archivo no tiene vista previa</span>
          </a>
        )}
      </div>
    </div>,
    document.body
  );
}

export default MediaLightbox;
