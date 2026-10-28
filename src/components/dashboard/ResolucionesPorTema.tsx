import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import Dona from "@/components/dashboard/Dona";
import { supabase } from "@/integrations/supabase/client";

/** Los colores de las porciones: distintos entre sí también en luminosidad. */
const PALETA = ["hsl(221 83% 53%)", "hsl(160 70% 38%)", "hsl(38 92% 50%)", "hsl(280 65% 55%)", "hsl(0 72% 55%)", "hsl(190 80% 40%)"];

const nf = (n: number) => (n || 0).toLocaleString("es-CL");

const POR_PAGINA = 1000;
/** Protege el navegador si un período tuviera un volumen enorme. */
const MAX_PAGINAS = 10;
const MAX_FILAS_VISIBLES = 8;

interface Fila {
  /** Una de las 12 categorías cerradas, cuando la base las entrega. */
  categoria?: string;
  topics: unknown;
  resolved_autonomously: boolean | null;
  hubo_derivacion: boolean | null;
}

/** Los temas de una conversación, venga como lista, como JSON en texto o como texto separado por comas. */
function temasDe(valor: unknown): string[] {
  const aTexto = (x: unknown) => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      return String(o.name ?? o.label ?? o.topic ?? o.tema ?? "");
    }
    return "";
  };
  let lista: unknown[] = [];
  if (Array.isArray(valor)) lista = valor;
  else if (typeof valor === "string" && valor.trim()) {
    try {
      const j = JSON.parse(valor);
      lista = Array.isArray(j) ? j : [valor];
    } catch { lista = valor.split(","); }
  }
  const limpios = lista.map(x => aTexto(x).trim()).filter(Boolean);
  // Sin repetidos: el mismo tema dos veces en una conversación no la cuenta doble.
  return [...new Set(limpios)];
}

/**
 * La clave con la que se juntan las variantes de un mismo tema: sin mayúsculas, sin tildes
 * y con guiones y espacios iguales. "Soporte técnico", "soporte_tecnico" y "SOPORTE TECNICO"
 * son el mismo tema. Unir temas que significan lo mismo con otras palabras no se hace acá:
 * eso lo decide la lista de categorías del backend.
 */
const claveTema = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_\-\s]+/g, " ").trim();

const tieneTilde = (t: string) => t.normalize("NFD") !== t;

/** Las 12 categorías cerradas de `v_conversation_categoria`, con su nombre en pantalla. */
const ETIQUETA_CATEGORIA: Record<string, string> = {
  falla_internet: "Falla de internet", falla_tv: "Falla de TV", soporte_tecnico: "Soporte técnico",
  facturacion: "Facturación", pagos: "Pagos", contratacion: "Contratación", cobertura: "Cobertura",
  baja_retiro: "Baja o retiro", derivacion: "Derivación", reclamo: "Reclamo",
  tramites_cuenta: "Trámites de cuenta", otros: "Otros",
};

/** "saldo_a_pagar" → "Saldo a pagar" */
const humanizar = (t: string) => {
  const s = t.replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : t;
};

/**
 * Qué casos resuelve el agente solo y cuáles pasan a una persona, por tipo de caso.
 *
 * El gráfico de arriba da el total por día. Esto lo abre: por ejemplo, que "saldo a
 * pagar" o "medios de pago" los resuelve el agente casi siempre, y "falla técnica" casi
 * nunca. Sale del análisis de cada conversación: tema, si el agente la resolvió y si
 * hubo derivación.
 *
 * Una conversación con dos temas cuenta en los dos, así que la suma de las filas puede
 * superar el total de conversaciones. Se dice en pantalla.
 */
export default function ResolucionesPorTema({ companyId, desde, hasta, sinTitulo = false }: { companyId: string; desde: string; hasta: string; sinTitulo?: boolean }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncado, setTruncado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setFilas(null); setError(null); setTruncado(false);
    (async () => {
      // Las fechas del rango son de Chile y la base guarda UTC. Chile está en UTC-3 o UTC-4 según
      // la época; se usa el desfase que deja entrar una hora de más antes que perder una.
      const ini = `${desde}T00:00:00-03:00`;
      const fin = `${hasta}T23:59:59-04:00`;

      /** Todas las filas de una consulta, de a mil, hasta el tope. */
      const traer = async (tabla: string, columnas: string) => {
        const acum: any[] = [];
        for (let p = 0; ; p++) {
          if (p >= MAX_PAGINAS) { setTruncado(true); break; }
          const { data, error: e } = await (supabase as any)
            .from(tabla).select(columnas).eq("company_id", companyId)
            .gte("analyzed_at", ini).lte("analyzed_at", fin)
            .order("analyzed_at", { ascending: false })
            .range(p * POR_PAGINA, p * POR_PAGINA + POR_PAGINA - 1);
          if (e) return { error: e.message as string, filas: acum };
          acum.push(...(data ?? []));
          if ((data?.length ?? 0) < POR_PAGINA) break;
        }
        return { error: null as string | null, filas: acum };
      };

      // 1) Las 12 categorías cerradas: una fila por conversación, la del análisis más reciente.
      const cat = await traer("v_conversation_categoria", "conversation_id, categoria");
      if (cancelado) return;
      if (!cat.error && cat.filas.length > 0) {
        // La vista dice de qué trata cada conversación; si la resolvió el agente o pasó a una
        // persona sale del análisis. El primero de cada conversación es el más reciente.
        const an = await traer("conversation_analysis", "conversation_id, resolved_autonomously, hubo_derivacion");
        if (cancelado) return;
        const porConversacion = new Map<string, { resolved_autonomously: boolean | null; hubo_derivacion: boolean | null }>();
        for (const r of an.filas) if (!porConversacion.has(r.conversation_id)) porConversacion.set(r.conversation_id, r);
        setFilas(cat.filas.map(r => ({
          categoria: String(r.categoria ?? "otros"), topics: null,
          resolved_autonomously: porConversacion.get(r.conversation_id)?.resolved_autonomously ?? null,
          hubo_derivacion: porConversacion.get(r.conversation_id)?.hubo_derivacion ?? null,
        })));
        return;
      }

      // 2) Sin la vista (todavía no existe o falló): los temas libres del análisis, como antes.
      setTruncado(false);
      const an = await traer("conversation_analysis", "topics, resolved_autonomously, hubo_derivacion");
      if (cancelado) return;
      if (an.error) { setError(an.error); setFilas([]); return; }
      setFilas(an.filas);
    })();
    return () => { cancelado = true; };
  }, [companyId, desde, hasta]);

  const usaCategorias = (filas ?? []).some(f => f.categoria);
  const temas = useMemo(() => {
    if ((filas ?? []).some(f => f.categoria)) {
      const c = new Map<string, { agente: number; operador: number; otros: number }>();
      for (const f of filas ?? []) {
        const k = f.categoria ?? "otros";
        const a = c.get(k) ?? { agente: 0, operador: 0, otros: 0 };
        // Con derivación manda la derivación: aunque el agente haya respondido antes, pasó a una persona.
        a[f.hubo_derivacion ? "operador" : f.resolved_autonomously ? "agente" : "otros"] += 1;
        c.set(k, a);
      }
      return [...c.entries()]
        .map(([clave, v]) => ({ tema: ETIQUETA_CATEGORIA[clave] ?? humanizar(clave), clave, ...v, total: v.agente + v.operador + v.otros }))
        .sort((a, b) => b.total - a.total);
    }
    const m = new Map<string, { agente: number; operador: number; otros: number; variantes: Map<string, number> }>();
    for (const f of filas ?? []) {
      const lista = temasDe(f.topics);
      const claves = lista.length ? lista : ["Sin tema"];
      // Con derivación manda la derivación: aunque el agente haya respondido antes, pasó a una persona.
      const tipo: "agente" | "operador" | "otros" = f.hubo_derivacion ? "operador" : f.resolved_autonomously ? "agente" : "otros";
      // Una conversación que trae el mismo tema escrito de dos formas cuenta una sola vez.
      const vistas = new Set<string>();
      for (const k of claves) {
        const clave = claveTema(k);
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        const a = m.get(clave) ?? { agente: 0, operador: 0, otros: 0, variantes: new Map<string, number>() };
        a[tipo] += 1;
        a.variantes.set(k, (a.variantes.get(k) ?? 0) + 1);
        m.set(clave, a);
      }
    }
    return [...m.entries()]
      .map(([clave, v]) => {
        // El nombre que se muestra: la variante con tilde si existe, y entre ellas la más usada.
        const nombre = [...v.variantes.entries()]
          .sort((a, b) => Number(tieneTilde(b[0])) - Number(tieneTilde(a[0])) || b[1] - a[1])[0][0];
        return { tema: nombre, clave, agente: v.agente, operador: v.operador, otros: v.otros, total: v.agente + v.operador + v.otros };
      })
      .sort((a, b) => b.total - a.total);
  }, [filas]);

  if (filas === null) {
    return <div className="flex justify-center py-5"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" /></div>;
  }
  if (error) {
    return <p className="text-[11px] text-muted-foreground/50 mt-4 pt-3 border-t border-border/15">No se pudo cargar el detalle por tipo de caso: {error}</p>;
  }
  if (temas.length === 0) return null;

  // Una torta con más de siete porciones no se lee: las seis más grandes y el resto junto.
  const PORCIONES = 6;
  const principales = temas.slice(0, PORCIONES);
  const resto = temas.slice(PORCIONES);
  const mostrados = resto.length === 0 ? principales : [
    ...principales,
    {
      tema: `Otros (${resto.length})`, clave: "__otros__",
      agente: resto.reduce((a, x) => a + x.agente, 0),
      operador: resto.reduce((a, x) => a + x.operador, 0),
      otros: resto.reduce((a, x) => a + x.otros, 0),
      total: resto.reduce((a, x) => a + x.total, 0),
    },
  ];
  const total = mostrados.reduce((a, t) => a + t.total, 0);
  const soloIA = mostrados.reduce((a, t) => a + t.agente, 0);

  return (
    <div className={sinTitulo ? "" : "mt-4 pt-3 border-t border-border/15"}>
      {!sinTitulo && <h4 className="text-[12px] font-bold mb-2.5">Por tipo de caso</h4>}
      <Dona
        tam={168}
        centro={nf(total)} subcentro={usaCategorias ? "conversaciones" : "menciones"}
        partes={mostrados.map((t, i) => ({
          valor: t.total,
          color: t.clave === "__otros__" ? "hsl(220 10% 62%)" : PALETA[i % PALETA.length],
          etiqueta: t.clave === "__otros__" ? t.tema : humanizar(t.tema),
          nota: t.clave === "__otros__" ? undefined : `${t.total > 0 ? Math.round((t.agente / t.total) * 100) : 0}% lo resolvió la IA sola`,
        }))}
      />
      <p className="text-[10.5px] text-muted-foreground/70 mt-3 leading-relaxed">
        {total > 0 && <><strong className="text-foreground/80">{Math.round((soloIA / total) * 100)}%</strong> de estos casos los resolvió la IA sola. </>}
        {usaCategorias
          ? "Cada conversación cuenta en una sola categoría."
          : "Una conversación con más de un tema cuenta en cada uno, por eso la suma puede superar el total de conversaciones."}
        {truncado && " Se muestran las más recientes: el período tiene demasiadas conversaciones para cargarlas todas."}
      </p>
    </div>
  );
}
