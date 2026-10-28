import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bot, ChevronLeft, ChevronRight, Cpu, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import {
  consumoIAGlobal, tipoCambio, usoPlanGlobal, TASA_RESPALDO,
  type Granularidad, type PuntoConsumoGlobal, type TipoCambio, type UsoPlanEmpresa,
} from "@/lib/consumoIA";
import { clp } from "@/lib/planes";

/**
 * Lo que cuesta la IA de cada empresa, en pesos, en el panel principal.
 *
 * La pantalla completa de Consumo de IA sigue existiendo para el detalle por
 * modelo y las tarifas. Esto de acá responde una sola pregunta —cuánto me cuesta
 * mantener a cada empresa— sin salir del inicio, y deja moverse entre meses,
 * semanas o días con las flechas.
 *
 * Los montos van en pesos porque es la moneda en que se factura y en que se
 * piensa el margen. La tasa sale de `get_tipo_cambio()` y se muestra con su fecha:
 * un monto convertido con una tasa escondida no se puede revisar contra nada.
 */

const COLORES = ["#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#8b5cf6", "#f59e0b", "#f97316", "#ec4899"];

/*
 * Cuánto se pide en cada granularidad.
 *
 * Se trae una sola vez la ventana entera y las flechas se mueven sobre lo que ya
 * está en memoria: cambiar de mes no debería costar una consulta.
 */
const VENTANA: Record<Granularidad, { dias: number; label: string }> = {
  dia: { dias: 60, label: "Día" },
  semana: { dias: 182, label: "Semana" },
  mes: { dias: 365, label: "Mes" },
};

/** A partir de acá la tasa ya no es "la de hoy" y conviene decirlo. */
const DIAS_TASA_VIEJA = 3;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const nf = (n: number) => (n || 0).toLocaleString("es-CL");
const usd = (n: number) =>
  "US$ " + (n || 0).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rotuloPeriodo = (periodo: string, gran: Granularidad) => {
  const d = new Date(periodo + "T12:00:00");
  if (isNaN(d.getTime())) return periodo;
  if (gran === "mes") return d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  if (gran === "semana") return "semana del " + d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  return d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" });
};

const fechaCorta = (valor: string) => {
  const d = new Date(valor.length <= 10 ? valor + "T12:00:00" : valor);
  return isNaN(d.getTime()) ? valor : d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });
};

interface EmpresaPeriodo {
  id: string;
  nombre: string;
  usd: number;
  estimado: number;
  llamadas: number;
}

interface Periodo {
  periodo: string;
  total: number;
  estimado: number;
  empresas: EmpresaPeriodo[];
}

export default function CostoIAEmpresas({ onVerDetalle }: { onVerDetalle?: () => void }) {
  const [gran, setGran] = useState<Granularidad>("mes");
  const [filas, setFilas] = useState<PuntoConsumoGlobal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tc, setTc] = useState<TipoCambio | null>(null);
  /** 0 es el período más reciente; sube al retroceder en el tiempo. */
  const [atras, setAtras] = useState(0);

  useEffect(() => {
    let cancelado = false;
    tipoCambio().then(r => { if (!cancelado) setTc(r); });
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setAtras(0);
    const desde = iso(new Date(Date.now() - VENTANA[gran].dias * 86400000));
    consumoIAGlobal(desde, iso(new Date()), gran).then(r => {
      if (cancelado) return;
      setFilas(r);
      setCargando(false);
    });
    return () => { cancelado = true; };
  }, [gran]);

  /*
   * Una fila por período × empresa × modelo × sistema se agrupa dos veces: primero
   * por período, después por empresa dentro de cada uno. Solo quedan los períodos
   * que la RPC trajo — un mes sin registro no es un mes con gasto cero.
   */
  const periodos = useMemo<Periodo[]>(() => {
    const mapa = new Map<string, Map<string, EmpresaPeriodo>>();
    for (const f of filas) {
      const conf = Number(f.costo_confirmado_usd) || 0;
      const est = Number(f.costo_estimado_usd) || 0;
      const porEmpresa = mapa.get(f.periodo) ?? new Map<string, EmpresaPeriodo>();
      const e = porEmpresa.get(f.company_id) ?? {
        id: f.company_id, nombre: f.company_name, usd: 0, estimado: 0, llamadas: 0,
      };
      e.usd += conf + est;
      e.estimado += est;
      e.llamadas += Number(f.llamadas) || 0;
      porEmpresa.set(f.company_id, e);
      mapa.set(f.periodo, porEmpresa);
    }
    return [...mapa.entries()]
      .map(([periodo, porEmpresa]) => {
        const empresas = [...porEmpresa.values()].sort((a, b) => b.usd - a.usd);
        return {
          periodo,
          total: empresas.reduce((a, e) => a + e.usd, 0),
          estimado: empresas.reduce((a, e) => a + e.estimado, 0),
          empresas,
        };
      })
      // Del más nuevo al más viejo: `atras` es un índice sobre este orden.
      .sort((a, b) => b.periodo.localeCompare(a.periodo));
  }, [filas]);

  const actual = periodos[atras] ?? null;
  const anterior = periodos[atras + 1] ?? null;

  /*
   * Los mensajes del plan, que es lo mismo que ve la empresa en su panel.
   *
   * El plan se cuenta por ciclo mensual, así que esto solo tiene sentido con la
   * granularidad en Mes: poner el consumo del ciclo entero al lado del gasto de un
   * martes sería comparar dos cosas distintas.
   *
   * Una sola llamada por mes para todas las empresas, y en un ref porque es caché:
   * volver a un mes ya visto no debería pedir nada de nuevo.
   */
  const planes = useRef<Record<string, UsoPlanEmpresa>>({});
  const mesesCargados = useRef<Set<string>>(new Set());
  const [, refrescar] = useState(0);
  const mesDelPeriodo = gran === "mes" && actual ? actual.periodo.slice(0, 8) + "01" : null;

  useEffect(() => {
    if (!mesDelPeriodo || mesesCargados.current.has(mesDelPeriodo)) return;
    let cancelado = false;
    usoPlanGlobal(mesDelPeriodo).then(usos => {
      // Se marca cargado aunque el efecto se haya cancelado: la caché sigue siendo
      // válida y evita volver a pedir el mismo mes al reabrir la pantalla.
      mesesCargados.current.add(mesDelPeriodo);
      for (const f of usos) planes.current[`${f.company_id}|${mesDelPeriodo}`] = f;
      if (!cancelado) refrescar(n => n + 1);
    });
    return () => { cancelado = true; };
  }, [mesDelPeriodo]);

  const planDe = (companyId: string): UsoPlanEmpresa | null =>
    mesDelPeriodo ? planes.current[`${companyId}|${mesDelPeriodo}`] ?? null : null;

  const variacionTotal = anterior && anterior.total > 0 && actual
    ? ((actual.total - anterior.total) / anterior.total) * 100
    : null;

  const pctEstimado = actual && actual.total > 0 ? (actual.estimado / actual.total) * 100 : 0;
  const tasa = tc?.clpPorUsd ?? TASA_RESPALDO;
  const tasaVieja = (tc?.diasAntiguedad ?? 0) >= DIAS_TASA_VIEJA;

  // Los mensajes del plan de todas las empresas del período, si ya llegaron.
  const mensajesTotales = actual
    ? actual.empresas.reduce((a, e) => a + (Number(planDe(e.id)?.mensajes_ia_usados) || 0), 0)
    : 0;

  return (
    <div className="rounded-2xl border border-border/20 bg-card/40 backdrop-blur overflow-hidden flex-shrink-0">
      <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
            Costo de IA por empresa
          </span>
        </div>
        <div className="inline-flex rounded-lg border border-border/30 overflow-hidden text-[10.5px] font-bold">
          {(Object.keys(VENTANA) as Granularidad[]).map(g => (
            <button
              key={g}
              onClick={() => setGran(g)}
              className={`px-2.5 py-1 transition-colors ${
                gran === g ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground/70"}`}
            >
              {VENTANA[g].label}
            </button>
          ))}
        </div>
      </div>

      {cargando ? (
        <div className="h-[150px] flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/25" />
        </div>
      ) : !actual ? (
        <div className="h-[150px] flex items-center justify-center px-4">
          <p className="text-xs text-muted-foreground/40 text-center">
            Sin consumo registrado. El registro empieza el 06-09-2026.
          </p>
        </div>
      ) : (
        <>
          {/* ── Qué período se está mirando ── */}
          <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-border/10">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAtras(a => Math.min(periodos.length - 1, a + 1))}
                disabled={atras >= periodos.length - 1}
                className="p-1 rounded-lg hover:bg-muted/50 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                aria-label="Período anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[12.5px] font-bold capitalize min-w-[132px] text-center">
                {rotuloPeriodo(actual.periodo, gran)}
              </span>
              <button
                onClick={() => setAtras(a => Math.max(0, a - 1))}
                disabled={atras === 0}
                className="p-1 rounded-lg hover:bg-muted/50 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                aria-label="Período siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="text-right">
              <p className="text-[17px] leading-none font-black tabular-nums">
                {clp(actual.total * tasa)}
              </p>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                <span className="text-[10px] text-muted-foreground/45 tabular-nums">{usd(actual.total)}</span>
                {mensajesTotales > 0 && (
                  <span className="text-[10px] text-muted-foreground/45 tabular-nums">
                    · {nf(mensajesTotales)} mensajes
                  </span>
                )}
                {/* La variación solo aparece si hay un período anterior con el que comparar. */}
                {variacionTotal != null && (
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums ${
                    variacionTotal >= 0 ? "text-amber-500" : "text-emerald-500"}`}>
                    {variacionTotal >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {variacionTotal >= 0 ? "+" : ""}{Math.round(variacionTotal)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/*
           * Filas con el monto escrito, igual que la tabla de ingresos de al lado.
           * La barra es referencia visual; lo que se lee es el número.
           */}
          <div className="p-2 space-y-1.5 max-h-[320px] overflow-y-auto">
            {actual.empresas.map((e, i) => {
              const parte = actual.total > 0 ? (e.usd / actual.total) * 100 : 0;
              const color = COLORES[i % COLORES.length];
              const antes = anterior?.empresas.find(a => a.id === e.id);
              const delta = antes && antes.usd > 0 ? ((e.usd - antes.usd) / antes.usd) * 100 : null;
              const plan = planDe(e.id);
              const mensajes = Number(plan?.mensajes_ia_usados) || 0;
              const tope = plan?.tope != null ? Number(plan.tope) : null;
              // Lo que cuesta cada mensaje que mandó el agente. Es el número que
              // permite comparar empresas de distinto tamaño.
              const porMensaje = mensajes > 0 ? (e.usd * tasa) / mensajes : null;
              return (
                <div key={e.id} className="rounded-xl border border-border/20 bg-background/40 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px] font-bold truncate">{e.nombre}</span>
                    <span className="text-[14px] font-black tabular-nums whitespace-nowrap" style={{ color }}>
                      {clp(e.usd * tasa)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(parte, 1.5)}%`, backgroundColor: color }} />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mt-1">
                    <p className="text-[10px] text-muted-foreground/50 tabular-nums">
                      {usd(e.usd)} · {nf(e.llamadas)} llamadas
                    </p>
                    {delta != null && (
                      <p className={`text-[10px] font-semibold tabular-nums ${
                        delta >= 0 ? "text-amber-500/80" : "text-emerald-500/80"}`}>
                        {delta >= 0 ? "+" : ""}{Math.round(delta)}% vs {gran === "mes" ? "mes" : gran === "semana" ? "semana" : "día"} anterior
                      </p>
                    )}
                  </div>

                  {/*
                   * Los mensajes del plan: exactamente el mismo número que la empresa
                   * ve en su panel, para que los dos lados hablen de lo mismo.
                   */}
                  {mensajes > 0 && (
                    <div className="flex items-baseline justify-between gap-2 mt-1 pt-1 border-t border-border/15">
                      <p className="text-[10px] text-muted-foreground/60 tabular-nums flex items-center gap-1">
                        <Bot className="w-3 h-3 text-primary/60 flex-shrink-0" />
                        {nf(mensajes)} {tope != null ? `de ${nf(tope)} del plan` : "mensajes del agente"}
                      </p>
                      {porMensaje != null && (
                        <p className="text-[10px] text-muted-foreground/45 tabular-nums">
                          {clp(porMensaje)} por mensaje
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-4 py-2 border-t border-border/10 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] text-muted-foreground/45 leading-relaxed">
              {tc?.esRespaldo ? (
                <span className="text-amber-500/90 font-semibold">
                  No se pudo leer el tipo de cambio: convertido a ${nf(tasa)} de respaldo.
                </span>
              ) : (
                <>
                  Convertido a ${nf(tasa)} por dólar
                  {tc?.fecha && ` del ${fechaCorta(tc.fecha)}`}
                  {/* La procedencia va escrita: una tasa sin origen no se audita. */}
                  {tc?.origen && ` (${tc.origen})`}
                  {tasaVieja && (
                    <span className="text-amber-500/90 font-semibold">
                      {" "}· la tasa tiene {tc?.diasAntiguedad} días
                    </span>
                  )}
                  .
                </>
              )}
              {pctEstimado >= 1 && (
                <> {" "}<span className="text-amber-500/90 font-semibold">{Math.round(pctEstimado)}% del gasto es estimado</span>{" "}
                  — nodos de n8n sin modelo fijado.</>
              )}
            </p>
            <div className="flex items-center gap-3">
              {gran !== "mes" && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/40 whitespace-nowrap">
                  <AlertTriangle className="w-3 h-3" />
                  los mensajes del plan se ven por mes
                </span>
              )}
              {onVerDetalle && (
                <button
                  onClick={onVerDetalle}
                  className="text-[10.5px] font-bold text-primary/80 hover:text-primary hover:underline whitespace-nowrap"
                >
                  ver el detalle por modelo
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
