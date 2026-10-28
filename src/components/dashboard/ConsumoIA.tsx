import { useEffect, useMemo, useState } from "react";
import { diaMes } from "@/lib/meses";
import { Loader2, Cpu, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  consumoIAGlobal, detalleModelos, type Granularidad,
  type PuntoConsumoGlobal, type FilaModelo,
} from "@/lib/consumoIA";

/**
 * Lo que cuestan los modelos, para el dueño.
 *
 * Esta pantalla existe solo para el administrador de la plataforma. La empresa ve
 * su consumo en otro lado y sin dinero: cuánto lleva de su plan y nada más.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const hace = (dias: number) => iso(new Date(Date.now() - dias * 86400000));
const nf = (n: number) => (n || 0).toLocaleString("es-CL");
const usd = (n: number) =>
  "US$ " + (n || 0).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Los tokens se cuentan de a millones; en unidades no se lee. */
const millones = (n: number) => ((n || 0) / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 2 }) + " M";

const RANGOS = [
  { key: "30d", label: "30 días", dias: 30, gran: "dia" as Granularidad },
  { key: "90d", label: "90 días", dias: 90, gran: "semana" as Granularidad },
  { key: "365d", label: "12 meses", dias: 365, gran: "mes" as Granularidad },
];

const EJE = { fontSize: 10, fill: "hsl(var(--muted-foreground))", opacity: 0.55 };

export default function ConsumoIA() {
  const [rango, setRango] = useState(RANGOS[0]);
  const [filas, setFilas] = useState<PuntoConsumoGlobal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [empresaSel, setEmpresaSel] = useState<string | null>(null);
  const [modelos, setModelos] = useState<FilaModelo[]>([]);
  const [cargandoModelos, setCargandoModelos] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    consumoIAGlobal(hace(rango.dias), iso(new Date()), rango.gran).then(r => {
      if (cancelado) return;
      setFilas(r);
      setCargando(false);
    });
    return () => { cancelado = true; };
  }, [rango]);

  useEffect(() => {
    if (!empresaSel) { setModelos([]); return; }
    let cancelado = false;
    setCargandoModelos(true);
    detalleModelos(empresaSel, hace(rango.dias), iso(new Date())).then(r => {
      if (cancelado) return;
      setModelos(r);
      setCargandoModelos(false);
    });
    return () => { cancelado = true; };
  }, [empresaSel, rango]);

  const primerDia = filas.find(f => f.primer_dia_con_datos)?.primer_dia_con_datos ?? null;

  const { serie, porEmpresa, totales } = useMemo(() => {
    /*
     * La RPC devuelve una fila por período × empresa × modelo × sistema. Acá se
     * agrupa dos veces sobre el mismo arreglo: una por período para el gráfico y
     * otra por empresa para la tabla.
     */
    const porPeriodo = new Map<string, { periodo: string; confirmado: number; estimado: number; llamadas: number }>();
    const emp = new Map<string, {
      id: string; nombre: string; confirmado: number; estimado: number;
      llamadas: number; tokensIn: number; tokensOut: number;
    }>();
    let confirmado = 0, estimado = 0, llamadas = 0, tokensIn = 0, tokensOut = 0;

    for (const f of filas) {
      const c = Number(f.costo_confirmado_usd) || 0;
      const e = Number(f.costo_estimado_usd) || 0;
      const l = Number(f.llamadas) || 0;
      const ti = Number(f.tokens_in) || 0;
      const to = Number(f.tokens_out) || 0;

      const p = porPeriodo.get(f.periodo) ?? { periodo: f.periodo, confirmado: 0, estimado: 0, llamadas: 0 };
      p.confirmado += c; p.estimado += e; p.llamadas += l;
      porPeriodo.set(f.periodo, p);

      const a = emp.get(f.company_id) ?? {
        id: f.company_id, nombre: f.company_name, confirmado: 0, estimado: 0,
        llamadas: 0, tokensIn: 0, tokensOut: 0,
      };
      a.confirmado += c; a.estimado += e; a.llamadas += l; a.tokensIn += ti; a.tokensOut += to;
      emp.set(f.company_id, a);

      confirmado += c; estimado += e; llamadas += l; tokensIn += ti; tokensOut += to;
    }

    return {
      // Solo los períodos que la RPC trajo. Rellenar con ceros haría que un día sin
      // registro se lea como un día sin consumo, y no es lo mismo.
      serie: [...porPeriodo.values()].sort((a, b) => a.periodo.localeCompare(b.periodo)),
      porEmpresa: [...emp.values()].sort((a, b) => (b.confirmado + b.estimado) - (a.confirmado + a.estimado)),
      totales: { confirmado, estimado, llamadas, tokensIn, tokensOut },
    };
  }, [filas]);

  const total = totales.confirmado + totales.estimado;
  const pctEstimado = total > 0 ? (totales.estimado / total) * 100 : 0;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Consumo de IA</h2>
          <p className="text-[12.5px] text-muted-foreground/60">
            Lo que cuestan los modelos, por empresa. Solo lo ves vos.
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-border/30 overflow-hidden text-[11.5px] font-semibold">
          {RANGOS.map(r => (
            <button
              key={r.key}
              onClick={() => setRango(r)}
              className={`px-3 py-1.5 transition-colors ${
                rango.key === r.key ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/*
       * Los tres números y la proporción, en una sola tarjeta.
       *
       * Antes eran tres tarjetas estiradas a un tercio del ancho cada una, con el
       * número ocupando el 40% de la izquierda y el resto vacío. El ancho sobrante
       * ahora lo usa la barra: la partición confirmado/estimado es el tema de toda
       * la pantalla y acá se ve de un vistazo, sin leer dos cifras y restarlas.
       */}
      <div className="rounded-2xl border border-border/25 bg-card/40 px-4 py-3.5 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-7">
        <div className="grid grid-cols-3 gap-4 lg:gap-6 lg:flex-shrink-0">
          <Cifra rotulo="Gasto del período" valor={cargando ? null : usd(total)}
            pie={`${nf(totales.llamadas)} llamadas`} icono />
          <Cifra rotulo="Confirmado" valor={cargando ? null : usd(totales.confirmado)}
            pie="modelo fijado" tono="text-emerald-500" />
          <Cifra rotulo="Estimado" valor={cargando ? null : usd(totales.estimado)}
            pie="tarifa supuesta" tono="text-amber-500" />
        </div>

        <div className="flex-1 min-w-0 lg:border-l lg:border-border/20 lg:pl-7">
          {cargando ? (
            <div className="h-10" />
          ) : total > 0 ? (
            <>
              <div className="flex items-baseline justify-between text-[10.5px] font-semibold mb-1.5">
                <span className="text-emerald-500">{Math.round(100 - pctEstimado)}% confirmado</span>
                <span className="text-amber-500">{Math.round(pctEstimado)}% estimado</span>
              </div>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-muted/40">
                <div className="bg-emerald-500 transition-[width] duration-500"
                  style={{ width: `${100 - pctEstimado}%` }} />
                <div className="bg-amber-500 transition-[width] duration-500"
                  style={{ width: `${pctEstimado}%` }} />
              </div>
              <p className="text-[10.5px] text-muted-foreground/50 mt-2 leading-snug">
                {millones(totales.tokensIn)} de entrada · {millones(totales.tokensOut)} de salida ·{" "}
                {porEmpresa.length} {porEmpresa.length === 1 ? "empresa" : "empresas"} con consumo
              </p>
            </>
          ) : (
            <p className="text-[11.5px] text-muted-foreground/50">Sin consumo registrado en el período.</p>
          )}
        </div>
      </div>

      {/*
       * El aviso aparece solo cuando el estimado pesa. Con 85% estimado —que es lo
       * que hay hoy en Dropp— el total de arriba no es un dato duro, y decirlo acá
       * es más honesto que un asterisco que nadie lee.
       */}
      {!cargando && pctEstimado >= 25 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3.5 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-muted-foreground/80 leading-relaxed">
            <strong className="text-foreground">{Math.round(pctEstimado)}% de este gasto es estimado.</strong>{" "}
            Son nodos de n8n sin modelo fijado: corren con el modelo por defecto y el costo se
            calcula con una tarifa supuesta. Fijar el modelo en esos nodos convierte la
            estimación en dato.
          </p>
        </div>
      )}

      {primerDia && (
        <p className="text-[11px] text-muted-foreground/55">
          El registro de consumo empieza el{" "}
          <strong className="text-foreground/80">{new Date(primerDia + "T12:00:00").toLocaleDateString("es-CL")}</strong>.
          Lo anterior no existe y no se puede reconstruir: n8n borra sus ejecuciones a los 7 días.
        </p>
      )}

      {/* ── Gasto en el tiempo ── */}
      <div className="rounded-2xl border border-border/25 bg-card/40 p-4">
        <h3 className="text-[13px] font-bold">Gasto en el tiempo</h3>
        <p className="text-[10.5px] text-muted-foreground/50 mt-0.5 mb-3">
          Las dos franjas se suman. Solo aparecen los períodos con registro.
        </p>
        {cargando ? (
          <div className="h-[220px] flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/30" />
          </div>
        ) : serie.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center">
            <p className="text-[12px] text-muted-foreground/50">Todavía no hay consumo registrado en este período</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={serie} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.25} vertical={false} />
              <XAxis dataKey="periodo" tick={EJE} tickLine={false} axisLine={false} minTickGap={24}
                tickFormatter={(v: string) => diaMes(v)} />
              <YAxis tick={EJE} tickLine={false} axisLine={false} width={46}
                tickFormatter={(v: number) => "$" + v.toFixed(v < 1 ? 2 : 0)} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
                  borderRadius: 12, fontSize: 12,
                }}
                formatter={(v: any, name: any) => [usd(Number(v)), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="confirmado" name="Confirmado" stackId="a" fill="hsl(160 70% 45%)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="estimado" name="Estimado" stackId="a" fill="hsl(38 92% 55%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Por empresa ── */}
      <div className="rounded-2xl border border-border/25 bg-card/40 p-4">
        <h3 className="text-[13px] font-bold">Por empresa</h3>
        <p className="text-[10.5px] text-muted-foreground/50 mt-0.5 mb-3">
          Toca una para ver qué modelos usó.
        </p>
        {cargando ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground/30" /></div>
        ) : porEmpresa.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/50 py-6 text-center">Sin consumo en el período</p>
        ) : (
          <div className="space-y-1.5">
            {porEmpresa.map(e => {
              const t = e.confirmado + e.estimado;
              const abierta = empresaSel === e.id;
              return (
                <div key={e.id}>
                  <button
                    onClick={() => setEmpresaSel(abierta ? null : e.id)}
                    className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition-colors ${
                      abierta ? "border-primary/40 bg-primary/5" : "border-border/20 hover:bg-muted/30"}`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-bold truncate">{e.nombre}</span>
                      <span className="text-[13px] font-black tabular-nums flex-shrink-0">{usd(t)}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 mt-0.5">
                      <span className="text-[10.5px] text-muted-foreground/55">
                        {nf(e.llamadas)} llamadas · {millones(e.tokensIn)} entrada · {millones(e.tokensOut)} salida
                      </span>
                      {e.estimado > 0 && (
                        <span className="text-[10px] text-amber-500/85 flex-shrink-0">
                          {usd(e.estimado)} estimado
                        </span>
                      )}
                    </div>
                  </button>
                  {abierta && (
                    <div className="mt-1.5 mb-2 ml-3 pl-3 border-l border-border/25">
                      {cargandoModelos ? (
                        <div className="py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground/30" /></div>
                      ) : modelos.length === 0 ? (
                        <p className="text-[11.5px] text-muted-foreground/50 py-3">Sin detalle por modelo</p>
                      ) : (
                        <TablaModelos filas={modelos} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Una cifra suelta dentro de la tarjeta de resumen; ya no lleva borde propio. */
function Cifra({ rotulo, valor, pie, tono = "", icono = false }: {
  rotulo: string; valor: string | null; pie: string; tono?: string; icono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icono && <Cpu className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
        <span className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground/55 truncate">
          {rotulo}
        </span>
      </div>
      {valor === null ? (
        <div className="h-[25px] flex items-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground/25" /></div>
      ) : (
        <p className={`text-[23px] leading-none font-black tabular-nums whitespace-nowrap ${tono}`}>{valor}</p>
      )}
      <p className="text-[10.5px] text-muted-foreground/50 mt-1.5 leading-snug">{pie}</p>
    </div>
  );
}

/**
 * El desglose por modelo, con la tarifa a la vista.
 *
 * La tarifa va en la tabla a propósito: si mañana un costo no cuadra, se puede
 * rehacer la cuenta sin abrir la base ni preguntarle a nadie.
 */
function TablaModelos({ filas }: { filas: FilaModelo[] }) {
  const orden = [...filas].sort((a, b) => (Number(b.costo_usd) || 0) - (Number(a.costo_usd) || 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-muted-foreground/50 text-left">
            <th className="font-semibold pb-1.5 pr-3">Modelo</th>
            <th className="font-semibold pb-1.5 pr-3">Sistema</th>
            <th className="font-semibold pb-1.5 pr-3 text-right whitespace-nowrap">Llamadas</th>
            <th className="font-semibold pb-1.5 pr-3 text-right whitespace-nowrap">Tokens</th>
            <th className="font-semibold pb-1.5 pr-3 text-right whitespace-nowrap">Tarifa /M</th>
            <th className="font-semibold pb-1.5 text-right">Costo</th>
          </tr>
        </thead>
        <tbody>
          {orden.map((f, i) => (
            <tr key={i} className="border-t border-border/15">
              <td className="py-1.5 pr-3">
                <span className="font-medium">{f.modelo}</span>
                {f.es_estimado && (
                  <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-500/85">
                    estimado
                  </span>
                )}
                <span className="block text-[9.5px] text-muted-foreground/45">{f.proveedor}</span>
              </td>
              <td className="py-1.5 pr-3 text-muted-foreground/70">{f.sistema}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{nf(f.llamadas)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">
                {millones(Number(f.tokens_in) + Number(f.tokens_out))}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground/60 whitespace-nowrap">
                {Number(f.tarifa_in_usd).toFixed(2)} / {Number(f.tarifa_out_usd).toFixed(2)}
              </td>
              <td className={`py-1.5 text-right tabular-nums font-bold ${f.es_estimado ? "text-amber-500" : ""}`}>
                {usd(Number(f.costo_usd))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
