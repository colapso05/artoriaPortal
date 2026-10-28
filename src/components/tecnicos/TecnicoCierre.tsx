import { useRef, useState, useEffect } from "react";
import { ArrowLeft, Camera, ImagePlus, X, Loader2, CheckCircle2, Clock } from "lucide-react";
import { compressImage } from "@/lib/tecnicos/image";
import type { Appointment } from "@/lib/tecnicos/api";

interface Foto {
  file: File;
  preview: string;
}

/** Mínimo de caracteres de las notas. Igual que el de la app Android. */
const MIN_NOTAS = 10;

/** Cierre de trabajo: evidencia fotográfica opcional + notas obligatorias. */
export function TecnicoCierre({
  appointment,
  onBack,
  onSubmit,
}: {
  appointment: Appointment;
  onBack: () => void;
  onSubmit: (notes: string, photos: File[]) => Promise<void>;
}) {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [notas, setNotas] = useState("");
  const notasRef = useRef<HTMLTextAreaElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  /** Solo se marca en rojo después de intentar enviar: teñir el campo antes de que
      el técnico escriba nada sería regañarlo por adelantado. */
  const [faltanNotas, setFaltanNotas] = useState(false);
  const [error, setError] = useState("");

  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const esRetiro = (appointment.service_type ?? "").trim().toLowerCase() === "retiro";

  // Liberar las URLs de preview al desmontar (evita fugas de memoria en móvil)
  useEffect(() => {
    return () => { fotos.forEach(f => URL.revokeObjectURL(f.preview)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agregarFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setProcesando(true);
    setError("");
    try {
      const nuevas: Foto[] = [];
      for (const file of Array.from(files)) {
        const comprimida = await compressImage(file);
        nuevas.push({ file: comprimida, preview: URL.createObjectURL(comprimida) });
      }
      setFotos(prev => [...prev, ...nuevas]);
    } catch {
      setError("No se pudo procesar alguna foto. Intenta de nuevo.");
    } finally {
      setProcesando(false);
    }
  };

  const quitarFoto = (idx: number) => {
    setFotos(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const enviar = async () => {
    if (enviando) return;

    /*
     * Las notas son obligatorias: el operador cierra el ticket sin haber estado en
     * el domicilio, y lo único que le dice qué se hizo ahí es lo que escriba el
     * técnico. La foto sigue siendo opcional — hay trabajos que no dejan nada
     * visible que fotografiar.
     *
     * Se piden unos pocos caracteres y no solo "algo": un punto o un "ok" cumplen
     * la validación pero no le sirven a nadie.
     */
    if (notas.trim().length < MIN_NOTAS) {
      setFaltanNotas(true);
      setError(`Cuenta qué hiciste en el domicilio (al menos ${MIN_NOTAS} caracteres). El operador lo necesita para cerrar el ticket.`);
      notasRef.current?.focus();
      notasRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setFaltanNotas(false);
    setError("");
    setEnviando(true);
    try {
      await onSubmit(notas, fotos.map(f => f.file));
      // Al completarse, el contenedor navega de vuelta a la agenda.
    } catch (err: any) {
      setError(err?.message ?? "No se pudo cerrar el trabajo. Revisa tu conexión.");
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[var(--tec-fondo)] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[var(--tec-fondo-velo)] backdrop-blur border-b border-[var(--tec-borde)] px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 h-16">
          <button
            onClick={onBack}
            disabled={enviando}
            className="w-10 h-10 -ml-2 rounded-xl flex items-center justify-center text-[var(--tec-texto-2)] active:scale-95 transition-transform disabled:opacity-40"
            aria-label="Volver al detalle"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-[var(--tec-texto)] leading-tight">Cerrar trabajo</p>
            <p className="text-[11px] text-[var(--tec-texto-3)] leading-tight truncate">
              {appointment.client_name || "Cliente"}
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4">
        {/* Evidencia fotográfica */}
        <section data-tour="fotos" className="rounded-2xl border border-[var(--tec-borde)] bg-[var(--tec-superficie)] p-4">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-[var(--tec-texto-3)] mb-1">
            Evidencia fotográfica
          </h2>
          <p className="text-[12px] text-[var(--tec-texto-4)] mb-3">
            Opcional, pero recomendado para respaldar el trabajo realizado.
          </p>

          {/* Miniaturas */}
          {fotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {fotos.map((f, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-[var(--tec-borde)]">
                  <img src={f.preview} alt={`Evidencia ${i + 1}`} className="w-full h-full object-cover" />
                  {!enviando && (
                    <button
                      onClick={() => quitarFoto(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
                      aria-label={`Quitar foto ${i + 1}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Botones de captura */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => camaraRef.current?.click()}
              disabled={procesando || enviando}
              className="h-11 rounded-xl bg-[var(--tec-superficie-2)] border border-[var(--tec-borde)] text-[var(--tec-texto)] text-[13px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <Camera className="w-4 h-4 text-[var(--tec-acento)]" />
              Cámara
            </button>
            <button
              onClick={() => galeriaRef.current?.click()}
              disabled={procesando || enviando}
              className="h-11 rounded-xl bg-[var(--tec-superficie-2)] border border-[var(--tec-borde)] text-[var(--tec-texto)] text-[13px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <ImagePlus className="w-4 h-4 text-[var(--tec-acento)]" />
              Galería
            </button>
          </div>

          {procesando && (
            <p className="text-[12px] text-[var(--tec-texto-3)] mt-2.5 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Procesando foto...
            </p>
          )}

          {/* capture abre la cámara directamente en el celular */}
          <input
            ref={camaraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { agregarFotos(e.target.files); e.target.value = ""; }}
          />
          <input
            ref={galeriaRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { agregarFotos(e.target.files); e.target.value = ""; }}
          />
        </section>

        {/* Notas */}
        <section className="rounded-2xl border border-[var(--tec-borde)] bg-[var(--tec-superficie)] p-4">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-[var(--tec-texto-3)] mb-3 flex items-center gap-2">
            Notas del trabajo
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[var(--tec-error-suave)] text-[var(--tec-error)] tracking-normal">
              Obligatorio
            </span>
          </h2>
          <textarea
            ref={notasRef}
            value={notas}
            onChange={e => setNotas(e.target.value)}
            disabled={enviando}
            rows={5}
            placeholder="Describe qué hiciste, materiales usados, observaciones para el operador..."
            className={`w-full rounded-xl bg-[var(--tec-superficie-2)] border p-3 text-[14px] text-[var(--tec-texto)] placeholder:text-[var(--tec-texto-4)] outline-none transition-colors resize-none disabled:opacity-60 ${
              faltanNotas
                ? "border-[var(--tec-error-borde)] focus:border-[var(--tec-error)]"
                : "border-[var(--tec-borde)] focus:border-[var(--tec-acento)]"
            }`}
          />
        </section>

        {/* Aviso de retiro */}
        {esRetiro && (
          <div className="rounded-2xl border border-[var(--tec-aviso-borde)] bg-[var(--tec-aviso-suave)] p-4 flex items-start gap-3">
            <Clock className="w-4 h-4 text-[var(--tec-aviso)] mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-[var(--tec-aviso)] leading-relaxed">
              Al ser un <strong>retiro</strong>, el ticket quedará <strong>en espera</strong> de
              confirmación del operador.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-[var(--tec-error-borde)] bg-[var(--tec-error-suave)] px-4 py-3">
            <p className="text-[13px] text-[var(--tec-error)] leading-snug">{error}</p>
          </div>
        )}
      </main>

      {/* Enviar */}
      <footer className="sticky bottom-0 bg-[var(--tec-fondo-velo)] backdrop-blur border-t border-[var(--tec-borde)] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          onClick={enviar}
          disabled={enviando || procesando}
          className="w-full h-12 rounded-xl bg-[var(--tec-exito)] text-[var(--tec-sobre-exito)] font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 shadow-[0_0_24px_-8px_var(--tec-exito-glow)]"
        >
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {enviando ? "Enviando..." : "Confirmar cierre"}
        </button>
        {enviando && (
          <p className="text-[11px] text-[var(--tec-texto-3)] text-center mt-2">
            Subiendo evidencia, no cierres la app...
          </p>
        )}
      </footer>
    </div>
  );
}

export default TecnicoCierre;
