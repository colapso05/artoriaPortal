import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  volumenConversaciones, margenErrorAgente,
  type Grano, type PuntoVolumen, type PuntoMargenError,
} from "@/lib/calidadAgente";

/**
 * Dos preguntas distintas sobre el agente: si el volumen crece y si se equivoca.
 *
 * Van separadas a propósito. Más conversaciones no es mejor agente, y un margen de
 * error bajo con poco volumen no dice mucho: mezclarlas en una tarjeta invita a
 * leer una como causa de la otra.
 */

const EJE = { fontSize: 10, fill: "hsl(var(--muted-foreground))", opacity: 0.55 };

/** Debajo de esta cobertura, el margen de error se marca como poco confiable. */
const COBERTURA_FLOJA = 70;

const nf = (n: number) => (Number(n) || 0).toLocaleString("es-CL");
const pct1 = (n: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

const mesCorto = (d: Date) => d.toLocaleDateString("es-CL", { month: "short" });

/**
 * Cómo se nombra un período.
 *
 * La semana se escribe como rango. La RPC devuelve el día en que empieza, y una
 * fecha sola se lee como si el dato fuera de ese día: "7 sept" parece el lunes,
 * no la semana del 7 al 13.
 */
const rotulo = (periodo: string, grano: Grano, largo = false) => {
  const d = new Date(periodo + "T12:00:00");
  if (isNaN(d.getTime())) return periodo;
  if (grano === "mes") {
    return largo
      ? d.toLocaleDateString("es-CL", { month: "long", year: "numeric" })
      : d.toLocaleDateString("es-CL", { month: "short", year: "2-digit" });
  }
  if (grano === "semana") {
    const fin = new Date(d.getTime() + 6 * 86400000);
    const mismoMes = fin.getMonth() === d.getMonth();
    if (largo) {
      return mismoMes
        ? `${d.getDate()} al ${fin.getDate()} de ${d.toLocaleDateString("es-CL", { month: "long" })}`
        : `${d.getDate()} de ${d.toLocaleDateString("es-CL", { month: "long" })} al ${fin.getDate()} de ${fin.toLocaleDateString("es-CL", { month: "long" })}`;
    }
    return mismoMes
      ? `${d.getDate()}-${fin.getDate()} ${mesCorto(fin)}`
      : `${d.getDate()} ${mesCorto(d)}-${fin.getDate()} ${mesCorto(fin)}`;
  }
  return largo
    ? d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
    : d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });
};

/** Miles compactos: con el eje angosto, "1.400" se corta y queda "00". */
const ejeCompacto = (v: number) =>
  Math.abs(v) >= 1000
    ? (v / 1000).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + "k"
    : String(v);

function Tarjeta({ titulo, nota, extra, children }: {
  titulo: string; nota: string; extra?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/25 bg-card/40 p-4 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold">{titulo}</h3>
          <p className="text-[10.5px] text-muted-foreground/50 mt-0.5 leading-snug">{nota}</p>
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

function Selector<T extends string>({ valor, opciones, onChange }: {
  valor: T; opciones: { id: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border/30 overflow-hidden text-[10.5px] font-bold flex-shrink-0">
      {opciones.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 transition-colors ${
            valor === o.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground/70"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Espera = ({ alto }: { alto: number }) => (
  <div style={{ height: alto }} className="flex items-center justify-center">
    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/25" />
  </div>
);

const Vacio = ({ texto, alto }: { texto: string; alto: number }) => (
  <div style={{ height: alto }} className="flex items-center justify-center px-3">
    <p className="text-[12px] text-muted-foreground/45 text-center">{texto}</p>
  </div>
);

const CAJA_TOOLTIP = {
  background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
  borderRadius: 10, fontSize: 11, padding: "6px 10px",
};

/* -- Flujo de conversaciones ------------------------------------------- */

const VENTANAS_VOLUMEN: { id: Grano; label: string; periodos: number; nombre: string; nombrePl: string }[] = [
  { id: "dia", label: "Días", periodos: 30, nombre: "día", nombrePl: "días" },
  { id: "semana", label: "Semanas", periodos: 12, nombre: "semana", nombrePl: "semanas" },
  { id: "mes", label: "Meses", periodos: 12, nombre: "mes", nombrePl: "meses" },
];

/**
 * Cuánto lleva corrido el período en curso.
 *
 * Sin esto, el último mes siempre parece una caída: se comparan catorce días
 * contra treinta. Es exactamente lo que estaba mostrando la tarjeta antes.
 */
function avance(periodo: string, grano: Grano): { corridos: number; totales: number } | null {
  const inicio = new Date(periodo + "T00:00:00");
  if (isNaN(inicio.getTime())) return null;
  const totales = grano === "semana"
    ? 7
    : grano === "mes"
      ? new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0).getDate()
      : 1;
  const corridos = Math.floor((Date.now() - inicio.getTime()) / 86400000) + 1;
  if (corridos <= 0) return null;
  return { corridos: Math.min(corridos, totales), totales };
}

function TooltipVolumen({ active, payload, label, grano }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={CAJA_TOOLTIP as any}>
      <p className="font-bold mb-1">
        {rotulo(String(label), grano, true)}{d.enCurso && " · en curso"}
      </p>
      <p className="text-primary font-semibold">{nf(d.activas)} conversaciones</p>
      {d.enCurso && d.proyeccion != null && (
        <p className="text-primary/70">~{nf(d.proyeccion)} proyectadas al cierre</p>
      )}
      <p className="text-muted-foreground/70">{nf(d.mensajes)} mensajes</p>
      <p className="text-muted-foreground/70">{nf(d.nuevas)} clientes nuevos</p>
    </div>
  );
}

export function VolumenConversaciones({ companyId }: { companyId: string | null }) {
  const [ventana, setVentana] = useState(VENTANAS_VOLUMEN[2]);
  const [serie, setSerie] = useState<PuntoVolumen[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelado = false;
    setCargando(true);
    volumenConversaciones(companyId, ventana.id, ventana.periodos).then(r => {
      if (cancelado) return;
      setSerie(r);
      setCargando(false);
    });
    return () => { cancelado = true; };
  }, [companyId, ventana]);

  const vista = useMemo(() => {
    if (serie.length === 0) return null;
    const ultimo = serie[serie.length - 1];
    const previos = serie.slice(0, -1);

    const act = (p: PuntoVolumen) => Number(p.activas) || 0;
    const corrido = avance(String(ultimo.periodo), ventana.id);
    const enCurso = corrido != null && corrido.corridos < corrido.totales;

    /*
     * La proyección es regla de tres sobre los días corridos. No pretende ser un
     * pronóstico: es "si sigue este ritmo". Con un solo día corrido no se muestra,
     * porque multiplicar un lunes por treinta no es una tendencia.
     */
    const proyeccion = enCurso && corrido!.corridos >= 2
      ? Math.round((act(ultimo) / corrido!.corridos) * corrido!.totales)
      : null;

    /*
     * Lo que se compara: la proyección si el período va a medias, el real si cerró.
     *
     * Si el período recién arrancó y no hay proyección, no hay nada comparable y no
     * se compara. Un lunes contra una semana entera da -100% y eso no es una caída,
     * es el calendario: el mismo error que mostraba el mes a mitad de camino.
     */
    const comparable = enCurso ? proyeccion : act(ultimo);
    const anterior = previos.length ? act(previos[previos.length - 1]) : null;
    const variacion = comparable != null && anterior && anterior > 0
      ? ((comparable - anterior) / anterior) * 100
      : null;

    const valoresPrevios = previos.map(act).filter(v => v > 0);
    const rango = valoresPrevios.length >= 2
      ? { min: Math.min(...valoresPrevios), max: Math.max(...valoresPrevios),
          promedio: valoresPrevios.reduce((a, b) => a + b, 0) / valoresPrevios.length }
      : null;

    const datos = serie.map((p, i) => {
      const esUltimo = i === serie.length - 1;
      const base = act(p);
      return {
        periodo: p.periodo,
        activas: base,
        nuevas: Number(p.nuevas) || 0,
        mensajes: Number(p.mensajes) || 0,
        enCurso: esUltimo && enCurso,
        proyeccion: esUltimo ? proyeccion : null,
        // La franja clara de arriba es lo que faltaría para cerrar al ritmo actual.
        resto: esUltimo && proyeccion != null ? Math.max(0, proyeccion - base) : 0,
      };
    });

    const mensajesProyectados = enCurso && corrido!.corridos >= 2
      ? Math.round(((Number(ultimo.mensajes) || 0) / corrido!.corridos) * corrido!.totales)
      : null;

    return { ultimo, corrido, enCurso, proyeccion, comparable, anterior, variacion, rango, datos, mensajesProyectados };
  }, [serie, ventana]);

  return (
    <Tarjeta
      titulo="Conversaciones"
      /*
       * El foco es el flujo, no los clientes nuevos. La empresa mira esta tarjeta
       * para saber si el plan le va a quedar chico, y eso lo decide el volumen.
       */
      nota="Cómo viene el flujo contra los períodos anteriores. Es lo que dice si el plan te va a quedar chico."
      extra={
        <Selector
          valor={ventana.id}
          opciones={VENTANAS_VOLUMEN.map(v => ({ id: v.id, label: v.label }))}
          onChange={id => setVentana(VENTANAS_VOLUMEN.find(v => v.id === id)!)}
        />
      }
    >
      {cargando ? <Espera alto={220} /> : !vista ? (
        <Vacio texto="Todavía no hay conversaciones registradas" alto={220} />
      ) : (
        <>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[25px] leading-none font-black tabular-nums">{nf(vista.ultimo.activas)}</span>
            <span className="text-[10.5px] text-muted-foreground/55">
              {vista.enCurso ? `en ${ventana.id === "mes" ? "el mes" : ventana.id === "semana" ? "la semana" : "el día"} en curso` : `en ${"el último " + ventana.nombre}`}
            </span>
            {/* Acá subir es bueno, al revés que en la tarjeta de costos. */}
            {vista.variacion != null && (
              Math.abs(vista.variacion) < 1 ? (
                <span className="text-[10.5px] text-muted-foreground/55">
                  igual que {ventana.id === "mes" ? "el mes" : ventana.id === "semana" ? "la semana" : "el día"} anterior
                </span>
              ) : (
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${
                  vista.variacion >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {vista.variacion >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {vista.variacion >= 0 ? "+" : ""}{Math.round(vista.variacion)}%
                  <span className="font-medium text-muted-foreground/50 ml-0.5">
                    vs {ventana.nombre} anterior
                  </span>
                </span>
              )
            )}
          </div>

          {/*
           * La comparación se hace contra la proyección, no contra lo que va, y se
           * dice. Catorce días contra treinta siempre da caída.
           */}
          {vista.enCurso && vista.corrido && (
            <p className="text-[10.5px] text-muted-foreground/55 mt-1.5 leading-relaxed">
              Van {vista.corrido.corridos} de {vista.corrido.totales} días.
              {vista.proyeccion != null ? (
                <> A este ritmo cierra en <strong className="text-foreground/80">~{nf(vista.proyeccion)}</strong>
                  {vista.variacion != null && " — con eso se compara el porcentaje de arriba."}</>
              ) : (
                " Todavía es muy pronto para proyectar el cierre o comparar con el período anterior."
              )}
            </p>
          )}

          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={vista.datos} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
              <XAxis dataKey="periodo" tick={EJE} tickLine={false} axisLine={false} minTickGap={20}
                tickFormatter={(v: string) => rotulo(v, ventana.id)} />
              <YAxis tick={EJE} tickLine={false} axisLine={false} width={44} tickFormatter={ejeCompacto} />
              <Tooltip content={<TooltipVolumen grano={ventana.id} />}
                cursor={{ fill: "hsl(var(--foreground))", fillOpacity: 0.06 }} />
              <Bar dataKey="activas" stackId="a" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              {/* Lo proyectado va translucido: es un supuesto, no un dato. */}
              <Bar dataKey="resto" stackId="a" fill="hsl(var(--primary))" fillOpacity={0.22} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Dónde cae este período respecto de los anteriores. */}
          {vista.rango && vista.comparable != null && (
            <p className="text-[10.5px] mt-1.5 leading-relaxed">
              {vista.comparable! > vista.rango.max ? (
                <span className="text-emerald-500 font-semibold">
                  Sería {ventana.id === "mes" ? "el mes" : ventana.id === "semana" ? "la semana" : "el día"} más alto de los últimos {serie.length}.
                </span>
              ) : vista.comparable! < vista.rango.min ? (
                <span className="text-amber-500 font-semibold">
                  Sería el más bajo de los últimos {serie.length}.
                </span>
              ) : (
                <span className="text-muted-foreground/55">
                  Dentro de lo habitual: los {ventana.nombrePl} anteriores fueron entre {nf(vista.rango.min)} y {nf(vista.rango.max)}.
                </span>
              )}
            </p>
          )}

          {/*
           * Mensajes y clientes nuevos no se grafican junto a las conversaciones:
           * los mensajes son varias veces más y aplastarían las barras. Van como
           * números, y los mensajes con su proyección porque son los que consumen plan.
           */}
          <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-border/20">
            <div>
              <p className="text-[15px] font-black tabular-nums">{nf(vista.ultimo.mensajes)}</p>
              <p className="text-[10px] text-muted-foreground/50 leading-snug">
                mensajes{vista.mensajesProyectados != null && ` · ~${nf(vista.mensajesProyectados)} al cierre`}
                {" "}— son los que consumen el plan
              </p>
            </div>
            <div>
              <p className="text-[15px] font-black tabular-nums">{nf(vista.ultimo.nuevas)}</p>
              <p className="text-[10px] text-muted-foreground/50 leading-snug">
                clientes que escribieron por primera vez
              </p>
            </div>
          </div>
        </>
      )}
    </Tarjeta>
  );
}

/* -- Margen de error ---------------------------------------------------- */

const VENTANAS_ERROR: { id: Grano; label: string; periodos: number; nombre: string; nombrePl: string }[] = [
  { id: "dia", label: "Días", periodos: 30, nombre: "día", nombrePl: "días" },
  { id: "semana", label: "Semanas", periodos: 12, nombre: "semana", nombrePl: "semanas" },
  { id: "mes", label: "Meses", periodos: 6, nombre: "mes", nombrePl: "meses" },
];

/** Un salto de cobertura de este tamaño hace que dos períodos no sean comparables. */
const SALTO_COBERTURA = 15;

function TooltipError({ active, payload, label, grano }: any) {
  if (!active || !payload?.length) return null;
  const d: PuntoMargenError = payload[0].payload;
  if (d.margen_error_pct == null) {
    return (
      <div style={CAJA_TOOLTIP as any}>
        <p className="font-bold mb-1">{rotulo(String(label), grano, true)}</p>
        <p className="text-muted-foreground/70">Sin conversaciones revisadas todavía</p>
      </div>
    );
  }
  const floja = Number(d.cobertura_pct) < COBERTURA_FLOJA;
  return (
    <div style={CAJA_TOOLTIP as any}>
      <p className="font-bold mb-1">{rotulo(String(label), grano, true)}</p>
      <p className="text-rose-500 font-semibold">{pct1(d.margen_error_pct)} de margen de error</p>
      <p className="text-muted-foreground/70">
        {nf(d.sesiones_con_problema)} con problema de {nf(d.sesiones_analizadas)} revisadas
      </p>
      <p className={floja ? "text-amber-500" : "text-muted-foreground/70"}>
        se revisó el {pct1(d.cobertura_pct)}{floja && " — poco confiable"}
      </p>
      {d.nota_promedio != null && (
        <p className="text-muted-foreground/70">
          nota {Number(d.nota_promedio).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de 10
        </p>
      )}
    </div>
  );
}

/** Punto de la línea: se pinta distinto cuando la cobertura del período es baja. */
function PuntoLinea({ cx, cy, payload }: any) {
  if (cx == null || cy == null || payload?.margen_error_pct == null) return null;
  const floja = Number(payload.cobertura_pct) < COBERTURA_FLOJA;
  return (
    <circle
      cx={cx} cy={cy} r={floja ? 4 : 3.2}
      fill={floja ? "hsl(var(--card))" : "hsl(350 80% 55%)"}
      stroke={floja ? "hsl(38 92% 55%)" : "hsl(350 80% 55%)"}
      strokeWidth={floja ? 2 : 1}
    />
  );
}

export function MargenErrorAgente({ companyId }: { companyId: string | null }) {
  const [ventana, setVentana] = useState(VENTANAS_ERROR[1]);
  const [serie, setSerie] = useState<PuntoMargenError[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelado = false;
    setCargando(true);
    margenErrorAgente(companyId, ventana.id, ventana.periodos).then(r => {
      if (cancelado) return;
      setSerie(r);
      setCargando(false);
    });
    return () => { cancelado = true; };
  }, [companyId, ventana]);

  /*
   * El último analizado, no la última fila.
   *
   * El período en curso puede no tener ni una conversación revisada todavía —la
   * semana que arrancó ayer, por ejemplo— y entonces margen y cobertura vienen en
   * null. Tomar esa fila dejaba el número grande en un guión.
   */
  const analizados = serie.filter(p => p.margen_error_pct != null);
  const ultimo = analizados.length ? analizados[analizados.length - 1] : null;
  const previo = analizados.length > 1 ? analizados[analizados.length - 2] : null;
  const esElUltimoPeriodo = ultimo != null && serie.length > 0 && ultimo.periodo === serie[serie.length - 1].periodo;

  /*
   * La variación va en puntos, no en porcentaje.
   *
   * De 6,9% a 9,8% es "+2,9 puntos". Decir "+42%" sería cierto y completamente
   * inútil: nadie sabe si eso es mucho sin volver a los dos números originales.
   */
  const deltaPuntos = ultimo != null && previo != null
    ? Number(ultimo.margen_error_pct) - Number(previo.margen_error_pct)
    : null;

  /*
   * Si entre los dos períodos cambió mucho cuánto se revisa, la comparación no es
   * pareja: parte de la diferencia puede ser que ahora se mira más, no que el
   * agente empeoró. En Dropp la cobertura pasó de 48% a 95% en pocas semanas.
   */
  const saltoCobertura = ultimo != null && previo != null
    ? Math.abs(Number(ultimo.cobertura_pct) - Number(previo.cobertura_pct))
    : null;
  const comparacionDispareja = saltoCobertura != null && saltoCobertura >= SALTO_COBERTURA;

  const conMargen = analizados.map(p => Number(p.margen_error_pct));
  /*
   * El rango, no el promedio.
   *
   * En Dropp el margen va de 3,6% a 17,2% según la semana. Un promedio de ~9%
   * borraría la semana mala, que es justamente la que hay que poder ver.
   */
  const rango = conMargen.length > 1
    ? { min: Math.min(...conMargen), max: Math.max(...conMargen) }
    : null;
  const coberturaFloja = ultimo != null && Number(ultimo.cobertura_pct) < COBERTURA_FLOJA;

  /*
   * Qué parte de lo que mandó el agente fue conversación de verdad.
   *
   * Sin esto, "159" y "427" son dos números sueltos que no se sabe cómo se
   * reparten. Con empresas que no mandan avisos el reparto sobra, y se omite.
   */
  const reparto = (() => {
    if (!ultimo) return null;
    const dia = Number(ultimo.dialogos_con_agente) || 0;
    const avi = Number(ultimo.avisos_de_una_via) || 0;
    if (avi <= 0 || dia + avi <= 0) return null;
    return Math.round((dia / (dia + avi)) * 100);
  })();

  return (
    <Tarjeta
      titulo="Margen de error del agente"
      nota="De las conversaciones que alcanzó a revisar el analizador, en cuántas el agente hizo algo mal."
      extra={
        <Selector
          valor={ventana.id}
          opciones={VENTANAS_ERROR.map(v => ({ id: v.id, label: v.label }))}
          onChange={id => setVentana(VENTANAS_ERROR.find(v => v.id === id)!)}
        />
      }
    >
      {cargando ? <Espera alto={220} /> : !ultimo ? (
        <Vacio texto="Todavía no hay conversaciones analizadas en este período" alto={220} />
      ) : (
        <>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[25px] leading-none font-black tabular-nums text-rose-500">
              {pct1(ultimo.margen_error_pct)}
            </span>
            <span className="text-[10.5px] text-muted-foreground/55">de margen de error</span>
            {/*
             * Acá bajar es bueno: verde cuando cae, rojo cuando sube. Es al revés
             * que en la tarjeta de conversaciones, y por eso lleva la palabra
             * "menos"/"más" y no solo una flecha.
             */}
            {deltaPuntos != null && Math.abs(deltaPuntos) >= 0.1 && (
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${
                deltaPuntos > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                {deltaPuntos > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {Math.abs(deltaPuntos).toLocaleString("es-CL", { maximumFractionDigits: 1 })} puntos{" "}
                {deltaPuntos > 0 ? "más" : "menos"}
                <span className="font-medium text-muted-foreground/50 ml-0.5">
                  que {ventana.id === "mes" ? "el mes" : ventana.id === "semana" ? "la semana" : "el día"} anterior
                </span>
              </span>
            )}
          </div>

          {/* La cuenta, escrita: el porcentaje de arriba tiene que poder rehacerse. */}
          <p className="text-[11.5px] text-muted-foreground/70 mt-1.5 leading-relaxed">
            <strong className="text-foreground/85">{nf(ultimo.sesiones_con_problema)} de {nf(ultimo.sesiones_analizadas)}</strong>{" "}
            conversaciones revisadas salieron mal{" "}
            <span className="text-muted-foreground/50">({pct1(ultimo.margen_error_pct)})</span>.
          </p>

          <p className="text-[10px] text-muted-foreground/45 mt-1 leading-relaxed">
            {esElUltimoPeriodo
              ? rotulo(String(ultimo.periodo), ventana.id, true)
              : `Último período con análisis: ${rotulo(String(ultimo.periodo), ventana.id, true)}. El actual todavía no tiene conversaciones revisadas.`}
          </p>

          {comparacionDispareja && previo && (
            <p className="text-[10px] text-amber-500/90 mt-1.5 leading-relaxed">
              La cobertura pasó de {pct1(previo.cobertura_pct)} a {pct1(ultimo.cobertura_pct)}: los dos períodos no
              miden lo mismo. Parte de la diferencia puede ser que ahora se revisa más, no que el agente cambió.
            </p>
          )}

          <ResponsiveContainer width="100%" height={170}>
            <ComposedChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gCobertura" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
              <XAxis dataKey="periodo" tick={EJE} tickLine={false} axisLine={false} minTickGap={20}
                tickFormatter={(v: string) => rotulo(v, ventana.id)} />
              {/* Los dos son porcentajes, así que comparten eje sin trampa de escala. */}
              <YAxis tick={EJE} tickLine={false} axisLine={false} width={42} domain={[0, 100]}
                tickFormatter={(v: number) => v + "%"} />
              <Tooltip content={<TooltipError grano={ventana.id} />}
                cursor={{ stroke: "hsl(var(--foreground))", strokeOpacity: 0.2 }} />
              <Area type="monotone" dataKey="cobertura_pct" name="Cobertura"
                stroke="hsl(var(--primary))" strokeOpacity={0.35} strokeWidth={1}
                fill="url(#gCobertura)" connectNulls={false} />
              <Line type="monotone" dataKey="margen_error_pct" name="Margen de error"
                stroke="hsl(350 80% 55%)" strokeWidth={2} dot={<PuntoLinea />} activeDot={{ r: 5 }}
                connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground/50 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-[2px] rounded-full" style={{ background: "hsl(350 80% 55%)" }} />
              margen de error
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-2 rounded-sm bg-primary/20" />
              cuánto se alcanzó a revisar
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full border-2 border-amber-500 bg-card" />
              se revisó menos del {COBERTURA_FLOJA}%: menos confiable
            </span>
          </div>

          {rango && (
            <p className="text-[10.5px] text-muted-foreground/55 mt-2 pt-2 border-t border-border/20 leading-relaxed">
              En {ventana.id === "mes" ? "los meses" : ventana.id === "semana" ? "las semanas" : "los días"} que se ven
              se movió entre <strong className="text-foreground/80">{pct1(rango.min)}</strong> y{" "}
              <strong className="text-foreground/80">{pct1(rango.max)}</strong>. No se promedia a propósito: una
              {ventana.id === "mes" ? " mala racha" : " semana mala"} se ve como lo que fue.
            </p>
          )}

          {/* Qué entra en el número de arriba y qué no. */}
          <div className="mt-2 pt-2 border-t border-border/20 space-y-1.5">
            <p className="text-[10px] text-muted-foreground/55 leading-relaxed">
              <strong className="text-foreground/70">Cuenta como problema</strong> que el agente saque menos de 6 de
              nota, que invente algo, que no responda, o que le diga al cliente que lo deriva a una persona y
              después no genere el ticket —<strong className="text-foreground/70">derivación falsa</strong>: el
              cliente se queda esperando a alguien que nunca se enteró.
            </p>
            <p className={`text-[10px] leading-relaxed ${coberturaFloja ? "text-amber-500/90" : "text-muted-foreground/55"}`}>
              <strong className={coberturaFloja ? "" : "text-foreground/70"}>Cuánto se alcanzó a revisar:</strong>{" "}
              hubo {nf(ultimo.dialogos_con_agente)} conversaciones donde el cliente escribió y el agente le
              contestó, y el analizador revisó {nf(ultimo.conversaciones_analizadas)}
              {" "}({pct1(ultimo.cobertura_pct)}). El porcentaje de arriba sale de esas, no de todas
              {coberturaFloja && " — y a este nivel de revisión conviene tomarlo como una señal, no como un dato firme"}.
            </p>
          </div>

          {ultimo && (
            /*
             * La columna de avisos desaparece cuando no hay ninguno. Hay empresas
             * que no mandan avisos de una vía —Optve no manda ninguno—, y un cero
             * con tres líneas de explicación al lado hace pensar que falta algo.
             */
            <div className={`grid gap-3 mt-2 pt-2 border-t border-border/20 ${
              Number(ultimo.avisos_de_una_via) > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
              <div>
                <p className="text-[14px] font-black tabular-nums">
                  {nf(ultimo.dialogos_con_agente)}
                  {reparto != null && <span className="text-[10px] font-bold text-muted-foreground/45 ml-1">({reparto}%)</span>}
                </p>
                <p className="text-[10px] font-semibold text-muted-foreground/60">conversaciones de ida y vuelta</p>
                <p className="text-[9.5px] text-muted-foreground/45 leading-snug mt-0.5">
                  el cliente escribió y el agente le respondió. Como hay conversación, se puede juzgar si estuvo
                  bien: son las únicas que entran al margen de error.
                </p>
              </div>
              {Number(ultimo.avisos_de_una_via) > 0 && (
                <div>
                  <p className="text-[14px] font-black tabular-nums">
                    {nf(ultimo.avisos_de_una_via)}
                    {reparto != null && <span className="text-[10px] font-bold text-muted-foreground/45 ml-1">({100 - reparto}%)</span>}
                  </p>
                  <p className="text-[10px] font-semibold text-muted-foreground/60">avisos de una vía</p>
                  <p className="text-[9.5px] text-muted-foreground/45 leading-snug mt-0.5">
                    el agente avisó algo —pago recibido, corte programado— y el cliente no contestó.
                    No hay conversación que revisar, así que quedan fuera del cálculo.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Tarjeta>
  );
}
