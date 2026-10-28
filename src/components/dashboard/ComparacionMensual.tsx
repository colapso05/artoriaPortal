import { useEffect, useState } from "react";
import { Loader2, TrendingDown, TrendingUp, Minus, CalendarRange } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ventasResumen } from "@/lib/planes";
import { ultimosMeses, type Mes } from "@/lib/meses";

interface DatosMes {
  mes: Mes;
  /** Días que van del mes: los de hoy si está en curso, los del mes entero si no. */
  dias: number;
  conversaciones: number;
  contencion: number | null;
  horasAhorradas: number | null;
  ventas: number;
  calidad: number | null;
}

const MESES_A_COMPARAR = 4;
/** Antes del día 5 el ritmo diario es tan ruidoso que la flecha engaña más de lo que informa. */
const DIAS_MINIMOS_PARA_FLECHA = 5;
const nf = (n: number) => Math.round(n || 0).toLocaleString("es-CL");
const nf1 = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const diasDe = (m: Mes) => Number(m.hasta.slice(8, 10));
const mesCorto = (m: Mes) => m.etiqueta.split(" ")[0].slice(0, 3);

/**
 * Cuatro meses lado a lado, con las mismas cifras de las tarjetas de arriba.
 *
 * Sirve para responder "¿vamos mejor o peor?" sin quedarse solo con el mes pasado:
 * se ve la tendencia de los últimos cuatro.
 *
 * El mes en curso está a medias, así que sus totales no se pueden poner al lado de
 * los de un mes completo. Por eso cada total lleva debajo su promedio por día, y
 * la flecha compara ese promedio contra el del mes anterior completo. Los
 * porcentajes y la nota ya son comparables tal cual.
 */
export default function ComparacionMensual({ companyId }: { companyId: string }) {
  const [datos, setDatos] = useState<DatosMes[] | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setDatos(null); setFallo(false);
    const meses = ultimosMeses(MESES_A_COMPARAR);
    Promise.all(meses.map(async (mes): Promise<DatosMes | null> => {
      const [res, ventas] = await Promise.all([
        (supabase as any).rpc("get_analytics_summary", {
          p_company_id: companyId, p_start_date: mes.desde, p_end_date: mes.hasta,
        }),
        ventasResumen(companyId, mes.desde, mes.hasta),
      ]);
      if (res.error) return null;
      const r = Array.isArray(res.data) ? res.data[0] : res.data;
      return {
        mes, dias: diasDe(mes),
        conversaciones: Number(r?.total_conversations) || 0,
        contencion: r?.containment_rate != null ? Number(r.containment_rate) : null,
        horasAhorradas: r?.time_saved_hours != null ? Number(r.time_saved_hours) : null,
        ventas: (ventas ?? []).reduce((a: number, v: any) => a + (Number(v.ventas) || 0), 0),
        calidad: r?.avg_bot_score != null ? Number(r.avg_bot_score) : null,
      };
    })).then(r => {
      if (cancelado) return;
      if (r.every(x => x === null)) { setFallo(true); return; }
      setDatos(r.filter(Boolean) as DatosMes[]);
    });
    return () => { cancelado = true; };
  }, [companyId]);

  /** Flecha del mes en curso contra el anterior completo. null si no hay con qué comparar. */
  const flecha = (actual: number | null, previo: number | null, esPorcentaje = false) => {
    if (actual == null || previo == null || previo === 0) return null;
    if ((datos?.[0]?.dias ?? 0) < DIAS_MINIMOS_PARA_FLECHA) return null;
    const cambio = esPorcentaje ? actual - previo : ((actual - previo) / previo) * 100;
    if (Math.abs(cambio) < (esPorcentaje ? 0.5 : 2)) return { icono: Minus, color: "text-muted-foreground/50", texto: "igual" };
    const sube = cambio > 0;
    return {
      icono: sube ? TrendingUp : TrendingDown,
      color: sube ? "text-emerald-500" : "text-red-500",
      texto: `${sube ? "+" : ""}${esPorcentaje ? cambio.toFixed(1).replace(".", ",") + " pts" : Math.round(cambio) + "%"}`,
    };
  };

  const filas: {
    clave: string; titulo: string;
    valor: (d: DatosMes) => string;
    porDia?: (d: DatosMes) => number | null;
    numero: (d: DatosMes) => number | null;
    esPorcentaje?: boolean;
  }[] = [
    { clave: "conv", titulo: "Conversaciones", valor: d => nf(d.conversaciones), porDia: d => d.conversaciones / d.dias, numero: d => d.conversaciones / d.dias },
    { clave: "cont", titulo: "Resueltas sin operador", valor: d => d.contencion != null ? `${Math.round(d.contencion)}%` : "—", numero: d => d.contencion, esPorcentaje: true },
    { clave: "hrs", titulo: "Tiempo ahorrado", valor: d => d.horasAhorradas != null ? `${nf(d.horasAhorradas)} h` : "—", porDia: d => d.horasAhorradas != null ? d.horasAhorradas / d.dias : null, numero: d => d.horasAhorradas != null ? d.horasAhorradas / d.dias : null },
    { clave: "ven", titulo: "Ventas del agente", valor: d => nf(d.ventas), porDia: d => d.ventas / d.dias, numero: d => d.ventas / d.dias },
    { clave: "cal", titulo: "Calidad del agente", valor: d => d.calidad != null ? nf1(d.calidad) : "—", numero: d => d.calidad, esPorcentaje: true },
  ];

  return (
    <div className="rounded-2xl border border-border/25 bg-card/40 p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-0.5">
        <CalendarRange className="w-4 h-4 text-primary" />
        <h3 className="text-[13px] font-bold">Mes a mes</h3>
      </div>
      <p className="text-[10.5px] text-muted-foreground/50 mb-3">
        Los últimos cuatro meses. La flecha compara el ritmo diario de este mes con el del anterior
        {(datos?.[0]?.dias ?? 99) < DIAS_MINIMOS_PARA_FLECHA ? " y aparece desde el día 5." : "."}
      </p>

      {datos === null && !fallo ? (
        <div className="flex-1 flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary/40" /></div>
      ) : fallo || !datos ? (
        <p className="text-[12px] text-muted-foreground/60 py-6 text-center">No se pudo cargar la comparación.</p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="w-[34%]" />
                {datos.map(d => (
                  <th key={d.mes.clave} className="px-1.5 pb-2 text-right">
                    <span className="block text-[11px] font-bold capitalize">{mesCorto(d.mes)}</span>
                    {d.mes.enCurso && <span className="block text-[9px] font-medium text-muted-foreground/45 normal-case">en curso</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map(f => {
                const actual = datos[0], previo = datos[1];
                const fl = actual && previo ? flecha(f.numero(actual), f.numero(previo), f.esPorcentaje) : null;
                return (
                  <tr key={f.clave} className="border-t border-border/15 align-top">
                    <td className="py-2 pr-2 text-[11.5px] text-muted-foreground/75 leading-tight">{f.titulo}</td>
                    {datos.map((d, i) => (
                      <td key={d.mes.clave} className="px-1.5 py-2 text-right">
                        <span className={`block text-[13px] font-bold tabular-nums leading-tight ${i === 0 ? "" : "text-foreground/80"}`}>{f.valor(d)}</span>
                        {f.porDia && f.porDia(d) != null && (
                          <span className="block text-[9.5px] text-muted-foreground/45 tabular-nums">{nf1(f.porDia(d) as number)} /día</span>
                        )}
                        {i === 0 && fl && (
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${fl.color}`}>
                            <fl.icono className="w-3 h-3" /> {fl.texto}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
