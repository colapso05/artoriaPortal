import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileText, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { historialPlantillas } from "@/lib/plantillasHistorial";
import {
  plantillasEnviadas, nombreCategoria, type ResultadoUso,
} from "@/lib/plantillasMensajeria";

/** Cada cuánto se vuelve a pedir mientras la pestaña está a la vista. */
const REFRESCO_MS = 30_000;

const nf = (n: number) => (n || 0).toLocaleString("es-CL");

/** El mes en curso, contado exacto desde el día 1 (hora de Chile), con la misma forma que el resto. */
async function delMesCalendario(companyId: string): Promise<ResultadoUso> {
  const r = await historialPlantillas(companyId, 1);
  if (r.ok === false) return { ok: false, razon: "error", detalle: r.detalle };
  const mes = r.meses[0];
  return {
    ok: true,
    uso: {
      total: mes.total,
      categorias: mes.categorias.map(c => ({
        categoria: c.categoria, cantidad: c.cantidad,
        plantillas: c.plantillas.map(p => ({ nombre: p.nombre, cantidad: p.cantidad })),
      })),
    },
  };
}

/*
 * Los rangos.
 *
 * "Este mes" pide tantos días como van del mes, que es lo que importa para los
 * mensajes gratuitos de Meta: se renuevan por mes calendario, no cada 30 días.
 * Se calcula al pedir y no una vez al cargar, para que no quede viejo si la
 * pantalla se deja abierta de un mes a otro.
 */
const diaDelMes = () => new Date().getDate();
const RANGOS: { id: string; label: string; dias: () => number }[] = [
  { id: "hoy", label: "Hoy", dias: () => 1 },
  { id: "7d", label: "7 días", dias: () => 7 },
  { id: "mes", label: "Este mes", dias: diaDelMes },
];


/**
 * Qué plantillas está enviando la empresa, y cuántas.
 *
 * Responde la pregunta "¿por qué se me descuenta saldo si no he llegado a mis
 * mensajes gratuitos?": el crédito se va en plantillas, y acá se ve cuáles. Se
 * pide de nuevo solo cada 30 s para que se vea lo que se está enviando ahora.
 */
export default function PlantillasEnviadas({ companyId }: { companyId: string }) {
  const [rango, setRango] = useState(RANGOS[2]);
  const [resultado, setResultado] = useState<ResultadoUso | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [actualizado, setActualizado] = useState<Date | null>(null);

  // Una respuesta lenta de un rango anterior no puede pisar a la del actual.
  const pedido = useRef(0);

  const cargar = useCallback(async (silencioso = false) => {
    const mio = ++pedido.current;
    if (!silencioso) setCargando(true);
    /*
     * "Este mes" sale de la vista, no de la función.
     *
     * `plantillas_mensajeria` cuenta una ventana móvil ("las últimas N días desde
     * ahora"), así que pedirle "los días que van del mes" arrastra los últimos días
     * del mes anterior y no coincide con el mes de Meta. La vista tiene la fecha de
     * cada plantilla y se corta exacto en el día 1.
     */
    const r: ResultadoUso = rango.id === "mes" ? await delMesCalendario(companyId) : await plantillasEnviadas(companyId, rango.dias());
    if (mio !== pedido.current) return;
    setResultado(r);
    setActualizado(new Date());
    setCargando(false);
  }, [companyId, rango]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const t = setInterval(() => {
      // Sin pestaña a la vista no hay a quién mostrarle el número nuevo.
      if (document.visibilityState === "visible") cargar(true);
    }, REFRESCO_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const alternar = (cat: string) =>
    setAbiertas(prev => {
      const sig = new Set(prev);
      if (sig.has(cat)) sig.delete(cat); else sig.add(cat);
      return sig;
    });

  const uso = resultado?.ok ? resultado.uso : null;
  const mayor = useMemo(() => Math.max(1, ...(uso?.categorias.map(c => c.cantidad) ?? [1])), [uso]);

  return (
    /* Mismo formato que la tarjeta del saldo, que es la que tiene encima: la
       columna donde vive es angosta y una tarjeta con cabecera aparte la
       habría hecho el doble de alta. */
    <div className="rounded-2xl border border-border/25 bg-card/40 p-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4 text-violet-500" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 flex-1">
          Plantillas enviadas
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1" onClick={() => cargar()} title="Actualizar ahora">
          <RefreshCw className={`w-3 h-3 ${cargando ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <div className="mb-3">
        <div className="inline-flex rounded-lg border border-border/30 overflow-hidden text-[11px] font-bold">
            {RANGOS.map(r => (
              <button
                key={r.id}
                onClick={() => setRango(r)}
                className={`px-2.5 py-1 transition-colors ${
                  rango.id === r.id ? "bg-primary/15 text-primary" : "hover:bg-muted/50 text-muted-foreground/70"}`}
              >
                {r.label}
              </button>
            ))}
        </div>
      </div>

      <div>
        {cargando && !resultado ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary/40" /></div>
        ) : resultado && resultado.ok === false ? (
          /*
           * Un fallo no se muestra como "0 plantillas": eso le diría a la empresa
           * que no envió ninguna cuando lo que pasó es que no se pudo leer.
           */
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                {resultado.razon === "formato" ? "No se pudo interpretar el detalle de plantillas." : "No se pudo cargar el detalle de plantillas."}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 break-words">{resultado.detalle}</p>
            </div>
          </div>
        ) : uso && uso.total === 0 ? (
          <p className="text-[12px] text-muted-foreground/60 text-center py-4">
            No se enviaron plantillas en este período.
          </p>
        ) : uso ? (
          <div className="space-y-4">
            <div>
              <p className="text-2xl font-black tabular-nums tracking-tight leading-none">{nf(uso.total)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                plantilla{uso.total === 1 ? "" : "s"} enviada{uso.total === 1 ? "" : "s"}
                {actualizado && (
                  <span className="text-muted-foreground/40">
                    {" "}· a las {actualizado.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                  </span>
                )}
              </p>
            </div>

            <div className="space-y-1.5">
              {uso.categorias.map(c => {
                const abierta = abiertas.has(c.categoria);
                return (
                  <div key={c.categoria} className="rounded-lg border border-border/25 bg-muted/20">
                    <button
                      onClick={() => alternar(c.categoria)}
                      className="w-full px-3 py-2.5 text-left"
                      aria-expanded={abierta}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/50 transition-transform flex-shrink-0 ${abierta ? "" : "-rotate-90"}`} />
                        <span className="text-[13px] font-semibold flex-1 truncate">{nombreCategoria(c.categoria)}</span>
                        <span className="text-[11px] text-muted-foreground/50 tabular-nums">
                          {uso.total > 0 ? Math.round((c.cantidad / uso.total) * 100) : 0}%
                        </span>
                        <span className="text-[13px] font-bold tabular-nums w-14 text-right">{nf(c.cantidad)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden mt-2 ml-5">
                        <div className="h-full rounded-full bg-violet-500/70" style={{ width: `${(c.cantidad / mayor) * 100}%` }} />
                      </div>
                    </button>

                    {abierta && (
                      <ul className="px-3 pb-2.5 pl-8 space-y-1">
                        {c.plantillas.map(p => (
                          <li key={p.nombre} className="flex items-center gap-2 text-[12px]">
                            <span className="flex-1 truncate font-mono text-muted-foreground" title={p.nombre}>{p.nombre}</span>
                            <span className="font-semibold tabular-nums">{nf(p.cantidad)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
