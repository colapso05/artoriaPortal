import { useEffect, useMemo, useState } from "react";
import { ChevronDown, History, Loader2, AlertTriangle } from "lucide-react";
import { historialPlantillas, type ResultadoHistorial } from "@/lib/plantillasHistorial";
import { nombreCategoria } from "@/lib/plantillasMensajeria";

const nf = (n: number) => (n || 0).toLocaleString("es-CL");
const usd = (n: number) => "US$ " + n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Cuántas plantillas se enviaron en cada mes, y cuáles.
 *
 * Es la pregunta de "¿en qué se me fue el saldo?" mirada hacia atrás: en
 * septiembre se enviaron tantas, de este tipo, con estas plantillas; en agosto,
 * estas otras. Cada mes se abre y muestra el desglose por categoría.
 *
 * Con dinero, y diciendo de dónde sale. Si la base trae lo que Meta cobró por cada
 * mensaje, esa cifra se muestra tal cual. Si todavía no la trae, se muestra una
 * estimación con la tarifa oficial de Meta, marcada con "≈" y explicada abajo: una
 * estimación vestida de cifra real es peor que no mostrar nada.
 */
const MESES_A_LA_VISTA = 4;
const MESES_MAXIMO = 12;

export default function HistorialPlantillas({ companyId }: { companyId: string }) {
  const [resultado, setResultado] = useState<ResultadoHistorial | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  // Se piden los doce de una vez: es una sola consulta, y así "ver más" es instantáneo.
  useEffect(() => {
    let cancelado = false;
    setResultado(null);
    historialPlantillas(companyId, MESES_MAXIMO).then(r => { if (!cancelado) setResultado(r); });
    return () => { cancelado = true; };
  }, [companyId]);

  const visibles = useMemo(
    () => (resultado?.ok ? resultado.meses.slice(0, verTodos ? MESES_MAXIMO : MESES_A_LA_VISTA) : []),
    [resultado, verTodos],
  );
  const mayor = useMemo(() => Math.max(1, ...visibles.map(m => m.total)), [visibles]);

  return (
    <div className="rounded-2xl border border-border/25 bg-card/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-violet-500" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Plantillas por mes
        </span>
      </div>

      {resultado === null ? (
        <div className="flex justify-center py-5"><Loader2 className="w-5 h-5 animate-spin text-primary/40" /></div>
      ) : resultado.ok === false ? (
        <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">No se pudo cargar el historial.</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 break-words">{resultado.detalle}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {visibles.map(({ mes, total, costoUsd, conMonto, categorias }) => {
            const expandido = abierto === mes.clave;
            const hayDetalle = total > 0;
            return (
              <div key={mes.clave} className="rounded-lg border border-border/20 bg-muted/15">
                <button
                  onClick={() => hayDetalle && setAbierto(expandido ? null : mes.clave)}
                  className={`w-full px-3 py-2.5 text-left ${hayDetalle ? "" : "cursor-default"}`}
                  aria-expanded={expandido}
                  disabled={!hayDetalle}
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${
                      hayDetalle ? "text-muted-foreground/50" : "text-transparent"} ${expandido ? "" : "-rotate-90"}`} />
                    <span className="text-[13px] font-semibold flex-1 truncate">
                      {mes.etiqueta}
                      {mes.enCurso && <span className="text-[10px] font-medium text-muted-foreground/45 ml-1.5">en curso</span>}
                    </span>
                    <span className="text-right leading-tight">
                      <span className={`block text-[13px] font-bold tabular-nums ${hayDetalle ? "" : "text-muted-foreground/40"}`}>
                        {nf(total)}
                      </span>
                      {hayDetalle && conMonto > 0 && (
                        <span className="block text-[10.5px] font-semibold tabular-nums text-muted-foreground/70">
                          {resultado.costoReal ? "" : "≈ "}{usd(costoUsd)}
                        </span>
                      )}
                    </span>
                  </div>
                  {hayDetalle && (
                    <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden mt-2 ml-5">
                      <div className="h-full rounded-full bg-violet-500/70" style={{ width: `${(total / mayor) * 100}%` }} />
                    </div>
                  )}
                </button>

                {expandido && (
                  <div className="px-3 pb-3 pl-8 space-y-2.5">
                    {categorias.map(c => (
                      <div key={c.categoria}>
                        <div className="flex items-baseline gap-2">
                          <span className="text-[12px] font-semibold flex-1 truncate">{nombreCategoria(c.categoria)}</span>
                          <span className="text-[10.5px] text-muted-foreground/50 tabular-nums">
                            {total > 0 ? Math.round((c.cantidad / total) * 100) : 0}%
                          </span>
                          <span className="text-[12px] font-bold tabular-nums w-12 text-right">{nf(c.cantidad)}</span>
                          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground/70 w-[74px] text-right">
                            {c.conMonto > 0 ? `${resultado.costoReal ? "" : "≈ "}${usd(c.costoUsd)}` : "—"}
                          </span>
                        </div>
                        <ul className="mt-0.5 space-y-0.5">
                          {c.plantillas.map(p => (
                            <li key={p.nombre} className="flex items-center gap-2 text-[11.5px] pl-2 border-l border-border/25">
                              <span className="flex-1 truncate font-mono text-muted-foreground" title={p.nombre}>{p.nombre}</span>
                              <span className="font-semibold tabular-nums">{nf(p.cantidad)}</span>
                              <span className="tabular-nums text-muted-foreground/60 w-[74px] text-right">
                                {p.conMonto > 0 ? `${resultado.costoReal ? "" : "≈ "}${usd(p.costoUsd)}` : "—"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={() => setVerTodos(v => !v)}
            className="w-full text-[11.5px] font-semibold text-muted-foreground/60 hover:text-foreground py-1.5 transition-colors"
          >
            {verTodos ? "Ver menos" : `Ver los ${MESES_MAXIMO} meses`}
          </button>
          {resultado.truncado && (
            <p className="text-[10.5px] text-amber-500/90 leading-relaxed pt-1">
              Hay tantas plantillas que solo se pudieron contar las más recientes: los meses antiguos pueden estar incompletos.
            </p>
          )}
          <p className="text-[10.5px] text-muted-foreground/50 leading-relaxed pt-1">
            {resultado.costoReal ? (
              <>
                <strong className="text-foreground/70">Costo real</strong>: lo que Meta cobró por cada mensaje según su estado de
                entrega. Los mensajes sin monto registrado no suman.
              </>
            ) : (
              <>
                <strong className="text-foreground/70">Costo estimado (≈)</strong>: cantidad por la tarifa oficial de Meta para
                Chile, vigente desde el 1 de octubre de 2026. Es un máximo: las plantillas de utilidad enviadas con la
                conversación de 24 horas abierta no se cobran, y los meses anteriores pudieron tener otra tarifa.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
