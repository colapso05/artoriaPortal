import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { FileText, Loader2 } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Tarjeta de PDF estilo WhatsApp: muestra una vista previa de la primera página
 * arriba y el nombre + N páginas abajo. Si la primera página no se puede renderizar
 * (CORS, PDF corrupto, etc.) cae con elegancia a una tarjeta con ícono.
 */
export function PdfPreview({ url, fileName, onOpen }: { url: string; fileName: string; onOpen: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    (async () => {
      try {
        task = pdfjsLib.getDocument({ url });
        const pdf = await task.promise;
        if (cancelled) return;
        setPages(pdf.numPages);
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 560 / base.width); // nitidez razonable
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (!cancelled) setState("ok");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      try { task?.destroy?.(); } catch { /* noop */ }
    };
  }, [url]);

  const meta = `${pages != null ? `${pages} ${pages === 1 ? "página" : "páginas"} · ` : ""}PDF`;

  return (
    <button
      onClick={onOpen}
      className="block w-full max-w-[280px] overflow-hidden rounded-xl border border-border/30 bg-secondary/40 hover:bg-secondary/60 transition mb-1.5 text-left"
    >
      {/* Vista previa de la primera página */}
      {state !== "failed" && (
        <div className="relative bg-white h-[150px] overflow-hidden flex items-start justify-center border-b border-border/20">
          <canvas ref={canvasRef} className={`w-full ${state === "ok" ? "" : "invisible"}`} />
          {state === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
            </div>
          )}
        </div>
      )}
      {/* Pie: ícono + nombre + metadatos */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="shrink-0 w-9 h-9 rounded-lg bg-red-500/15 text-red-500 flex items-center justify-center">
          <FileText className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium truncate leading-tight">{fileName}</p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">{meta} · toca para ver</p>
        </div>
      </div>
    </button>
  );
}

export default PdfPreview;
