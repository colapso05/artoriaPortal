import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BellRing, ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  alertaActiva, alertadosHoy, contadorReclamos,
  type ContadorReclamos,
} from "@/lib/alertaReclamos";

/** Cada cuánto se vuelve a pedir el contador mientras la pestaña está a la vista. */
const REFRESCO_MS = 5000;

const nf = (n: number) => n.toLocaleString("es-CL");

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Franja del sistema de alertas, arriba del inicio.
 *
 * Responde tres preguntas de un vistazo: ¿hay una alerta activa?, ¿cuántos reclamos
 * seguidos lleva la ventana y cuánto falta para que se reinicie?, ¿a cuántos
 * clientes se avisó hoy? Y lleva directo a configurarlo.
 *
 * El contador se pide cada pocos segundos, pero la cuenta regresiva de la ventana
 * corre sola en pantalla cada segundo: pedirla al servidor cada segundo sería
 * gastar consultas para mostrar algo que se puede calcular.
 *
 * Si la base todavía no entrega el contador, esa parte no se dibuja. No se muestra
 * un 0: diría "nadie está reclamando" cuando lo que falta es el dato.
 */
export default function EstadoAlertas({
  companyId, onConfigurar, onVerAlerta,
}: {
  companyId: string;
  /** Lleva a Configuración → Sistema de Alertas (números que reciben el aviso, ventana y umbral). */
  onConfigurar?: () => void;
  /** Lleva a la alerta global en Coberturas. Solo se ofrece cuando hay una alerta activa. */
  onVerAlerta?: () => void;
}) {
  const [activa, setActiva] = useState<boolean | null>(null);
  const [contador, setContador] = useState<ContadorReclamos | null | undefined>(undefined);
  const [hoy, setHoy] = useState<{ clientes: number; respuestasEvitadas: number } | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargarRapido = useCallback(async () => {
    const [a, c] = await Promise.all([alertaActiva(companyId), contadorReclamos(companyId)]);
    setActiva(a);
    setContador(c);
  }, [companyId]);

  useEffect(() => {
    let cancelado = false;
    cargarRapido();
    alertadosHoy(companyId).then(h => { if (!cancelado) setHoy(h); });

    const visible = () => document.visibilityState === "visible";
    const rapido = setInterval(() => { if (visible()) cargarRapido(); }, REFRESCO_MS);
    const lento = setInterval(() => {
      if (visible()) alertadosHoy(companyId).then(h => { if (!cancelado) setHoy(h); });
    }, 30000);

    // Que la alerta se active o se apague se ve al instante, sin esperar al siguiente pedido.
    const canal = supabase
      .channel(`estado_alertas_${companyId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "company_config", filter: `id=eq.${companyId}` },
        () => { cargarRapido(); })
      .subscribe();

    return () => { cancelado = true; clearInterval(rapido); clearInterval(lento); supabase.removeChannel(canal); };
  }, [companyId, cargarRapido]);

  // El reloj solo corre mientras hay una cuenta regresiva que mostrar.
  const hayCuenta = !!contador && contador.reclamos > 0 && !!contador.venceAt;
  useEffect(() => {
    if (!hayCuenta) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hayCuenta]);

  const vence = contador?.venceAt ? new Date(contador.venceAt).getTime() : null;
  const restante = vence != null ? vence - ahora : null;
  // Pasada la hora de vencimiento el contador vuelve a cero aunque el servidor todavía
  // no lo haya dicho: lo contrario sería mostrar un reclamo que ya no cuenta.
  const reclamos = contador ? (restante != null && restante <= 0 ? 0 : contador.reclamos) : 0;
  const umbral = contador?.umbral ?? null;
  const cercano = umbral != null && reclamos >= umbral - 1 && reclamos > 0;
  const disparado = umbral != null && reclamos >= umbral;

  const tono = activa
    ? "border-red-500/40 bg-red-500/[0.07]"
    : disparado ? "border-red-500/30 bg-red-500/[0.05]"
    : "border-border/25 bg-card/40";

  return (
    <div className={`rounded-2xl border px-6 py-4 grid grid-cols-1 md:grid-cols-3 items-center gap-x-8 gap-y-4 ${tono}`}>
      {/* ── Izquierda: estado y accesos ── */}
      <div className="flex flex-col gap-2.5 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          activa ? "bg-red-500/15" : "bg-emerald-500/10"}`}>
          {activa
            ? <ShieldAlert className="w-[18px] h-[18px] text-red-500" />
            : <ShieldCheck className="w-[18px] h-[18px] text-emerald-500" />}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/55">Sistema de alertas</p>
          <p className={`text-[14px] font-black leading-tight flex items-center gap-1.5 ${
            activa === null ? "text-muted-foreground/60" : activa ? "text-red-500" : "text-emerald-500"}`}>
            {activa && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            {activa === null ? "Sin datos" : activa ? "Alerta activa" : "Sin alerta"}
          </p>
        </div>
      </div>
      {(onConfigurar || (activa && onVerAlerta)) && (
        <div className="flex items-center gap-4 pl-[48px]">
          {activa && onVerAlerta && (
            <button onClick={onVerAlerta}
              className="text-[12px] font-bold text-red-500 hover:text-red-400 inline-flex items-center gap-1 transition-colors">
              Ver alerta <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          {onConfigurar && (
            <button onClick={onConfigurar}
              className="text-[12px] font-bold text-primary hover:text-primary/80 inline-flex items-center gap-1 transition-colors">
              Configurar <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      </div>

      {/* ── Centro: contador de reclamos seguidos ── */}
      {contador ? (
        <div className="w-full max-w-[380px] justify-self-center">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/55">
              Reclamos seguidos{contador.ventanaMin ? ` · ${contador.ventanaMin} min` : ""}
            </p>
            <p className={`text-[20px] font-black tabular-nums leading-none ${
              disparado ? "text-red-500" : cercano ? "text-amber-500" : ""}`}>
              {nf(reclamos)}{umbral != null && <span className="text-[11px] font-semibold text-muted-foreground/50"> de {nf(umbral)}</span>}
            </p>
          </div>
          {umbral != null && (
            <div className="h-2 rounded-full bg-secondary/60 overflow-hidden mt-2">
              <div className={`h-full rounded-full transition-[width] duration-500 ${
                disparado ? "bg-red-500" : cercano ? "bg-amber-500" : "bg-primary/70"}`}
                style={{ width: `${Math.min(100, (reclamos / umbral) * 100)}%` }} />
            </div>
          )}
          <p className="text-[12px] text-muted-foreground/70 mt-1.5 tabular-nums">
            {reclamos > 0 && restante != null && restante > 0
              ? `Se reinicia en ${mmss(restante)}`
              : reclamos > 0 ? "Se reinicia al próximo reclamo"
              : `Sin reclamos en los últimos ${contador.ventanaMin ?? "…"} min`}
          </p>
        </div>
      ) : <div />}

      {/* ── Derecha: lo que ya pasó hoy ── */}
      {hoy ? (
        <div className="flex items-center gap-3 md:justify-self-end">
          <BellRing className="w-5 h-5 text-muted-foreground/60 flex-shrink-0" />
          <div>
            <p className="text-[22px] font-black tabular-nums leading-tight">{nf(hoy.clientes)}</p>
            <p className="text-[12px] text-muted-foreground/70 leading-tight">
              cliente{hoy.clientes === 1 ? "" : "s"} avisado{hoy.clientes === 1 ? "" : "s"} hoy
              {hoy.respuestasEvitadas > 0 && ` · ${nf(hoy.respuestasEvitadas)} respuestas evitadas`}
            </p>
          </div>
        </div>
      ) : <div />}
    </div>
  );
}
