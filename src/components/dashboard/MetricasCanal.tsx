import { useEffect, useMemo, useState } from "react";
import { TrendingDown, Loader2 } from "lucide-react";
import { metricasCanal, type FilaMetrica } from "@/lib/canalSalida";
import { FRANQUICIA_SERVICIO } from "@/lib/metaMensajeria";
import { inicioMesChile, isoChile } from "@/lib/meses";

const clp = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

const diaCorto = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : String(d.getDate());
};

/**
 * Cuánto se está gastando en mensajes y cuánto se ahorra el canal sin costo.
 *
 * El gráfico son divs y no una librería: es una barra apilada por día dentro de una
 * tarjeta chica, y meter recharts acá agregaría 366 kB al arranque del panel.
 */
export default function MetricasCanal({ companyId }: { companyId: string | null }) {
  const [filas, setFilas] = useState<FilaMetrica[] | null>(null);

  useEffect(() => {
    if (!companyId) { setFilas([]); return; }
    let cancelado = false;
    /*
     * Las fechas se piden explícitas, en hora de Chile. Sin fechas el backend decide qué es
     * "el mes en curso" y el gráfico llegó a empezar el 30 del mes anterior, mezclando un
     * día de septiembre en octubre. El filtro de abajo es el seguro por si lo vuelve a hacer.
     */
    const inicio = inicioMesChile();
    metricasCanal(companyId, inicio, isoChile()).then(r => {
      if (!cancelado) setFilas(r.filter(f => String(f.dia).slice(0, 10) >= inicio));
    });
    return () => { cancelado = true; };
  }, [companyId]);

  const resumen = useMemo(() => {
    const f = filas ?? [];
    const suma = (k: keyof FilaMetrica) => f.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    // El ahorro lo calcula el backend. Antes se deducía dividiendo costo entre
    // mensajes oficiales, que reventaba el día que no hubiera ninguno.
    const oficial = suma("oficial");
    const bruto = suma("costo_estimado");
    /*
     * Al costo se le descuentan los mil mensajes gratis del mes.
     *
     * El backend multiplica todos los mensajes oficiales por el precio de uno, como
     * si se cobraran todos. Pero Meta regala los primeros mil de cada mes, y
     * mostrar el costo sin ese descuento hace parecer que se gasta lo que en
     * realidad no se cobra. Se descuentan mil mensajes al precio promedio por
     * mensaje; con mil o menos, el costo es cero.
     *
     * Es una aproximación y hay que decirlo: la franquicia cubre solo los mensajes
     * de servicio y esta cuenta no distingue categorías.
     */
    const pagados = Math.max(0, oficial - FRANQUICIA_SERVICIO);
    const gastado = oficial > 0 ? bruto * (pagados / oficial) : 0;
    return {
      oficial,
      gratisUsados: Math.min(oficial, FRANQUICIA_SERVICIO),
      sinCosto: suma("sin_costo"),
      // null = la función todavía no devuelve la columna: no se muestra, en vez de un 0 falso.
      movil: f.some(x => x.movil != null) ? suma("movil") : null,
      gastadoBruto: bruto,
      gastado,
      ahorrado: suma("ahorro_estimado"),
      pico: Math.max(1, ...f.map(x => (x.oficial || 0) + (x.sin_costo || 0))),
    };
  }, [filas]);

  if (filas === null) {
    return (
      <div className="rounded-2xl border border-border/25 bg-card/40 p-4 flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  // Vacío legítimo: un mes sin mensajes salientes no es un error.
  if (filas.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/25 bg-card/40 p-4 min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="w-4 h-4 text-emerald-500" />
        <h3 className="text-[13px] font-bold">Mensajes y costo del mes</h3>
      </div>

      {/* Los dos canales enfrentados: cuántos mensajes y qué significó en plata.
          Puestos lado a lado se lee de un vistazo lo que se gastó y lo que no. */}
      <div className="flex flex-col gap-3 min-w-0">
      <div className="grid grid-cols-2 gap-2.5 min-w-0">
        <div className="rounded-xl border border-primary/25 bg-primary/[0.07] px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-primary flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-primary/70" /> API oficial
          </p>
          <p className="text-[19px] font-black tabular-nums leading-tight mt-1">
            {resumen.oficial.toLocaleString("es-CL")}
            <span className="text-[11px] font-semibold text-muted-foreground/70 ml-1">mensajes</span>
          </p>
          <p className="text-[12px] font-bold tabular-nums mt-0.5" title={`Sin descontar los mensajes gratis: ${clp(resumen.gastadoBruto)}`}>
            Costo real: {clp(resumen.gastado)}
          </p>
          <p className="text-[10px] text-muted-foreground/55 leading-snug mt-0.5">
            {resumen.oficial <= FRANQUICIA_SERVICIO
              ? `Todavía dentro de los ${FRANQUICIA_SERVICIO.toLocaleString("es-CL")} mensajes gratis de Meta`
              : `Descontados los ${FRANQUICIA_SERVICIO.toLocaleString("es-CL")} mensajes gratis de Meta`}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-emerald-500/70" /> API no oficial
          </p>
          <p className="text-[19px] font-black tabular-nums leading-tight mt-1">
            {resumen.sinCosto.toLocaleString("es-CL")}
            <span className="text-[11px] font-semibold text-muted-foreground/70 ml-1">mensajes</span>
          </p>
          <p className="text-[12px] font-bold tabular-nums mt-0.5 text-emerald-500">
            Ahorro: {clp(resumen.ahorrado)}
          </p>
        </div>

        {resumen.movil != null && (
          <div className="col-span-2 rounded-xl border border-border/25 bg-secondary/20 px-3 py-2 flex items-baseline justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">Enviados desde el móvil <span className="text-muted-foreground/55">· no cuentan en la API oficial</span></p>
            <p className="text-[14px] font-black tabular-nums">{resumen.movil.toLocaleString("es-CL")}</p>
          </div>
        )}
      </div>

      {/* Barra apilada por día: abajo lo que se cobró, arriba lo que salió gratis. */}
      <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex items-end gap-[3px] h-24 flex-1 min-h-[72px]" role="img" aria-label="Mensajes por día y canal">
        {filas.map(f => {
          const total = (f.oficial || 0) + (f.sin_costo || 0);
          const alto = Math.round((total / resumen.pico) * 100);
          const parteOficial = total > 0 ? Math.round(((f.oficial || 0) / total) * 100) : 0;
          return (
            <div
              key={f.dia}
              title={`Día ${diaCorto(f.dia)} — oficial: ${f.oficial} (${clp(f.costo_estimado || 0)}) · sin costo: ${f.sin_costo} (ahorro ${clp(f.ahorro_estimado || 0)})${f.movil != null ? ` · móvil: ${f.movil}` : ""}`}
              className="flex-1 min-w-0 flex flex-col justify-end"
              style={{ height: "100%" }}
            >
              <div className="w-full rounded-t-sm overflow-hidden flex flex-col justify-end" style={{ height: `${alto}%` }}>
                <div className="w-full bg-emerald-500/70" style={{ height: `${100 - parteOficial}%` }} />
                <div className="w-full bg-primary/70" style={{ height: `${parteOficial}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground/60">
            {(resumen.oficial + resumen.sinCosto + (resumen.movil ?? 0)).toLocaleString("es-CL")} mensajes en total
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/50">
          {diaCorto(filas[0].dia)} — {diaCorto(filas[filas.length - 1].dia)} de este mes
        </span>
      </div>
      </div>
      </div>
    </div>
  );
}
