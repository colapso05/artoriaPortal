import { useState } from "react";
import {
  ArrowLeft, MapPin, User, Phone, FileText, Navigation,
  CheckCircle2, Loader2, Truck, IdCard, Clock, MessageCircle,
} from "lucide-react";
import { estadoCita, formatFechaHora } from "./estado";
import { isFinished, type Appointment } from "@/lib/tecnicos/api";

/** Detalle de una cita: datos del cliente y acciones del técnico. */
export function TecnicoDetalle({
  appointment,
  onBack,
  onEnCamino,
  onCompletar,
}: {
  appointment: Appointment;
  onBack: () => void;
  onEnCamino: () => Promise<void>;
  onCompletar: () => void;
}) {
  const [marcando, setMarcando] = useState(false);
  const est = estadoCita(appointment.status);
  const yaEnCamino = (appointment.status ?? "").toLowerCase() === "en_camino";
  const terminada = isFinished(appointment.status);

  const marcarEnCamino = async () => {
    if (marcando) return;
    setMarcando(true);
    try { await onEnCamino(); } finally { setMarcando(false); }
  };

  const mapsUrl = appointment.client_address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appointment.client_address)}`
    : null;

  return (
    <div className="min-h-[100dvh] bg-[var(--tec-fondo)] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[var(--tec-fondo-velo)] backdrop-blur border-b border-[var(--tec-borde)] px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 h-16">
          <button
            onClick={onBack}
            className="w-10 h-10 -ml-2 rounded-xl flex items-center justify-center text-[var(--tec-texto-2)] active:scale-95 transition-transform"
            aria-label="Volver a la agenda"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-[var(--tec-texto)] leading-tight truncate">
              {appointment.service_type || "Detalle del trabajo"}
            </p>
            <p className="text-[11px] text-[var(--tec-texto-3)] leading-tight">
              {formatFechaHora(appointment.start_datetime)}
            </p>
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md flex-shrink-0"
            style={{ color: est.color, backgroundColor: est.bg }}
          >
            {est.label}
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3">
        {/* Datos del cliente */}
        <section data-tour="cliente" className="rounded-2xl border border-[var(--tec-borde)] bg-[var(--tec-superficie)] p-4 space-y-4">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-[var(--tec-texto-3)]">
            Datos del cliente
          </h2>

          <Dato icon={User} label="Nombre del titular" value={appointment.client_name} />
          {appointment.client_rut && (
            <Dato icon={IdCard} label="RUT" value={appointment.client_rut} mono />
          )}

          {/* Dirección con acceso a mapas */}
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-[var(--tec-acento)] mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-[var(--tec-texto-3)]">Dirección de servicio</p>
              <p className="text-[14px] text-[var(--tec-texto)] font-medium leading-snug break-words">
                {appointment.client_address || "Sin dirección"}
              </p>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 text-[12px] font-bold text-[var(--tec-acento)] active:opacity-70"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Abrir en mapas
                </a>
              )}
            </div>
          </div>

          {/* Teléfono clickeable */}
          {appointment.client_phone && (
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-[var(--tec-acento)] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-[var(--tec-texto-3)]">Teléfono</p>
                <a
                  href={`tel:${appointment.client_phone}`}
                  className="text-[14px] text-[var(--tec-texto)] font-medium active:opacity-70"
                >
                  {appointment.client_phone}
                </a>
              </div>
              {/* Mismo atajo que en la app: el técnico que no contesta el teléfono
                  igual lee WhatsApp cuando está por llegar. */}
              <a
                href={`https://wa.me/${appointment.client_phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Escribir por WhatsApp"
                className="w-9 h-9 rounded-xl bg-[var(--tec-acento)]/15 flex items-center justify-center flex-shrink-0 active:opacity-70"
              >
                <MessageCircle className="w-4 h-4 text-[var(--tec-acento)]" />
              </a>
            </div>
          )}
        </section>

        {/* Indicaciones del operador */}
        {appointment.notes?.trim() && (
          <section className="rounded-2xl border border-[var(--tec-borde)] bg-[var(--tec-superficie)] p-4">
            <h2 className="text-[13px] font-bold uppercase tracking-wider text-[var(--tec-texto-3)] flex items-center gap-2 mb-2.5">
              <FileText className="w-3.5 h-3.5" />
              Indicaciones
            </h2>
            <p className="text-[14px] text-[var(--tec-texto)] leading-relaxed whitespace-pre-wrap break-words">
              {appointment.notes}
            </p>
          </section>
        )}

        {/* Aviso para trabajos de retiro */}
        {(appointment.service_type ?? "").trim().toLowerCase() === "retiro" && !terminada && (
          <div className="rounded-2xl border border-[var(--tec-aviso-borde)] bg-[var(--tec-aviso-suave)] p-4 flex items-start gap-3">
            <Clock className="w-4 h-4 text-[var(--tec-aviso)] mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-[var(--tec-aviso)] leading-relaxed">
              Este es un <strong>retiro de equipo</strong>. Al cerrarlo quedará en espera de
              confirmación del operador, no como resuelto.
            </p>
          </div>
        )}
      </main>

      {/* Acciones */}
      {!terminada && (
        <footer className="sticky bottom-0 bg-[var(--tec-fondo-velo)] backdrop-blur border-t border-[var(--tec-borde)] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-2.5">
          {!yaEnCamino && (
            <button
              data-tour="en-camino"
              onClick={marcarEnCamino}
              disabled={marcando}
              className="w-full h-12 rounded-xl bg-[var(--tec-superficie-2)] border border-[var(--tec-acento-borde)] text-[var(--tec-acento)] font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {marcando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
              {marcando ? "Avisando..." : "Ir al trabajo"}
            </button>
          )}

          {yaEnCamino && (
            <div className="rounded-xl bg-[var(--tec-acento-suave)] border border-[var(--tec-acento-borde)] px-4 py-2.5 flex items-center justify-center gap-2">
              <Truck className="w-4 h-4 text-[var(--tec-acento)]" />
              <p className="text-[13px] font-bold text-[var(--tec-acento)]">Vas en camino</p>
            </div>
          )}

          <button
            data-tour="completar"
            onClick={onCompletar}
            className="w-full h-12 rounded-xl bg-[var(--tec-exito)] text-[var(--tec-sobre-exito)] font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-[0_0_24px_-8px_var(--tec-exito-glow)]"
          >
            <CheckCircle2 className="w-4 h-4" />
            Marcar como completado
          </button>
        </footer>
      )}
    </div>
  );
}

function Dato({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-[var(--tec-acento)] mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-[var(--tec-texto-3)]">{label}</p>
        <p className={`text-[14px] text-[var(--tec-texto)] font-medium break-words ${mono ? "font-mono" : ""}`}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

export default TecnicoDetalle;
