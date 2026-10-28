import { FileText } from "lucide-react";
import { pesoLegible, type Adjunto } from "@/lib/soporte/adjuntos";

/**
 * Adjunto dentro de una burbuja: foto, video, nota de voz o documento.
 * Las fotos y los documentos abren el visor; audio y video se reproducen ahí mismo.
 */
export function AdjuntoMensaje({ adjunto, onAbrir }: { adjunto: Adjunto; onAbrir: () => void }) {
  if (adjunto.tipo === "imagen") {
    return (
      <img
        src={adjunto.url}
        alt={adjunto.nombre}
        onClick={onAbrir}
        className="mb-1 max-h-[320px] w-auto max-w-full cursor-pointer rounded-lg object-cover"
        style={{ minWidth: 120 }}
      />
    );
  }

  if (adjunto.tipo === "video") {
    return (
      <video
        src={adjunto.url}
        controls
        preload="metadata"
        className="mb-1 max-h-[320px] w-full max-w-[260px] rounded-lg"
      />
    );
  }

  if (adjunto.tipo === "audio") {
    return (
      <audio
        src={adjunto.url}
        controls
        preload="metadata"
        className="mb-1 h-10 w-[230px] max-w-full"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="mb-1 flex w-full max-w-[260px] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left"
      style={{ background: "rgba(255,255,255,0.08)" }}
    >
      <FileText className="h-6 w-6 shrink-0" style={{ color: "var(--sop-texto-2)" }} />
      <span className="min-w-0">
        <span className="block truncate text-sm">{adjunto.nombre}</span>
        {adjunto.tamano > 0 && (
          <span className="block text-[11px]" style={{ color: "var(--sop-texto-2)" }}>
            {pesoLegible(adjunto.tamano)}
          </span>
        )}
      </span>
    </button>
  );
}

export default AdjuntoMensaje;
