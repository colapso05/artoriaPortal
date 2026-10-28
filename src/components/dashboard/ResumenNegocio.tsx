import { useEffect, useMemo, useState } from "react";
import { Users, ShoppingCart, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ventasResumen, clp, type FilaVenta } from "@/lib/planes";
import { isoChile, inicioMesChile } from "@/lib/meses";

const HOY = () => isoChile();
const HACE = (dias: number) =>
  isoChile(new Date(Date.now() - dias * 86400000));
const INICIO_DE_MES = () => inicioMesChile();

/**
 * Los números que le importan al dueño del ISP.
 *
 * No son los tickets: los tickets sirven para operar el día. Esto responde otra
 * pregunta —qué me está aportando el agente— y por eso va arriba, en grande y con
 * la unidad escrita. El ahorro en mensajería no está acá: tiene su propia tarjeta
 * más abajo con el detalle por día, y repetirlo era ruido.
 */
export default function ResumenNegocio({ companyId }: { companyId: string | null }) {
  const [contencion, setContencion] = useState<number | null>(null);
  const [ventas, setVentas] = useState<FilaVenta[] | null>(null);
  const [ventasTotales, setVentasTotales] = useState<FilaVenta[] | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelado = false;

    supabase
      .rpc("get_analytics_summary", {
        p_company_id: companyId,
        p_start_date: HACE(30),
        p_end_date: HOY(),
      })
      .then(({ data }: any) => {
        if (cancelado || !data) return;
        const v = Number(data.containment_rate);
        setContencion(isNaN(v) ? null : v);
      });

    ventasResumen(companyId, INICIO_DE_MES(), HOY()).then(r => { if (!cancelado) setVentas(r); });
    // Acumulado. Sin fecha de activación del agente se toma todo lo que hay:
    // antes de que existiera no hay ventas cargadas, así que el número coincide.
    ventasResumen(companyId, "2020-01-01", HOY()).then(r => { if (!cancelado) setVentasTotales(r); });

    return () => { cancelado = true; };
  }, [companyId]);

  const v = useMemo(() => {
    const f = ventas ?? [];
    const hoy = HOY();
    const desdeSemana = HACE(7);
    const suma = (filas: FilaVenta[], k: keyof FilaVenta) =>
      filas.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    return {
      mesVentas: suma(f, "ventas"),
      mesMonto: suma(f, "monto_mensual"),
      semanaVentas: suma(f.filter(x => x.dia >= desdeSemana), "ventas"),
      hoyVentas: suma(f.filter(x => x.dia === hoy), "ventas"),
      totalVentas: suma(ventasTotales ?? [], "ventas"),
      totalMonto: suma(ventasTotales ?? [], "monto_mensual"),
    };
  }, [ventas, ventasTotales]);


  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* ── Lo que el agente resuelve solo ── */}
      <Tarjeta
        icon={Users}
        color="text-emerald-500"
        fondo="bg-emerald-500/[0.07] border-emerald-500/25"
        titulo="Resuelto sin un operador"
        pie="Últimos 30 días"
      >
        {contencion == null ? (
          <Cargando />
        ) : (
          <>
            <p className="text-[44px] leading-none font-black tabular-nums text-emerald-500">
              {Math.round(contencion)}
              <span className="text-[22px] font-bold">%</span>
            </p>
            {/* La frase importa más que el número: "85%" no dice nada solo, y esto
                es lo que el dueño repite cuando le preguntan qué compró. */}
            <p className="text-[12px] text-muted-foreground/70 mt-2 leading-relaxed">
              De cada 100 clientes que escriben, <strong className="text-foreground">
              {Math.round(contencion)}</strong> nunca llegan a un operador.
            </p>
          </>
        )}
      </Tarjeta>

      {/* ── Ventas del agente, valorizadas ── */}
      <Tarjeta
        icon={ShoppingCart}
        color="text-primary"
        fondo="bg-primary/[0.07] border-primary/25"
        titulo="Vendido este mes"
        pie={
          v.totalVentas === 0 ? "Acumulado desde el inicio"
            : v.totalMonto > 0 ? `${v.totalVentas.toLocaleString("es-CL")} ventas en total · ${clp(v.totalMonto)}`
            : `${v.totalVentas.toLocaleString("es-CL")} ventas en total`
        }
      >
        {ventas == null ? (
          <Cargando />
        ) : (
          <>
            {v.mesMonto > 0 ? (
              <>
                <p className="text-[38px] leading-none font-black tabular-nums">{clp(v.mesMonto)}</p>
                <p className="text-[12px] text-muted-foreground/70 mt-1.5">
                  {v.mesVentas.toLocaleString("es-CL")} {v.mesVentas === 1 ? "venta" : "ventas"} · mensual recurrente
                </p>
              </>
            ) : (
              /*
               * Ventas contadas pero sin monto: el precio no quedó guardado en el
               * cierre. Poner "$0" sería afirmar que se vendió por cero pesos —
               * mejor mostrar lo que sí sabemos y decir que falta el resto.
               */
              <>
                <p className="text-[38px] leading-none font-black tabular-nums">
                  {v.mesVentas.toLocaleString("es-CL")}
                  <span className="text-[16px] font-bold text-muted-foreground/60 ml-2">
                    {v.mesVentas === 1 ? "venta" : "ventas"}
                  </span>
                </p>
                <p className="text-[11.5px] text-amber-500/80 mt-1.5 leading-relaxed">
                  Sin monto: estas ventas no tienen el precio del plan guardado.
                </p>
              </>
            )}
            <div className="flex items-center gap-4 mt-2.5 text-[11px] text-muted-foreground/60">
              <span><strong className="text-foreground">{v.hoyVentas}</strong> hoy</span>
              <span><strong className="text-foreground">{v.semanaVentas}</strong> esta semana</span>
            </div>
          </>
        )}
      </Tarjeta>

    </div>
  );
}

function Cargando() {
  return (
    <div className="h-[68px] flex items-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/30" />
    </div>
  );
}

function Tarjeta({ icon: Icon, color, fondo, titulo, pie, children }: {
  icon: React.ElementType; color: string; fondo: string;
  titulo: string; pie: string; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border p-5 flex flex-col ${fondo}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
          {titulo}
        </span>
      </div>
      <div className="flex-1">{children}</div>
      <p className="text-[10.5px] text-muted-foreground/45 mt-3 truncate">{pie}</p>
    </div>
  );
}
