import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Wallet } from "lucide-react";
import { metricasCanal, type FilaMetrica } from "@/lib/canalSalida";
import { historialPlantillas, type ResumenMes } from "@/lib/plantillasHistorial";
import { FRANQUICIA_SERVICIO, TARIFA_USD, tarifaUsd } from "@/lib/metaMensajeria";
import { useDolar } from "@/lib/dolar";
import { inicioMesChile, isoChile } from "@/lib/meses";

const nf = (n: number) => Math.round(n).toLocaleString("es-CL");
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Plantillas = { mes: ResumenMes; costoReal: boolean };

/**
 * Cuánto se ha gastado en mensajes este mes, en una sola cifra.
 *
 * Antes había que mirar dos tarjetas por separado —la de mensajes y la de plantillas—
 * y sumarlas de cabeza. Pero no se pueden sumar tal cual: las plantillas ya vienen
 * contadas DENTRO de los mensajes de la API oficial. Sumar "costo de API oficial" más
 * "costo de plantillas" las cobraría dos veces.
 *
 * Por eso el gasto se arma con dos partes que no se pisan:
 *   · mensajes de servicio = mensajes oficiales − plantillas. Meta no cobra los primeros
 *     1.000 de cada mes; el resto va a la tarifa de servicio.
 *   · plantillas, cada una a la tarifa de su categoría (o a lo que Meta realmente cobró,
 *     cuando ese dato existe). La franquicia no las toca: cubre solo servicio.
 *
 * Los mensajes que se escriben desde el celular no entran: la base ya los separó de los
 * oficiales.
 */
export default function GastoDelMes({ companyId }: { companyId: string }) {
  const [filas, setFilas] = useState<FilaMetrica[] | null>(null);
  const [plantillas, setPlantillas] = useState<Plantillas | "error" | null>(null);
  const { dolar } = useDolar();

  useEffect(() => {
    let cancelado = false;
    setFilas(null); setPlantillas(null);
    // El mismo mes (en hora de Chile) que usa la tarjeta de mensajes.
    const inicio = inicioMesChile();
    metricasCanal(companyId, inicio, isoChile()).then(r => {
      if (!cancelado) setFilas(r.filter(f => String(f.dia).slice(0, 10) >= inicio));
    });
    historialPlantillas(companyId, 1).then(r => {
      if (cancelado) return;
      setPlantillas(r.ok ? { mes: r.meses[0], costoReal: r.costoReal } : "error");
    });
    return () => { cancelado = true; };
  }, [companyId]);

  const cuentas = useMemo(() => {
    if (!filas || !plantillas || plantillas === "error") return null;
    const oficial = filas.reduce((a, f) => a + (Number(f.oficial) || 0), 0);
    const nPlantillas = plantillas.mes.total;
    // Si hay plantillas pero ningún mensaje oficial, lo que falta es el dato, no los mensajes.
    const sinDatosOficial = filas.length === 0 && nPlantillas > 0;
    const servicio = Math.max(0, oficial - nPlantillas);
    const gratis = Math.min(servicio, FRANQUICIA_SERVICIO);
    const pagados = servicio - gratis;
    const costoServicio = pagados * TARIFA_USD.service;
    // Lo que Meta cobró, cuando está. Una plantilla sin monto no es gratis: se estima con la
    // tarifa de su categoría, para no mostrar un gasto menor al que hay.
    let costoPlantillas = plantillas.mes.costoUsd;
    let sinMonto = 0;
    for (const cat of plantillas.mes.categorias) {
      const faltan = cat.cantidad - cat.conMonto;
      if (faltan > 0) { sinMonto += faltan; costoPlantillas += faltan * (tarifaUsd(cat.categoria) ?? 0); }
    }
    // "Estimado" cuando alguna parte no viene de lo que Meta cobró.
    const estimado = !plantillas.costoReal || sinMonto > 0;
    return { oficial, nPlantillas, servicio, gratis, pagados, costoServicio, costoPlantillas, estimado, sinDatosOficial };
  }, [filas, plantillas]);

  if (filas === null || plantillas === null) {
    return (
      <div className="rounded-2xl border border-border/25 bg-card/40 p-4 flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  const encabezado = (
    <div className="flex items-center gap-2 mb-2">
      <Wallet className="w-4 h-4 text-primary" />
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Gasto del mes</span>
    </div>
  );

  if (!cuentas) {
    return (
      <div className="rounded-2xl border border-border/25 bg-card/40 p-4">
        {encabezado}
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            No se pudo calcular el gasto: falta el detalle de plantillas. Las otras tarjetas siguen mostrando lo que sí se pudo leer.
          </p>
        </div>
      </div>
    );
  }

  const c = cuentas;
  const total = c.costoServicio + c.costoPlantillas;

  return (
    <div className="rounded-2xl border border-border/25 bg-card/40 p-4">
      {encabezado}

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[32px] leading-none font-extrabold tabular-nums tracking-tight">
            {usd(total)}
            <span className="ml-1.5 text-[13px] font-bold tracking-wide text-muted-foreground/60">USD</span>
          </p>
          <p className="text-[11.5px] text-muted-foreground mt-1.5">
            {dolar ? <>≈ ${nf(total * dolar.valor)} CLP · </> : null}
            {c.estimado ? "estimado con las tarifas de Meta" : "lo que Meta cobró"}
          </p>
        </div>
        <Dona servicio={c.costoServicio} plantillas={c.costoPlantillas} />
      </div>

      <div className="mt-4 space-y-2.5">
        <div className="rounded-lg border border-border/25 bg-muted/20 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[12.5px] font-semibold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(199 89% 48%)" }} />Mensajes de servicio</p>
            <p className="text-[13px] font-bold tabular-nums">{c.sinDatosOficial ? "—" : usd(c.costoServicio)}</p>
          </div>
          <p className="text-[10.5px] text-muted-foreground/60 mt-0.5 leading-snug">
            {c.sinDatosOficial
              ? "No se pudo leer el total de mensajes."
              : <>{nf(c.servicio)} mensajes ({nf(c.oficial)} oficiales − {nf(c.nPlantillas)} plantillas) · {nf(c.gratis)} gratis de Meta{c.pagados > 0 ? ` · ${nf(c.pagados)} a ${usd(TARIFA_USD.service)} cada uno` : ""}</>}
          </p>
        </div>

        <div className="rounded-lg border border-border/25 bg-muted/20 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[12.5px] font-semibold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" />Plantillas</p>
            <p className="text-[13px] font-bold tabular-nums">{usd(c.costoPlantillas)}</p>
          </div>
          <p className="text-[10.5px] text-muted-foreground/60 mt-0.5 leading-snug">
            {nf(c.nPlantillas)} enviadas · {c.estimado ? "costo estimado por categoría" : "costo real"}
          </p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/45 mt-3 leading-relaxed">
        Las plantillas ya están dentro de los {nf(c.oficial)} mensajes de la API oficial: se muestran aparte para no contarlas dos veces.
        Los {nf(FRANQUICIA_SERVICIO)} gratis de Meta se descuentan de los mensajes de servicio, no de las plantillas.
      </p>
    </div>
  );
}

/** La torta del gasto: qué parte es servicio y qué parte son plantillas. */
function Dona({ servicio, plantillas }: { servicio: number; plantillas: number }) {
  const total = servicio + plantillas;
  if (total <= 0) return null;
  const C = 2 * Math.PI * 40;
  const dServicio = (servicio / total) * C;
  const dPlantillas = (plantillas / total) * C;
  return (
    <svg width="84" height="84" viewBox="0 0 100 100" className="flex-shrink-0" role="img"
      aria-label={`Servicio ${Math.round((servicio / total) * 100)} por ciento, plantillas ${Math.round((plantillas / total) * 100)} por ciento`}>
      <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(199 89% 48%)" strokeWidth="16"
        strokeDasharray={`${dServicio} ${C}`} transform="rotate(-90 50 50)" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--primary))" strokeWidth="16"
        strokeDasharray={`${dPlantillas} ${C}`} strokeDashoffset={-dServicio} transform="rotate(-90 50 50)" />
    </svg>
  );
}
