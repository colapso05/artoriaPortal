import { useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, Loader2 } from "lucide-react";
import { diaMes, fechaCl } from "@/lib/meses";

const nf = (n: number) => (n || 0).toLocaleString("es-CL");

/** Una fila de `get_atencion_ia_diaria`, ya limpia. */
export interface FilaAtencion {
  /** "09-10": día y mes, como se escribe en Chile. Es el eje. */
  dia: string;
  /** "09-10-2026", para el detalle. */
  fecha: string;
  /** Todas las conversaciones del día donde el cliente escribió: el alto de la barra. */
  conversaciones: number;
  /** Las que la IA atendió (simples + complejas + derivadas). */
  atendidas: number;
  simples: number;
  complejas: number;
  derivadas: number;
  /** El cliente escribió y la IA no respondió ese día. */
  sinAtencion: number;
  /** Mensajes de plantilla y aviso enviados ese día. Todos se cobran. */
  plantillas: number;
}

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};
const tiene = (v: unknown) => v !== undefined && v !== null;

/** Convierte lo que devuelve la base. `null` si la respuesta no es una lista de días. */
export function filasAtencion(data: unknown): FilaAtencion[] | null {
  if (!Array.isArray(data)) return null;
  return data
    .map((f: any): FilaAtencion => {
      // La columna de fecha se llama `periodo`; los otros nombres son por si algún día cambia.
      const periodo = String(f?.periodo ?? f?.dia ?? f?.fecha ?? f?.period ?? "");
      const atendidas = num(f?.atendidas_ia);
      const sinAtencion = num(f?.sin_atencion_ia);
      return {
        dia: diaMes(periodo),
        fecha: fechaCl(periodo),
        // Respuestas anteriores a las columnas nuevas: el total era solo lo atendido.
        conversaciones: tiene(f?.conversaciones_dia) ? num(f.conversaciones_dia) : atendidas + sinAtencion,
        atendidas,
        simples: num(f?.simples_ia),
        complejas: num(f?.complejas_ia),
        derivadas: num(f?.derivadas),
        sinAtencion,
        plantillas: tiene(f?.plantillas_enviadas) ? num(f.plantillas_enviadas) : num(f?.plantillas_avisos),
        _orden: periodo,
      } as FilaAtencion & { _orden: string };
    })
    .filter(f => f.dia)
    .sort((a, b) => (a as any)._orden.localeCompare((b as any)._orden));
}

const COLOR_SIMPLES = "hsl(160 70% 45%)";
const COLOR_COMPLEJAS = "hsl(200 80% 55%)";
const COLOR_DERIVADAS = "hsl(38 92% 55%)";
const COLOR_SIN_ATENCION = "hsl(220 10% 55%)";
const COLOR_PLANTILLAS = "hsl(var(--muted-foreground))";

const EJE = { fontSize: 10, fill: "hsl(var(--muted-foreground))", opacity: 0.6 };

const ETIQUETA_PLANTILLAS = "Plantillas y avisos enviados";
const AYUDA_PLANTILLAS = "no son conversaciones atendidas; todos se cobran";

function Leyenda({ color, texto, discontinua }: { color: string; texto: string; discontinua?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground/70">
      <span className="w-2.5 h-2.5 rounded-sm" style={discontinua ? { border: `1.5px dashed ${color}`, opacity: 0.7 } : { background: color }} />
      {texto}
    </span>
  );
}

function Detalle({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const f: FilaAtencion = payload[0].payload;
  return (
    <div className="rounded-xl border border-border/40 bg-card/95 backdrop-blur px-3 py-2 shadow-xl text-[12px] max-w-[270px]">
      <p className="text-muted-foreground/60 mb-1.5">{f.fecha}</p>
      {[
        [COLOR_SIMPLES, "IA · consultas simples", f.simples],
        [COLOR_COMPLEJAS, "IA · casos complejos", f.complejas],
        [COLOR_DERIVADAS, "Derivadas a un operador", f.derivadas],
        [COLOR_SIN_ATENCION, "Sin atención de la IA", f.sinAtencion],
      ].map(([c, t, v]) => (
        <p key={t as string} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: c as string }} />{t}</span>
          <span className="font-bold tabular-nums">{v as number}</span>
        </p>
      ))}
      <p className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t border-border/30">
        <span className="text-muted-foreground/70">Conversaciones del día</span>
        <span className="font-black tabular-nums">{f.conversaciones}</span>
      </p>
      <p className="mt-1.5 pt-1.5 border-t border-border/20 text-[10.5px] text-muted-foreground/60 leading-snug">
        <span className="font-semibold tabular-nums">{nf(f.plantillas)}</span> {ETIQUETA_PLANTILLAS.toLowerCase()} ({AYUDA_PLANTILLAS})
      </p>
    </div>
  );
}

/**
 * Conversaciones por día, abiertas en cuatro partes que suman el total.
 *
 *   · IA · consultas simples: las resolvió la IA sola y eran de autogestión (factura,
 *     pago, plan, cobertura…).
 *   · IA · casos complejos: las resolvió la IA sola, pero requerían diagnóstico o gestión.
 *   · Derivadas a un operador: hubo especialista o se abrió un ticket.
 *   · Sin atención de la IA: el cliente escribió y la IA no respondió ese día.
 *
 * Las plantillas y avisos NO son conversaciones: van aparte, tenues y con escala propia,
 * porque suelen ser muchos más mensajes y aplastarían el resto.
 *
 * La base garantiza que las cuatro partes suman las conversaciones del día. Si algún día
 * no cuadra, la pantalla lo dice en vez de esconderlo.
 */
export default function GraficoAtencion({ filas, cargando, alto = 230 }: { filas: FilaAtencion[]; cargando: boolean; alto?: number }) {
  const t = useMemo(() => {
    const suma = (k: keyof FilaAtencion) => filas.reduce((a, f) => a + (Number(f[k]) || 0), 0);
    const conversaciones = suma("conversaciones");
    const simples = suma("simples"), complejas = suma("complejas"), derivadas = suma("derivadas");
    return {
      conversaciones, simples, complejas, derivadas,
      sinAtencion: suma("sinAtencion"),
      plantillas: suma("plantillas"),
      pctSolas: conversaciones > 0 ? Math.round(((simples + complejas) / conversaciones) * 100) : null,
      descuadre: filas.filter(f => f.simples + f.complejas + f.derivadas + f.sinAtencion !== f.conversaciones).length,
      hayPlantillas: filas.some(f => f.plantillas > 0),
    };
  }, [filas]);

  if (cargando) {
    return <div className="flex items-center justify-center" style={{ height: alto }}><Loader2 className="w-5 h-5 animate-spin text-muted-foreground/30" /></div>;
  }
  if (filas.length === 0) {
    return <p className="text-[12px] text-muted-foreground/60 text-center flex items-center justify-center" style={{ height: alto }}>Todavía no hay conversaciones en este período</p>;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={alto}>
        <AreaChart data={filas} margin={{ top: 8, right: t.hayPlantillas ? 0 : 8, left: -18, bottom: 0 }}>
          <defs>
            {[["gSimples", COLOR_SIMPLES], ["gComplejas", COLOR_COMPLEJAS], ["gDerivadasA", COLOR_DERIVADAS], ["gSinAtencion", COLOR_SIN_ATENCION]].map(([id, c]) => (
              <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.5} /><stop offset="100%" stopColor={c} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.25} vertical={false} />
          <XAxis dataKey="dia" tick={EJE} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis yAxisId="atencion" tick={EJE} tickLine={false} axisLine={false} width={38} />
          {t.hayPlantillas && <YAxis yAxisId="plantillas" orientation="right" tick={{ ...EJE, opacity: 0.35 }} tickLine={false} axisLine={false} width={34} />}
          <Tooltip content={<Detalle />} cursor={{ stroke: "hsl(var(--foreground))", strokeOpacity: 0.2 }} />
          {/* Cuatro franjas apiladas: su suma es lo que escribieron los clientes ese día. */}
          <Area yAxisId="atencion" type="monotone" dataKey="simples" name="IA · consultas simples" stackId="a"
            stroke={COLOR_SIMPLES} fill="url(#gSimples)" strokeWidth={1.5} />
          <Area yAxisId="atencion" type="monotone" dataKey="complejas" name="IA · casos complejos" stackId="a"
            stroke={COLOR_COMPLEJAS} fill="url(#gComplejas)" strokeWidth={1.5} />
          <Area yAxisId="atencion" type="monotone" dataKey="derivadas" name="Derivadas a un operador" stackId="a"
            stroke={COLOR_DERIVADAS} fill="url(#gDerivadasA)" strokeWidth={1.5} />
          <Area yAxisId="atencion" type="monotone" dataKey="sinAtencion" name="Sin atención de la IA" stackId="a"
            stroke={COLOR_SIN_ATENCION} fill="url(#gSinAtencion)" strokeWidth={1.25} />
          {/* Serie aparte, tenue y sin apilar: no son conversaciones. */}
          {t.hayPlantillas && (
            <Area yAxisId="plantillas" type="monotone" dataKey="plantillas" name={ETIQUETA_PLANTILLAS}
              stroke={COLOR_PLANTILLAS} strokeOpacity={0.45} strokeDasharray="4 3" fill="none" strokeWidth={1.25} />
          )}
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-x-4 gap-y-1 mt-2 px-1 flex-wrap">
        <Leyenda color={COLOR_SIMPLES} texto="IA · consultas simples" />
        <Leyenda color={COLOR_COMPLEJAS} texto="IA · casos complejos" />
        <Leyenda color={COLOR_DERIVADAS} texto="Derivadas a un operador" />
        <Leyenda color={COLOR_SIN_ATENCION} texto="Sin atención de la IA" />
      </div>
      {t.hayPlantillas && (
        <div className="px-1 mt-1">
          <Leyenda color={COLOR_PLANTILLAS} texto={`${ETIQUETA_PLANTILLAS} (${AYUDA_PLANTILLAS}) · escala propia, a la derecha`} discontinua />
        </div>
      )}

      {t.conversaciones > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-3 border-t border-border/15">
          <div>
            <p className="text-[19px] font-black tabular-nums leading-none">{nf(t.conversaciones)}</p>
            <p className="text-[10.5px] text-muted-foreground/55 mt-1">conversaciones</p>
          </div>
          <div>
            <p className="text-[19px] font-black tabular-nums leading-none" style={{ color: "hsl(160 70% 40%)" }}>{nf(t.simples)}</p>
            <p className="text-[10.5px] text-muted-foreground/55 mt-1">IA · consultas simples</p>
          </div>
          <div>
            <p className="text-[19px] font-black tabular-nums leading-none" style={{ color: "hsl(200 80% 45%)" }}>{nf(t.complejas)}</p>
            <p className="text-[10.5px] text-muted-foreground/55 mt-1">IA · casos complejos</p>
          </div>
          <div>
            <p className="text-[19px] font-black tabular-nums leading-none" style={{ color: "hsl(38 92% 45%)" }}>{nf(t.derivadas)}</p>
            <p className="text-[10.5px] text-muted-foreground/55 mt-1">derivadas a un operador</p>
          </div>
          <div>
            <p className="text-[19px] font-black tabular-nums leading-none text-muted-foreground">{nf(t.sinAtencion)}</p>
            <p className="text-[10.5px] text-muted-foreground/55 mt-1">sin atención de la IA</p>
          </div>
        </div>
      )}
      <p className="text-[10.5px] text-muted-foreground/50 mt-3 leading-relaxed">
        {t.pctSolas != null && <><strong className="text-foreground/70">{t.pctSolas}%</strong> de las conversaciones se resolvió sin necesitar a nadie. </>}
        {t.plantillas > 0 && <>Aparte, {nf(t.plantillas)} plantillas y avisos enviados: no son conversaciones.</>}
      </p>
      {t.descuadre > 0 && (
        <p className="text-[10.5px] text-amber-500 mt-1.5 flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          En {t.descuadre} día{t.descuadre === 1 ? "" : "s"} las partes no suman las conversaciones del día. Avisa al equipo: es un error de los datos.
        </p>
      )}
    </>
  );
}
