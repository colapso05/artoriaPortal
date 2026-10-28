import * as Sentry from "@sentry/react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Activity, AlertTriangle, ArrowRight, DollarSign, MessageSquareWarning, Smartphone, Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { metricasCanal, evolutionEstado, type FilaMetrica, type EstadoEvolution } from "@/lib/canalSalida";

export interface EmpresaBasica { id: string; company_name: string }

const COLORES = ["hsl(280,100%,70%)", "hsl(200,80%,55%)", "hsl(150,60%,50%)", "hsl(40,90%,55%)", "hsl(0,70%,55%)"];

const clp = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

/**
 * Umbrales del porcentaje de conversaciones con problema.
 * No son una ley: son el punto a partir del cual conviene ir a mirar qué pasó.
 */
const tonoProblema = (pct: number) =>
  pct >= 20 ? { texto: "text-red-500", fondo: "bg-red-500/10 border-red-500/25", etiqueta: "Alerta" }
  : pct >= 10 ? { texto: "text-amber-500", fondo: "bg-amber-500/10 border-amber-500/25", etiqueta: "Atención" }
  : { texto: "text-emerald-500", fondo: "bg-emerald-500/10 border-emerald-500/25", etiqueta: "Normal" };

interface FilaCalidad {
  dia: string; empresa: string;
  analizadas: number; con_problema: number; pct_problema: number; puntaje_prom: number;
}

interface FilaFalla {
  conversation_id: string; wa_id: string; puntaje: number;
  temas?: string | null; errores?: string | null; sugerencias?: string | null;
  resumen?: string | null; sesion: string;
}

interface ReporteIA {
  id: string; created_at: string; status: string;
  /*
   * `agent_feedback` no tiene una columna `description`. Lo que escribe el operador
   * queda repartido en tres: `error_type` (que tipo de error), `wrong_response` (lo
   * que el agente contesto mal) y `expected_response` (lo que debio contestar).
   *
   * Pedir `description` en el select devolvia 400 y la tarjeta quedaba en cero sin
   * mostrar nada roto. Por eso estuvo vacia tanto tiempo.
   */
  error_type?: string | null; wrong_response?: string | null;
  company_id?: string | null;
}

const tarjeta = "rounded-2xl border border-border/20 bg-card/40 backdrop-blur overflow-hidden flex flex-col";
const cabecera = "px-4 py-3 border-b border-border/10 flex items-center gap-2.5 flex-shrink-0";

export default function PanelPlataforma({ empresas, onVerAnalisis, onVerReportes }: {
  empresas: EmpresaBasica[];
  /**
   * Abre el análisis de una conversación que falló: simula la empresa dueña y cae
   * en Rendimiento de IA, con esa conversación abierta. Ir a la bandeja no servía
   * — lo que se quiere ver es por qué le fue mal, no el chat.
   */
  onVerAnalisis?: (destino: { companyId: string; companyName: string; analysisId: string; waId: string }) => void;
  onVerReportes?: () => void;
}) {
  const [calidad, setCalidad] = useState<FilaCalidad[] | null>(null);
  const [fallas, setFallas] = useState<FilaFalla[] | null>(null);
  const [metricas, setMetricas] = useState<Record<string, FilaMetrica[]>>({});
  const [canales, setCanales] = useState<Record<string, EstadoEvolution>>({});
  const [reportes, setReportes] = useState<ReporteIA[]>([]);

  useEffect(() => {
    (supabase as any).rpc("calidad_ia_plataforma", { p_dias: 30 })
      .then(({ data }: any) => setCalidad(Array.isArray(data) ? data : []));

    (supabase as any).rpc("calidad_ia_fallas", { p_company_id: null, p_dias: 7, p_max_puntaje: 6 })
      .then(({ data }: any) => setFallas(Array.isArray(data) ? data : []));

    (supabase as any).from("agent_feedback")
      .select("id, created_at, status, error_type, wrong_response, company_id")
      .neq("status", "resuelto")
      .order("created_at", { ascending: false })
      .limit(3)
      // Se lee la tabla directo, o sea con RLS encima: si la politica no alcanza a
      // los reportes de otras empresas la respuesta viene vacia y sin error visible.
      .then(({ data, error }: any) => {
        if (error) {
          Sentry.captureException(error, { tags: { area: "reportes-ia" } });
          console.error("[reportes] no se pudo leer agent_feedback:", error);
        }
        setReportes(Array.isArray(data) ? data : []);
      });
  }, []);

  useEffect(() => {
    if (!empresas.length) return;
    let cancelado = false;
    // Una llamada por empresa: son pocas y la agregación de cada una ya la hizo
    // Postgres. Sumar acá cuatro arreglos de veinte filas no es un problema.
    Promise.all(empresas.map(e => metricasCanal(e.id).then(r => [e.id, r] as const)))
      .then(pares => { if (!cancelado) setMetricas(Object.fromEntries(pares)); });
    Promise.all(empresas.map(e => evolutionEstado(e.id).then(r => [e.id, r] as const)))
      .then(pares => { if (!cancelado) setCanales(Object.fromEntries(pares)); });
    return () => { cancelado = true; };
  }, [empresas]);

  /**
   * Salud de la IA, agregada de verdad.
   *
   * La RPC devuelve una fila por día y por empresa. Antes las píldoras tomaban la
   * fila más reciente mientras el encabezado decía "últimos 30 días": mostraban un
   * día suelto. Con 5 a 20 conversaciones diarias por empresa eso no es una tasa,
   * es ruido — un día de 9 con una mala dibuja 11%, y uno de 3 con una mala dibuja
   * 33%, sin que haya pasado nada distinto.
   *
   * Se suma primero y se divide al final. Promediar los porcentajes diarios da otro
   * número y está mal: le daría el mismo peso a un día de 3 conversaciones que a uno
   * de 20. El puntaje va ponderado por volumen, por la misma razón.
   */
  const VENTANA_DIAS = 7;
  const { serie, empresasIA, agregadoPorEmpresa } = useMemo(() => {
    const filas = calidad ?? [];
    const nombres = Array.from(new Set(filas.map(f => f.empresa)));

    // Agregado de todo el período, que es lo que dice el título.
    const total: Record<string, { analizadas: number; conProblema: number; puntajePond: number }> = {};
    for (const f of filas) {
      const a = total[f.empresa] ?? { analizadas: 0, conProblema: 0, puntajePond: 0 };
      const n = Number(f.analizadas) || 0;
      a.analizadas += n;
      a.conProblema += Number(f.con_problema) || 0;
      a.puntajePond += (Number(f.puntaje_prom) || 0) * n;
      total[f.empresa] = a;
    }
    const agregado: Record<string, { analizadas: number; conProblema: number; pct: number; puntaje: number }> = {};
    for (const [nombre, a] of Object.entries(total)) {
      agregado[nombre] = {
        analizadas: a.analizadas,
        conProblema: a.conProblema,
        pct: a.analizadas > 0 ? (a.conProblema / a.analizadas) * 100 : 0,
        puntaje: a.analizadas > 0 ? a.puntajePond / a.analizadas : 0,
      };
    }

    // Media móvil de 7 días, como razón de sumas y no como promedio de razones.
    const porDia = new Map<string, Map<string, { analizadas: number; conProblema: number }>>();
    for (const f of filas) {
      const d = porDia.get(f.dia) ?? new Map<string, { analizadas: number; conProblema: number }>();
      d.set(f.empresa, {
        analizadas: Number(f.analizadas) || 0,
        conProblema: Number(f.con_problema) || 0,
      });
      porDia.set(f.dia, d);
    }
    const dias = Array.from(porDia.keys()).sort();
    const serie = dias.map((dia, i) => {
      const punto: Record<string, number | string> = { dia };
      for (const nombre of nombres) {
        let analizadas = 0;
        let conProblema = 0;
        for (let j = Math.max(0, i - (VENTANA_DIAS - 1)); j <= i; j++) {
          const c = porDia.get(dias[j])?.get(nombre);
          if (c) { analizadas += c.analizadas; conProblema += c.conProblema; }
        }
        // Sin datos en la ventana no se dibuja un cero: se deja el hueco.
        if (analizadas > 0) {
          punto[nombre] = (conProblema / analizadas) * 100;
          punto[nombre + "__n"] = analizadas;
          punto[nombre + "__p"] = conProblema;
        }
      }
      return punto;
    });

    return { serie, empresasIA: nombres, agregadoPorEmpresa: agregado };
  }, [calidad]);

  // ── Costo y ahorro, sumando todas las empresas ─────────────────────────────
  const costos = useMemo(() => {
    const porEmpresa = empresas.map(e => {
      const filas = metricas[e.id] ?? [];
      const sum = (k: keyof FilaMetrica) => filas.reduce((a, x) => a + (Number(x[k]) || 0), 0);
      const oficial = sum("oficial");
      const sinCosto = sum("sin_costo");
      const total = oficial + sinCosto;
      return {
        id: e.id, nombre: e.company_name,
        oficial, sinCosto,
        gastado: sum("costo_estimado"),
        ahorrado: sum("ahorro_estimado"),
        // El porcentaje es la métrica honesta: el ahorro en pesos sube solo porque
        // suba el volumen, aunque la proporción sin costo no haya mejorado nada.
        pctSinCosto: total > 0 ? (sinCosto / total) * 100 : 0,
      };
    }).filter(x => x.oficial + x.sinCosto > 0);

    const tot = porEmpresa.reduce((a, x) => ({
      oficial: a.oficial + x.oficial, sinCosto: a.sinCosto + x.sinCosto,
      gastado: a.gastado + x.gastado, ahorrado: a.ahorrado + x.ahorrado,
    }), { oficial: 0, sinCosto: 0, gastado: 0, ahorrado: 0 });
    const total = tot.oficial + tot.sinCosto;

    return { porEmpresa, ...tot, pctSinCosto: total > 0 ? (tot.sinCosto / total) * 100 : 0 };
  }, [empresas, metricas]);

  const nombrePorId = useMemo(
    () => Object.fromEntries(empresas.map(e => [e.id, e.company_name])),
    [empresas],
  );

  /*
   * `calidad_ia_fallas` no dice de qué empresa es cada conversación ni cuál es el
   * id de su análisis, y hacen falta los dos: uno para simular la empresa y el
   * otro para que la pantalla de Rendimiento abra esa fila. Se resuelven con una
   * sola consulta en el momento del clic.
   */
  const abrirAnalisis = async (f: FilaFalla) => {
    if (!onVerAnalisis) return;
    const consulta = (supabase as any)
      .from("conversation_analysis")
      .select("id, company_id")
      .eq("conversation_id", f.conversation_id);
    const { data } = f.sesion
      ? await consulta.eq("session_start", f.sesion).limit(1)
      : await consulta.order("analyzed_at", { ascending: false }).limit(1);
    const fila = Array.isArray(data) ? data[0] : data;
    if (!fila?.company_id) return;
    onVerAnalisis({
      companyId: fila.company_id,
      companyName: nombrePorId[fila.company_id] ?? "",
      analysisId: fila.id,
      waId: f.wa_id,
    });
  };

  return (
    <div className="flex flex-col gap-3">

      {/* ── A. Salud de la IA ── */}
      <div className={tarjeta}>
        <div className={cabecera}>
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
            Salud de la IA — últimos 30 días
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground/40">media móvil de 7 días</span>
        </div>

        {calidad === null ? (
          <div className="h-48 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>
        ) : serie.length === 0 ? (
          <div className="h-32 flex items-center justify-center">
            <p className="text-xs text-muted-foreground/40">Todavía no hay análisis de conversaciones</p>
          </div>
        ) : (
          <>
            {/* El estado de hoy, para no tener que leer la curva si solo quieres el dato */}
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              {empresasIA.map(nombre => {
                const a = agregadoPorEmpresa[nombre];
                const t = tonoProblema(a?.pct ?? 0);
                return (
                  <div key={nombre} className={`rounded-xl border px-3 py-2 ${t.fondo}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{nombre}</p>
                    <p className={`text-[18px] font-black tabular-nums leading-tight ${t.texto}`}>
                      {(a?.pct ?? 0).toFixed(1)}%
                      <span className="text-[10px] font-bold ml-1.5">{t.etiqueta}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground/50">
                      {(a?.conProblema ?? 0).toLocaleString("es-CL")} de {(a?.analizadas ?? 0).toLocaleString("es-CL")}
                      {" en 30 días · puntaje "}{(a?.puntaje ?? 0).toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="h-52 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serie} margin={{ top: 6, right: 12, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" vertical={false} />
                  <XAxis
                    dataKey="dia"
                    tickFormatter={(v: string) => String(v).slice(8, 10)}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    unit="%" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    axisLine={false} tickLine={false}
                  />
                  {/* El porcentaje solo no dice nada con estos volúmenes: al lado va el
                      conteo absoluto de la ventana, que sí se puede juzgar. */}
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                    formatter={(v: any, nombre: any, item: any) => {
                      const d = (item?.payload ?? {}) as Record<string, any>;
                      const n = d[nombre + "__n"];
                      const conProblema = d[nombre + "__p"];
                      return [
                        n ? `${Number(v).toFixed(1)}% · ${conProblema} de ${n} en 7 días` : `${Number(v).toFixed(1)}%`,
                        nombre,
                      ];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {empresasIA.map((nombre, i) => (
                    <Line
                      key={nombre} type="monotone" dataKey={nombre}
                      stroke={COLORES[i % COLORES.length]} strokeWidth={2.5}
                      dot={false} activeDot={{ r: 4 }} connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-3">

        {/* ── B. Conversaciones que fallaron ── */}
        <div className={`${tarjeta} lg:flex-1 min-w-0`}>
          <div className={cabecera}>
            <MessageSquareWarning className="w-4 h-4 text-red-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
              Conversaciones que fallaron
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground/40">últimos 7 días</span>
          </div>

          {/* La ventana de 7 días no es decorativa: n8n solo guarda ese historial de
              ejecuciones, así que más atrás ya no se puede ir a ver qué pasó. */}
          <div className="max-h-[320px] overflow-y-auto divide-y divide-border/10">
            {fallas === null ? (
              <div className="h-32 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>
            ) : fallas.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-[13px] font-semibold text-muted-foreground/70">Ninguna conversación falló esta semana</p>
                <p className="text-[11px] text-muted-foreground/50 mt-1">Se listan las de puntaje 6 o menos.</p>
              </div>
            ) : fallas.map(f => (
              <button
                key={f.conversation_id}
                onClick={() => abrirAnalisis(f)}
                className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black tabular-nums px-1.5 py-0.5 rounded bg-red-500/15 text-red-500">
                    {f.puntaje}/10
                  </span>
                  <span className="text-[12px] font-semibold truncate">{f.wa_id}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/50 whitespace-nowrap">
                    {f.sesion ? formatDistanceToNow(new Date(f.sesion), { addSuffix: true, locale: es }) : ""}
                  </span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
                </div>
                {f.errores && (
                  <p className="text-[11.5px] text-red-400/90 leading-snug mt-1 line-clamp-2">{f.errores}</p>
                )}
                {f.resumen && (
                  <p className="text-[11px] text-muted-foreground/60 leading-snug mt-0.5 line-clamp-2">{f.resumen}</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── C + D. Costo, ahorro y estado de los canales ── */}
        <div className={`${tarjeta} lg:w-[420px] lg:flex-shrink-0`}>
          <div className={cabecera}>
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
              Mensajería del mes
            </span>
          </div>

          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-primary/25 bg-primary/[0.07] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider font-bold text-primary">Costo real</p>
                <p className="text-[19px] font-black tabular-nums leading-tight mt-0.5">{clp(costos.gastado)}</p>
                <p className="text-[10px] text-muted-foreground/60">{costos.oficial.toLocaleString("es-CL")} por API oficial</p>
              </div>
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500">Sin costo</p>
                <p className="text-[19px] font-black tabular-nums leading-tight mt-0.5 text-emerald-500">
                  {costos.pctSinCosto.toFixed(1)}%
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  {costos.sinCosto.toLocaleString("es-CL")} msj · {clp(costos.ahorrado)} ahorrados
                </p>
              </div>
            </div>

            {/* El porcentaje manda sobre los pesos: el ahorro en plata sube solo porque
                suba el volumen. Y el techo no es el 100% — la IA manda alrededor de
                tres de cada cuatro mensajes y esos salen siempre por el canal oficial. */}
            <p className="text-[10.5px] text-muted-foreground/50 leading-relaxed">
              El porcentaje es lo que hay que mirar: el ahorro en pesos crece solo con el
              volumen. Y no todo es alcanzable — los mensajes que manda la IA salen siempre
              por el canal oficial.
            </p>

            <div className="space-y-1.5 pt-1">
              {costos.porEmpresa.map(e => {
                const canal = canales[e.id];
                const facturandoSinQuerer = canal?.canal_default === "evolution" && canal?.canal_efectivo === "ycloud";
                const punto = !canal?.enabled ? "bg-muted-foreground/30"
                  : facturandoSinQuerer ? "bg-red-500 animate-pulse"
                  : canal?.usable ? "bg-emerald-500" : "bg-amber-500";
                return (
                  <div key={e.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-background/40">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${punto}`}
                      title={!canal?.enabled ? "Sin canal sin costo contratado"
                        : facturandoSinQuerer ? "Está configurado el canal sin costo pero se está facturando"
                        : canal?.usable ? "Canal sin costo vinculado" : "Canal sin costo desconectado"}
                    />
                    <span className="text-[11.5px] font-semibold truncate flex-1">{e.nombre}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground/70">{clp(e.gastado)}</span>
                    {/*
                     * Sin canal alternativo contratado el ahorro es cero por construcción,
                     * no por desempeño. Un "0%" al lado de un "29%" se lee como que a esta
                     * empresa le está yendo pésimo, cuando lo que pasa es que no tiene la
                     * función activada. Eso no es un indicador malo: es algo que vender.
                     */}
                    {canal?.enabled ? (
                      <span className="text-[11px] tabular-nums font-bold text-emerald-500 w-20 text-right">
                        {e.pctSinCosto.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-500/80 w-20 text-right leading-tight">
                        sin canal<br />alternativo
                      </span>
                    )}
                  </div>
                );
              })}
              {costos.porEmpresa.length === 0 && (
                <p className="text-[11px] text-muted-foreground/40 text-center py-3">Sin mensajes este mes</p>
              )}
            </div>

            {/* Rojo = configurado el canal sin costo pero saliendo por el que cobra.
                Es la falla cara y la que nadie nota sin un aviso. */}
            {costos.porEmpresa.some(e => canales[e.id]?.canal_default === "evolution" && canales[e.id]?.canal_efectivo === "ycloud") && (
              <p className="text-[11px] text-red-500 font-medium flex items-start gap-1.5 leading-relaxed">
                <Smartphone className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                Hay una empresa configurada en el canal sin costo cuya sesión está caída:
                se le está facturando cada mensaje.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── 8. Reportes de IA recientes ── */}
      <div className={tarjeta}>
        <div className={cabecera}>
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
            Reportes de IA sin resolver
          </span>
          {onVerReportes && (
            <button onClick={onVerReportes} className="ml-auto text-[11px] font-semibold text-primary hover:underline flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="divide-y divide-border/10">
          {reportes.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-muted-foreground/50">No hay reportes sin resolver.</p>
          ) : reportes.map(r => (
            <button
              key={r.id}
              onClick={onVerReportes}
              className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors flex items-start gap-3"
            >
              <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
                r.status === "pendiente" ? "bg-amber-500/15 text-amber-500" : "bg-blue-500/15 text-blue-500"
              }`}>
                {r.status === "pendiente" ? "Sin abrir" : "En curso"}
              </span>
              <span className="text-[12px] text-foreground/85 leading-snug line-clamp-2 flex-1 min-w-0">
                {r.error_type && <strong className="font-semibold">{r.error_type}</strong>}
                {r.error_type && r.wrong_response ? " — " : ""}
                {r.wrong_response || (r.error_type ? "" : "Sin detalle")}
              </span>
              <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap flex-shrink-0">
                {r.company_id ? nombrePorId[r.company_id] ?? "" : ""}
                {" · "}
                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: es })}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
