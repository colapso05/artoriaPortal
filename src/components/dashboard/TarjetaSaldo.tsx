import type { RefObject } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ChevronRight, Loader2, Wallet } from "lucide-react";
import { nivelDelSaldo, useSaldoYcloud, type NivelSaldo } from "@/lib/saldoMensajes";
import { useDolar } from "@/lib/dolar";
import { ESPERA_HOVER_MS, useHoverAbre } from "@/hooks/useHoverAbre";

const TONOS: Record<NivelSaldo, { texto: string; fondo: string; punto: string; chip: string; etiqueta: string; mensaje: string }> = {
  alto: {
    texto: "text-emerald-600 dark:text-emerald-400", fondo: "bg-emerald-500/15", punto: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", etiqueta: "Saldo al día",
    mensaje: "Hay saldo de sobra para este mes.",
  },
  medio: {
    texto: "text-amber-600 dark:text-amber-400", fondo: "bg-amber-500/15", punto: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300", etiqueta: "Conviene recargar",
    mensaje: "Conviene recargar en los próximos días.",
  },
  bajo: {
    texto: "text-red-600 dark:text-red-400", fondo: "bg-red-500/15", punto: "bg-red-500",
    chip: "bg-red-500/15 text-red-700 dark:text-red-300", etiqueta: "Queda poco",
    mensaje: "Cuando se acabe deja de salir cualquier mensaje por el canal oficial.",
  },
};

/**
 * La tarjeta del saldo en el inicio. Es la puerta al panel de Mensajería.
 *
 * Mantener el cursor encima un segundo abre el panel; una barra se va llenando para que
 * se entienda qué está pasando y se pueda cancelar sacando el cursor. Un clic (o Enter) lo
 * abre al instante, para quien no usa mouse o no quiere esperar.
 *
 * El color del saldo avisa solo: verde si alcanza, amarillo si conviene recargar, rojo si
 * queda poco. Y el punto solo late cuando hay algo que atender: si latiera siempre, nadie
 * volvería a mirarlo.
 */
export default function TarjetaSaldo({
  companyId, abierto, alAbrir, innerRef, alEntrar,
}: {
  companyId: string | null;
  abierto: boolean;
  alAbrir: () => void;
  innerRef: RefObject<HTMLDivElement>;
  /** Apenas el cursor llega a la tarjeta (antes de que se cumpla el segundo). */
  alEntrar?: () => void;
}) {
  const { saldo, cargando } = useSaldoYcloud(companyId);
  const { dolar } = useDolar();
  const { encima, manejadores } = useHoverAbre(alAbrir, abierto, alEntrar);

  const nivel = saldo ? nivelDelSaldo(saldo.amount) : null;
  const t = nivel ? TONOS[nivel] : null;
  const pide = nivel === "medio" || nivel === "bajo";
  const usd = saldo
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: saldo.currency }).format(saldo.amount)
    : null;

  return (
    <div
      ref={innerRef}
      role="button" tabIndex={0}
      aria-label="Saldo de mensajes. Abrir el detalle de mensajería"
      {...manejadores}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alAbrir(); } }}
      className="relative overflow-hidden rounded-2xl border border-border/40 bg-card px-5 py-4 flex flex-col text-left cursor-pointer
        transition-shadow hover:shadow-[0_14px_34px_-12px_rgba(20,60,160,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-center gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${t ? t.fondo : "bg-muted"}`}>
          <Wallet className={`w-5 h-5 ${t ? t.texto : "text-muted-foreground"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-muted-foreground">Saldo de mensajes</p>
          {t && (
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2 py-0.5 mt-0.5 ${t.chip}`}>
              <span className={`relative w-1.5 h-1.5 rounded-full ${t.punto}`}>
                {pide && <span className={`absolute inset-0 rounded-full ${t.punto} animate-ping`} />}
              </span>
              {t.etiqueta}
            </span>
          )}
        </div>
      </div>

      {cargando && !saldo ? (
        <div className="h-12 flex items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground/30" /></div>
      ) : saldo && t ? (
        <>
          <p className={`mt-3 text-[34px] leading-none font-extrabold tabular-nums tracking-tight ${t.texto}`}>
            {usd}<span className="ml-1.5 text-[13px] font-bold text-muted-foreground/70">{saldo.currency}</span>
          </p>
          <p className="text-[12.5px] text-muted-foreground mt-1.5">
            {dolar && saldo.currency === "USD" ? `≈ $${Math.round(saldo.amount * dolar.valor).toLocaleString("es-CL")} CLP` : " "}
          </p>
          {pide && <p className={`text-[12px] font-medium mt-1 leading-snug ${t.texto}`}>{t.mensaje}</p>}
        </>
      ) : (
        <div className="mt-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-muted-foreground leading-snug">No se pudo leer el saldo ahora.</p>
        </div>
      )}

      <div className="mt-auto pt-3 flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground/70">
        <span>{encima ? "Mantén el cursor… se abre en 1 s" : "Detalle de mensajería"}</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </div>

      {/* La barra que se llena durante los 3 segundos. Sacar el cursor la vacía. */}
      <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-transparent">
        <motion.div
          className="h-full bg-primary origin-left"
          initial={false}
          animate={{ scaleX: encima ? 1 : 0 }}
          transition={encima ? { duration: ESPERA_HOVER_MS / 1000, ease: "linear" } : { duration: 0.2 }}
        />
      </div>
    </div>
  );
}
