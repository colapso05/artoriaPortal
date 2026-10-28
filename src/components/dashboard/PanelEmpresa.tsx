import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  MessageCircle, Bot, Clock, ShoppingCart, Gauge, DollarSign,
  AlertTriangle, ArrowRight, ArrowUp, ArrowDown, Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import MetricasCanal from "@/components/dashboard/MetricasCanal";
import GastoDelMes from "@/components/dashboard/GastoDelMes";
import Dona from "@/components/dashboard/Dona";
import TarjetaSaldo from "@/components/dashboard/TarjetaSaldo";
import PanelVortice from "@/components/dashboard/PanelVortice";
import Fijable from "@/components/dashboard/Fijable";
import { usePines } from "@/hooks/usePines";
import { useHoverAbre, ESPERA_HOVER_MS } from "@/hooks/useHoverAbre";
import { motion } from "framer-motion";
import { UMBRAL_ROJO, UMBRAL_AMARILLO } from "@/lib/saldoMensajes";
import ResolucionesPorTema from "@/components/dashboard/ResolucionesPorTema";
import GraficoAtencion, { filasAtencion, type FilaAtencion } from "@/components/dashboard/GraficoAtencion";
import { isoChile, inicioMesChile, diaMes } from "@/lib/meses";
import { ventasResumen, clp, type FilaVenta } from "@/lib/planes";
import { metricasCanal, type FilaMetrica } from "@/lib/canalSalida";
import { usoPlan, usoPlanDiario, type UsoPlan, type PuntoUsoDiario } from "@/lib/consumoIA";
import { VolumenConversaciones, MargenErrorAgente } from "@/components/dashboard/CalidadAgente";
import PlantillasEnviadas from "@/components/dashboard/PlantillasEnviadas";
import CargarSaldo from "@/components/dashboard/CargarSaldo";
import { FRANQUICIA_SERVICIO } from "@/lib/metaMensajeria";
import HistorialPlantillas from "@/components/dashboard/HistorialPlantillas";
import HistorialSimultaneas from "@/components/dashboard/HistorialSimultaneas";
import ClientesEsperando from "@/components/dashboard/ClientesEsperando";
import EstadoAlertas from "@/components/dashboard/EstadoAlertas";
import { conTicketAbierto, type FilaEspera, type FilaEsperaConTicket } from "@/lib/esperaConTicket";
import ComparacionMensual from "@/components/dashboard/ComparacionMensual";

interface Props {
  companyId: string | null;
  companyName: string;
  userName: string;
  onNavigateToTickets?: (status: string, ticketId?: string) => void;
  onNavigateToConversations?: (analysisId?: string, convData?: any) => void;
  onConversationClick?: (conversationId: string) => void;
  /** Abre la Bandeja sin una conversación concreta. */
  onIrABandeja?: () => void;
  /**
   * Lleva a Configuración → Sistema de Alertas. Si el usuario no puede entrar ahí no se
   * pasa, y la franja se muestra sin el acceso directo.
   */
  onIrASistemaAlertas?: () => void;
  /** Lleva a la alerta global en Coberturas, cuando hay una activa. */
  onIrAAlertaActiva?: () => void;
}


type Rango = "hoy" | "7d" | "30d" | "90d" | "todo";
// "todo" no es un número de días: arranca antes de que existiera el portal.
const DIAS: Record<Rango, number> = { hoy: 1, "7d": 7, "30d": 30, "90d": 90, todo: 3650 };
const RANGOS: { id: Rango; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "90d", label: "90 días" },
  { id: "todo", label: "Todo" },
];
const ROTULO_RANGO: Record<Rango, string> = {
  hoy: "hoy", "7d": "los últimos 7 días", "30d": "los últimos 30 días",
  "90d": "los últimos 90 días", todo: "todo el histórico",
};

// Fechas en hora de Chile: pasadas las 21:00 en verano, en UTC ya es el día siguiente.
const iso = (d: Date) => isoChile(d);
const hoy = () => iso(new Date());
const hace = (dias: number) => iso(new Date(Date.now() - dias * 86400000));

const nf = (n: number) => (n || 0).toLocaleString("es-CL");

/**
 * Costo de una hora de operador, si la empresa no configuró el suyo.
 *
 * El valor real vive en `company_config.costo_hora_operador` y se edita desde
 * Ajustes. Esto es solo el piso por si la consulta falla: el monto siempre se
 * muestra con el supuesto al lado, porque un ahorro en pesos sin decir de dónde
 * sale es un número que nadie puede discutir.
 */
const VALOR_HORA_DEFECTO = 4000;

/**
 * Si el panel usa la definición estricta de "resuelta sola".
 *
 * `specialist_count = 0` no prueba que nadie derivó: si el humano todavía no
 * había contestado cuando corrió el análisis, el contador queda en cero y la
 * conversación se cuenta como resuelta sola. En Dropp son 43 de 248 y la tasa
 * pasa de 65,3% a 42,9%.
 *
 * Queda en `false` porque el número mostrado ya se enseñó a clientes y cambiarlo
 * no es una decisión técnica. Poner `true` y listo cuando Demis lo decida.
 */
const TASA_ESTRICTA = false;

/** Minutos a algo que se lee: bajo un minuto, segundos; sobre dos horas, horas. */
function duracion(min: number | null | undefined): string {
  const m = Number(min);
  if (!isFinite(m) || m <= 0) return "—";
  if (m < 1) return `${Math.round(m * 60)} seg`;
  if (m < 90) return `${Math.round(m)} min`;
  const h = m / 60;
  return h < 48 ? `${h.toFixed(h < 10 ? 1 : 0)} h` : `${Math.round(h / 24)} días`;
}

interface Experiencia {
  agente_n: number;
  agente_mediana_min: number | null;
  agente_p90_min: number | null;
  humano_n: number;
  humano_mediana_min: number | null;
  humano_p90_min: number | null;
  derivadas_total: number;
  /** Incumplieron el SLA de 48 h. No es lo mismo que los que siguen esperando. */
  derivadas_sin_respuesta_48h: number;
  /** Los que no recibieron respuesta nunca: es el que calza con la lista. */
  esperando_ahora?: number;
  /**
   * Quiénes son. El conteo de arriba es su largo, calculado en el mismo lugar:
   * no hay forma de que se separen.
   */
  derivadas_sin_respuesta_ids?: EsperaCliente[];
}

interface EsperaCliente {
  conversation_id: string;
  wa_id: string | null;
  profile_name: string | null;
  derivacion_at: string;
  horas_esperando: number;
  topic: string | null;
  summary: string | null;
  status: string | null;
}

/** Horas a algo legible. Pasadas 48 h, "509,1 horas" no se lee: son 21 días. */
function espera(horas: number): string {
  const h = Number(horas) || 0;
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} días`;
}

interface Peak {
  peak_5min: number;
  peak_bucket: string | null;
  mediana_5min: number | null;
  operador_simultaneas_media: number | null;
  operador_ventanas: number;
}

/**
 * Ventanas mínimas para creerle a la concurrencia del operador.
 *
 * Optve firma sus mensajes con el nombre de la empresa, no con el de la persona,
 * así que la RPC los descarta y queda midiendo sobre una sola ventana. Un
 * promedio de una muestra no es un promedio.
 */
const MIN_VENTANAS_OPERADOR = 20;

const ETIQUETA_CATEGORIA: Record<string, string> = {
  venta: "Ventas",
  consulta_comercial: "Consultas comerciales",
  soporte_tecnico: "Soporte técnico",
  pago: "Pagos y cobranza",
};

// ── Tipos de las RPC que ya existen ──────────────────────────────────────────

interface Resumen {
  total_conversations: number;
  ai_resolution_rate: number;
  containment_rate: number;
  escalation_rate: number;
  escalated_count: number;
  avg_bot_score: number | null;
  resolved_autonomously: number;
  ai_resolution_rate_estricta?: number | null;
  escalation_rate_estricta?: number | null;
  time_saved_hours: number | null;
  time_saved_autonomas_hours?: number | null;
  time_saved_triage_hours?: number | null;
  /** Desglose por tipo de caso. Lo agrega la fórmula v2. */
  time_saved_desglose?: Record<string, { conversaciones: number; minutos: number; minutos_por_caso: number }>;
  triage_pct?: number;
  human_overhead_minutes: number;
  top_topics?: { topic: string; count: number }[];
}

interface FilaLinea {
  period: string;
  total: number;
  resolved: number;
  escalated: number;
  avg_score: number | null;
}

const EJE = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

/** Los paneles que se abren desde las tarjetas de arriba. */
type HubId = "mensajeria" | "conversaciones" | "resolucion";

const HUBS: Record<HubId, { titulo: string; subtitulo: string }> = {
  mensajeria: { titulo: "Mensajería", subtitulo: "Saldo, gasto, plantillas y canales en un solo lugar." },
  conversaciones: { titulo: "Conversaciones", subtitulo: "Cuántas llegan, a qué hora, de qué hablan y cómo vamos mes a mes." },
  resolucion: { titulo: "Resolución del agente", subtitulo: "Qué resuelve solo, qué pasa a una persona, cuánto espera tu cliente y cómo se usa el plan." },
};

/**
 * Un bloque de información. Vive en el panel de su tarjeta y se puede fijar en el inicio.
 *
 * `ancho` es de 12 columnas (4, 6, 8 o 12): están elegidos para que lo que se fije cierre
 * filas completas sin dejar huecos. Un módulo sin datos devuelve null y no se muestra.
 */
interface Modulo {
  id: string;
  hub: HubId;
  ancho: 4 | 6 | 8 | 12;
  /** false = es parte del panel y no tiene sentido en el inicio (el saldo ya está arriba). */
  pinable?: boolean;
  nodo: (enPanel: boolean) => React.ReactNode;
}

const SPAN: Record<number, string> = { 4: "xl:col-span-4", 6: "xl:col-span-6", 8: "xl:col-span-8", 12: "xl:col-span-12" };

/**
 * Panel de la empresa.
 *
 * Responde cuatro preguntas y nada más: cuánto trabajo me saca el agente, cuánto
 * vende, qué necesita mi atención ahora, y de qué me está escribiendo la gente.
 *
 * Lo que había antes eran tickets — evolución, distribución, etiquetas — y eso el
 * operador ya lo ve en la Bandeja y en el Centro de Tickets. Repetirlo en la
 * portada llenaba la pantalla sin responder ninguna pregunta de negocio.
 */
export default function PanelEmpresa({
  companyId, companyName, userName, onNavigateToTickets, onNavigateToConversations,
  onIrABandeja, onConversationClick, onIrASistemaAlertas, onIrAAlertaActiva,
}: Props) {
  const [rango, setRango] = useState<Rango>("30d");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [linea, setLinea] = useState<FilaLinea[]>([]);
  const [atencion, setAtencion] = useState<FilaAtencion[] | null>(null);
  const [horas, setHoras] = useState<{ hour: number; total: number }[]>([]);
  const [ventas, setVentas] = useState<FilaVenta[]>([]);
  const [cargando, setCargando] = useState(true);

  // El panel de Mensajería (sale de la tarjeta del saldo) y lo que cada persona fijó en el inicio.
  const [hub, setHub] = useState<HubId | null>(null);
  const refSaldo = useRef<HTMLDivElement>(null);
  const refConv = useRef<HTMLDivElement>(null);
  const refRes = useRef<HTMLDivElement>(null);
  /** El último panel abierto: al cerrarse sigue dibujado mientras el efecto lo recoge. */
  // Paneles ya armados (ocultos): se preparan al acercar el cursor y, pasados unos segundos
  // de calma, uno tras otro, para que al abrirlos no se vean cargando.
  const [calientes, setCalientes] = useState<Set<HubId>>(new Set());
  const calentar = useCallback((h: HubId) => setCalientes(p => (p.has(h) ? p : new Set(p).add(h))), []);
  useEffect(() => { if (hub) calentar(hub); }, [hub, calentar]);
  useEffect(() => {
    if (!companyId) return;
    const ts = (["mensajeria", "conversaciones", "resolucion"] as HubId[]).map((h, i) => setTimeout(() => calentar(h), 2500 + i * 2500));
    return () => ts.forEach(clearTimeout);
  }, [companyId, calentar]);
  // Lo que viene fijado la primera vez: lo esencial, en filas completas (8+4 y 6+6).
  const { pines, alternar: alternarPin, estaFijado } = usePines(companyId, ["volumen", "espera", "temas", "gasto"]);
  /** El período anterior, de la misma longitud, para decir si las cifras suben o bajan. */
  const [previo, setPrevio] = useState<{ total: number | null; contencion: number | null; horas: number | null; ventas: number | null; totalAt: number | null; contAt: number | null } | null>(null);

  const [valorHora, setValorHora] = useState(VALOR_HORA_DEFECTO);
  const [experiencia, setExperiencia] = useState<Experiencia | null>(null);
  const [peak, setPeak] = useState<Peak | null>(null);

  /*
   * Detalles verificables. Un número que no se puede abrir es un número que hay
   * que creer, y el dueño de un ISP no tiene por qué creerlo: al tocar la tarjeta
   * se ve de dónde sale, fila por fila.
   */
  const [detalle, setDetalle] = useState<null | { tipo: "ventas" } | { tipo: "tiempo" } | { tipo: "espera" } | { tipo: "tema"; tema: string }>(null);
  const [filasDetalle, setFilasDetalle] = useState<any[] | null>(null);
  /** Los clientes esperando que de verdad tienen ticket abierto. null = verificando. */
  const [esperaConTicket, setEsperaConTicket] = useState<FilaEsperaConTicket[] | null | "error">(null);

  const desde = hace(DIAS[rango]);

  /*
   * Qué empresa ve el saldo del proveedor.
   *
   * El saldo con el que salen los mensajes por el canal oficial. No se recarga
   * desde el portal —es un servicio externo— pero hay que mirarlo para saber cuándo
   * poner plata: si llega a cero deja de salir cualquier mensaje oficial.
   *
   * Antes lo veía solo Dropp, y el criterio era que el nombre calzara con /dropp/i.
   * Con el cambio de políticas de Meta lo necesitan las dos empresas, así que la
   * heurística se va entera. Es mejor así: adivinar por el nombre se iba a romper
   * el día que un cliente se llamara parecido.
   */

  const cargar = useCallback(async () => {
    if (!companyId) return;
    setCargando(true);
    // El período anterior de la misma longitud, justo antes del actual. En "todo" no hay con qué comparar.
    const hayPrevio = rango !== "todo";
    const restar = (f: string, n: number) => iso(new Date(new Date(f + "T12:00:00").getTime() - n * 86400000));
    const finPrev = restar(desde, 1);
    const iniPrev = restar(desde, DIAS[rango] + 1);
    const [res, tl, hr, vt, exp, pk, at, pr, vp, apv] = await Promise.all([
      supabase.rpc("get_analytics_summary", {
        p_company_id: companyId, p_start_date: desde, p_end_date: hoy(),
      }),
      supabase.rpc("get_analytics_timeline", {
        p_company_id: companyId, p_date_from: desde, p_date_to: hoy(), p_granularity: "day",
      }),
      (supabase as any).rpc("get_analytics_hourly_volume", {
        p_company_id: companyId, p_date_from: desde, p_date_to: hoy(),
      }),
      ventasResumen(companyId, desde, hoy()),
      (supabase as any).rpc("experiencia_atencion", {
        p_company_id: companyId, p_desde: desde, p_hasta: hoy(),
      }),
      (supabase as any).rpc("peak_concurrencia", {
        p_company_id: companyId, p_desde: desde, p_hasta: hoy(),
      }),
      // Conversaciones atendidas por día, abiertas en simples, complejas y derivadas.
      (supabase as any).rpc("get_atencion_ia_diaria", {
        p_company_id: companyId, p_desde: desde, p_hasta: hoy(),
      }),
      hayPrevio
        ? supabase.rpc("get_analytics_summary", { p_company_id: companyId, p_start_date: iniPrev, p_end_date: finPrev })
        : Promise.resolve(null),
      hayPrevio ? ventasResumen(companyId, iniPrev, finPrev) : Promise.resolve(null),
      hayPrevio
        ? (supabase as any).rpc("get_atencion_ia_diaria", { p_company_id: companyId, p_desde: iniPrev, p_hasta: finPrev })
        : Promise.resolve(null),
    ]);
    // Las conversaciones se cuentan con la atención diaria (la misma del gráfico), no con el análisis nocturno.
    const filasPrev = apv?.error ? null : filasAtencion(apv?.data);
    const sumPrev = filasPrev?.reduce((a, f) => ({
      total: a.total + f.simples + f.complejas + f.derivadas + f.sinAtencion, ia: a.ia + f.simples + f.complejas,
    }), { total: 0, ia: 0 }) ?? null;
    const totalAt = sumPrev && sumPrev.total > 0 ? sumPrev.total : null;
    const contAt = sumPrev && sumPrev.total > 0 ? (sumPrev.ia / sumPrev.total) * 100 : null;
    if (pr && (pr as any).data) {
      const p = (pr as any).data as Resumen;
      setPrevio({
        total: p.total_conversations ?? null,
        contencion: (TASA_ESTRICTA ? p.ai_resolution_rate_estricta ?? p.containment_rate : p.containment_rate) ?? null,
        totalAt, contAt,
        horas: p.time_saved_hours ?? null,
        ventas: ((vp ?? []) as FilaVenta[]).reduce((a, x) => a + (Number(x.ventas) || 0), 0),
      });
    } else setPrevio(null);
    // Si la función falla (o todavía no existe) queda null y el gráfico de siempre sigue funcionando.
    setAtencion(at?.error ? null : filasAtencion(at?.data));
    setExperiencia((exp?.data as Experiencia) ?? null);
    setPeak((pk?.data as Peak) ?? null);
    setResumen((res.data as Resumen) ?? null);
    setLinea(Array.isArray(tl.data) ? (tl.data as FilaLinea[]) : []);
    setHoras(Array.isArray(hr.data) ? hr.data : []);
    setVentas(vt);
    setCargando(false);
  }, [companyId, desde]);

  useEffect(() => { cargar(); }, [cargar]);

  // El costo de la hora no depende del rango: se lee una vez por empresa.
  useEffect(() => {
    if (!companyId) return;
    (supabase as any)
      .from("company_config").select("costo_hora_operador").eq("id", companyId).maybeSingle()
      .then(({ data }: any) => {
        const v = Number(data?.costo_hora_operador);
        if (v > 0) setValorHora(v);
      });
  }, [companyId]);

  // Los que esperan, filtrados a los que tienen un ticket abierto (ver lib/esperaConTicket).
  useEffect(() => {
    if (!companyId || !experiencia) { setEsperaConTicket(null); return; }
    let cancelado = false;
    setEsperaConTicket(null);
    conTicketAbierto(companyId, (experiencia.derivadas_sin_respuesta_ids ?? []) as FilaEspera[])
      .then(r => { if (!cancelado) setEsperaConTicket(r ?? "error"); });
    return () => { cancelado = true; };
  }, [companyId, experiencia]);

  useEffect(() => {
    if (!detalle || !companyId) { setFilasDetalle(null); return; }
    // Estos dos no consultan nada: sus datos ya vinieron con el resumen.
    if (detalle.tipo === "tiempo") { setFilasDetalle([]); return; }
    if (detalle.tipo === "espera") {
      // La misma lista que la tarjeta: con ticket abierto, no la que trae el análisis.
      setFilasDetalle(Array.isArray(esperaConTicket) ? esperaConTicket : []);
      return;
    }
    let cancelado = false;
    (async () => {
      setFilasDetalle(null);
      if (detalle.tipo === "ventas") {
        // Las ventas reales, una por fila. El precio se congela al cerrar el
        // ticket, así que sale de ahí y no de la parrilla de hoy.
        const { data } = await (supabase as any)
          .from("tickets")
          .select("id, customer_name, customer_rut, created_at, plan_precio, plan_fue_oferta, status")
          .eq("company_id", companyId)
          .not("plan_precio", "is", null)
          .gte("created_at", desde)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(200);
        if (!cancelado) setFilasDetalle(data ?? []);
      } else {
        const { data } = await (supabase as any)
          .from("conversation_analysis")
          // La nota corregida por el revisor manda; ver `nota_efectiva` en la base.
          .select("id, conversation_id, bot_score:nota_efectiva, summary, session_start")
          .eq("company_id", companyId)
          .contains("topics", [detalle.tema])
          .gte("session_start", desde)
          .order("session_start", { ascending: false })
          .limit(100);
        if (!cancelado) setFilasDetalle(data ?? []);
      }
    })();
    return () => { cancelado = true; };
  }, [detalle, companyId, desde, experiencia, esperaConTicket]);

  // ── Derivados ──────────────────────────────────────────────────────────────
  /*
   * Serie diaria y si el desglose por día sirve.
   *
   * `get_analytics_timeline` trae `escalated` y `resolved`, pero puede devolver
   * cero en los dos aunque el resumen del mismo período diga que hubo derivadas.
   * Cuando eso pasa, pintar la banda ámbar en cero afirma que nunca interviene
   * un humano, y eso es falso: mejor un solo trazo y decir que el detalle diario
   * no está. Se arregla solo el día que la RPC llene esos campos.
   */
  const { serie, desgloseFiable } = useMemo(() => {
    const filas = linea.map(f => {
      const total = f.total || 0;
      const porEscalated = f.escalated || 0;
      const porResueltas = f.resolved != null ? Math.max(0, total - (f.resolved || 0)) : 0;
      const derivadas = porEscalated > 0 ? porEscalated : porResueltas;
      return {
        dia: diaMes(String(f.period)),
        resueltas: Math.max(0, total - derivadas),
        derivadas,
        total,
      };
    });
    return { serie: filas, desgloseFiable: filas.some(f => f.derivadas > 0) };
  }, [linea]);

  /*
   * Los totales del periodo, para el pie del grafico.
   *
   * La tarjeta mide mas alto que el grafico porque la columna de al lado es larga,
   * y abajo quedaba un blanco. Estos son los numeros que hasta ahora habia que
   * deducir mirando la curva; puestos como texto se leen de una.
   */
  const totalesVolumen = useMemo(() => {
    let resueltas = 0, derivadas = 0, total = 0;
    for (const f of serie) {
      resueltas += f.resueltas || 0;
      derivadas += f.derivadas || 0;
      total += f.total || 0;
    }
    return { resueltas, derivadas, total, pct: total > 0 ? (resueltas / total) * 100 : null };
  }, [serie]);

  const ventasResumidas = useMemo(() => {
    const suma = (k: keyof FilaVenta) => ventas.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    return {
      cantidad: suma("ventas"),
      monto: suma("monto_mensual"),
      sinCerrar: suma("consultas_sin_plan"),
    };
  }, [ventas]);

  const porHora = useMemo(() => {
    const mapa = new Map(horas.map(h => [Number(h.hour), Number(h.total) || 0]));
    return Array.from({ length: 24 }, (_, h) => ({ hora: h, total: mapa.get(h) ?? 0 }));
  }, [horas]);

  const horaPico = useMemo(
    () => porHora.reduce((a, b) => (b.total > a.total ? b : a), { hora: 0, total: 0 }),
    [porHora],
  );

  const temas = useMemo(() => {
    const t = resumen?.top_topics ?? [];
    const total = t.reduce((a, x) => a + (Number(x.count) || 0), 0) || 1;
    return t.slice(0, 6).map(x => ({ ...x, pct: (Number(x.count) / total) * 100 }));
  }, [resumen]);

  /*
   * La tasa que se muestra. La estricta descuenta las conversaciones donde el
   * humano todavía no había contestado al momento del análisis — más baja y más
   * defendible. Ver TASA_ESTRICTA.
   */
  const contencion = (TASA_ESTRICTA
    ? resumen?.ai_resolution_rate_estricta ?? resumen?.containment_rate
    : resumen?.containment_rate) ?? null;
  const score = resumen?.avg_bot_score ?? null;

  /*
   * Las conversaciones y cuántas resolvió la IA sola salen de la atención diaria, la misma
   * fuente del gráfico, para que tarjeta y gráfico digan lo mismo. El resumen del análisis
   * nocturno cuenta otra cosa (solo lo que el analizador alcanzó a revisar) y queda de respaldo.
   */
  const sumaAt = atencion
    ? atencion.reduce((a, f) => ({ s: a.s + f.simples, c: a.c + f.complejas, d: a.d + f.derivadas, n: a.n + f.sinAtencion }), { s: 0, c: 0, d: 0, n: 0 })
    : null;
  const totalConv = sumaAt ? sumaAt.s + sumaAt.c + sumaAt.d + sumaAt.n : (resumen?.total_conversations ?? 0);
  const derivadasConv = sumaAt ? sumaAt.d : (resumen?.escalated_count ?? 0);
  const contVista = sumaAt && totalConv > 0 ? ((sumaAt.s + sumaAt.c) / totalConv) * 100 : contencion;

  // Variación contra el período anterior. Sin dato anterior (o en 0) no se inventa un porcentaje.
  const variacion = (act: number | null | undefined, ant: number | null | undefined, sube: "bueno" | "neutro" = "bueno") => {
    if (act == null || ant == null || ant <= 0) return undefined;
    const v = ((act - ant) / ant) * 100;
    return mkDelta(v, "%", sube);
  };
  const dConv = variacion(totalConv, sumaAt ? previo?.totalAt : previo?.total, "neutro");
  const dHoras = variacion(resumen?.time_saved_hours, previo?.horas);
  const dVentas = variacion(ventasResumidas.cantidad, previo?.ventas);
  const contPrev = sumaAt ? previo?.contAt : previo?.contencion;
  const dCont = contVista != null && contPrev != null ? mkDelta(contVista - contPrev, " pts", "bueno") : undefined;

  // ── Los módulos: cada bloque de información, con el panel donde vive ──
  const reparto = (() => {
    const t = (atencion ?? []).reduce((a, f) => ({
      simples: a.simples + f.simples, complejas: a.complejas + f.complejas,
      derivadas: a.derivadas + f.derivadas, sinAtencion: a.sinAtencion + f.sinAtencion,
    }), { simples: 0, complejas: 0, derivadas: 0, sinAtencion: 0 });
    return t;
  })();

  const MODULOS: Modulo[] = companyId ? [
    // Mensajería
    { id: "saldo", hub: "mensajeria", ancho: 4, pinable: false, nodo: () => <SaldoMensajes companyId={companyId} companyName={companyName} /> },
    { id: "gasto", hub: "mensajeria", ancho: 4, nodo: () => <GastoDelMes companyId={companyId} /> },
    { id: "plantillas", hub: "mensajeria", ancho: 4, nodo: () => <PlantillasEnviadas companyId={companyId} /> },
    { id: "historial", hub: "mensajeria", ancho: 4, nodo: () => <HistorialPlantillas companyId={companyId} /> },
    { id: "canal", hub: "mensajeria", ancho: 8, nodo: () => <MetricasCanal companyId={companyId} /> },

    // Conversaciones
    { id: "volumen", hub: "conversaciones", ancho: 8, nodo: (enPanel: boolean) => (
        <Panel
          titulo="Volumen y resolución"
          nota="Las dos franjas se suman: el alto de cada día es el total de conversaciones"
        >
          {atencion ? <GraficoAtencion filas={atencion} cargando={cargando} alto={enPanel ? 340 : 230} /> : (<>
          {cargando ? <Espera alto={enPanel ? 340 : 230} /> : serie.length === 0 ? (
            <Vacio texto="Todavía no hay conversaciones en este período" alto={enPanel ? 340 : 230} />
          ) : (
            <ResponsiveContainer width="100%" height={enPanel ? 340 : 230}>
              <AreaChart data={serie} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gResueltas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(160 70% 45%)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="hsl(160 70% 45%)" stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="gDerivadas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(38 92% 55%)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(38 92% 55%)" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.25} vertical={false} />
                <XAxis dataKey="dia" tick={EJE} tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis tick={EJE} tickLine={false} axisLine={false} width={38} />
                <Tooltip content={<TooltipVolumen />} cursor={{ stroke: "hsl(var(--foreground))", strokeOpacity: 0.2 }} />
                {desgloseFiable ? (
                  <>
                    <Area type="monotone" dataKey="resueltas" name="Resueltas por el agente"
                      stackId="1" stroke="hsl(160 70% 45%)" fill="url(#gResueltas)" strokeWidth={2} />
                    <Area type="monotone" dataKey="derivadas" name="Pasaron a un operador"
                      stackId="1" stroke="hsl(38 92% 55%)" fill="url(#gDerivadas)" strokeWidth={1} />
                  </>
                ) : (
                  <Area type="monotone" dataKey="total" name="Conversaciones"
                    stroke="hsl(var(--primary))" fill="url(#gResueltas)" strokeWidth={2} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
          {desgloseFiable ? (
            <>
              <div className="flex items-center gap-4 mt-2 px-1 flex-wrap">
                <Leyenda color="hsl(160 70% 45%)" texto="Resueltas por el agente" />
                <Leyenda color="hsl(38 92% 55%)" texto="Pasaron a un operador" />
                <span className="text-[10px] text-muted-foreground/40">
                  Cada franja es su propia cantidad; juntas dan el total del día.
                </span>
              </div>
              {totalesVolumen.total > 0 && (
                <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-border/15">
                  <div>
                    <p className="text-[19px] font-black tabular-nums leading-none" style={{ color: "hsl(160 70% 40%)" }}>
                      {nf(totalesVolumen.resueltas)}
                    </p>
                    <p className="text-[10.5px] text-muted-foreground/55 mt-1">resueltas por el agente</p>
                  </div>
                  <div>
                    <p className="text-[19px] font-black tabular-nums leading-none" style={{ color: "hsl(38 92% 45%)" }}>
                      {nf(totalesVolumen.derivadas)}
                    </p>
                    <p className="text-[10.5px] text-muted-foreground/55 mt-1">pasaron a un operador</p>
                  </div>
                  <div>
                    <p className="text-[19px] font-black tabular-nums leading-none">
                      {totalesVolumen.pct != null ? Math.round(totalesVolumen.pct) + "%" : "—"}
                    </p>
                    <p className="text-[10.5px] text-muted-foreground/55 mt-1">sin necesitar a nadie</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-[10.5px] text-muted-foreground/45 mt-2 px-1 leading-relaxed">
              Total de conversaciones por día.
              {resumen && resumen.escalation_rate > 0 && (
                <> El desglose diario entre resueltas y derivadas no viene en los datos —
                en el período completo, {Math.round(resumen.escalation_rate)}% pasó a un operador.</>
              )}
            </p>
          )}
          </>)}
        </Panel>
    ) },
    { id: "horas", hub: "conversaciones", ancho: 4, nodo: (enPanel: boolean) => (
          <Panel
            titulo="A qué hora te escriben"
            nota={horaPico.total > 0
              ? `El pico es a las ${String(horaPico.hora).padStart(2, "0")}:00`
              : "Sirve para saber a qué hora conviene tener gente"}
          >
            {cargando ? <Espera alto={enPanel ? 300 : 190} /> : (
              <ResponsiveContainer width="100%" height={enPanel ? 300 : 190}>
                <BarChart data={porHora} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                  <XAxis dataKey="hora" tick={EJE} tickLine={false} axisLine={false}
                    ticks={[0, 4, 8, 12, 16, 20]} tickFormatter={h => `${h}h`} />
                  <YAxis tick={EJE} tickLine={false} axisLine={false} width={38} />
                  <Tooltip
                    content={<TooltipHoras />}
                    cursor={{ fill: "hsl(var(--foreground))", fillOpacity: 0.06 }}
                  />
                  <Bar dataKey="total" name="Conversaciones" radius={[3, 3, 0, 0]}>
                    {/* La hora punta se pinta distinto: es el dato que se busca acá. */}
                    {porHora.map(h => (
                      <Cell key={h.hora}
                        fill={h.hora === horaPico.hora && horaPico.total > 0
                          ? "hsl(var(--primary))"
                          : "hsl(var(--primary) / 0.28)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>
    ) },
    { id: "temas", hub: "conversaciones", ancho: 6, nodo: (enPanel: boolean) => (
          <Panel titulo="De qué te escriben" nota="Toca un motivo para ver las conversaciones">
            {cargando ? <Espera alto={enPanel ? 300 : 190} /> : temas.length === 0 ? (
              <Vacio texto="Todavía no hay temas analizados" alto={enPanel ? 300 : 190} />
            ) : (
              <div className="space-y-2.5 py-1">
                {temas.map(t => (
                  <button
                    key={t.topic}
                    onClick={() => setDetalle({ tipo: "tema", tema: t.topic })}
                    className="w-full text-left group"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="text-[12.5px] font-semibold truncate capitalize">{t.topic}</span>
                      <span className="text-[11.5px] tabular-nums text-muted-foreground/60 flex-shrink-0">
                        {nf(t.count)} <span className="text-muted-foreground/40">({Math.round(t.pct)}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                      <div className="h-full rounded-full bg-primary/70 group-hover:bg-primary transition-colors"
                        style={{ width: `${Math.max(2, t.pct)}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>
    ) },
    { id: "mesames", hub: "conversaciones", ancho: 6, nodo: () => <ComparacionMensual companyId={companyId} /> },
    { id: "volumenConv", hub: "conversaciones", ancho: 6, nodo: () => <VolumenConversaciones companyId={companyId} /> },
    { id: "simultaneas", hub: "conversaciones", ancho: 6, nodo: () => <HistorialSimultaneas companyId={companyId} /> },

    // Resolución del agente
    { id: "reparto", hub: "resolucion", ancho: 4, nodo: () => (
      <Panel titulo="Cómo se resolvieron" nota="Las conversaciones del período, por tipo">
        {atencion && (reparto.simples + reparto.complejas + reparto.derivadas + reparto.sinAtencion) > 0 ? (
          <Dona tam={150}
            centro={nf(reparto.simples + reparto.complejas + reparto.derivadas + reparto.sinAtencion)} subcentro="conversaciones"
            partes={[
              { valor: reparto.simples, color: "hsl(160 70% 42%)", etiqueta: "IA · consultas simples" },
              { valor: reparto.complejas, color: "hsl(200 80% 50%)", etiqueta: "IA · casos complejos" },
              { valor: reparto.derivadas, color: "hsl(38 92% 52%)", etiqueta: "Derivadas a un operador" },
              { valor: reparto.sinAtencion, color: "hsl(220 10% 60%)", etiqueta: "Sin atención de la IA" },
            ]} />
        ) : resumen && (resumen.total_conversations ?? 0) > 0 ? (
          <Dona tam={150} centro={nf(resumen.total_conversations ?? 0)} subcentro="conversaciones"
            partes={[
              { valor: Math.max(0, (resumen.total_conversations ?? 0) - (resumen.escalated_count ?? 0)), color: "hsl(160 70% 42%)", etiqueta: "Resueltas por el agente" },
              { valor: resumen.escalated_count ?? 0, color: "hsl(38 92% 52%)", etiqueta: "Pasaron a un operador" },
            ]} />
        ) : <Vacio texto="Todavía no hay conversaciones en este período" alto={150} />}
      </Panel>
    ) },
    { id: "tipos", hub: "resolucion", ancho: 8, nodo: () => (
      <Panel titulo="Por tipo de caso" nota="Qué resuelve el agente solo y qué pasa a una persona">
        <ResolucionesPorTema companyId={companyId} desde={desde} hasta={hoy()} sinTitulo />
      </Panel>
    ) },
    { id: "calidad", hub: "resolucion", ancho: 6, nodo: () => <MargenErrorAgente companyId={companyId} /> },
    { id: "planIA", hub: "resolucion", ancho: 6, nodo: () => <PlanIA companyId={companyId} /> },

    // Atención: lo que espera el cliente y quién está esperando
    { id: "experiencia", hub: "resolucion", ancho: 8, nodo: () =>
      experiencia && experiencia.agente_mediana_min != null ? <ExperienciaCliente exp={experiencia} peak={peak} /> : null },
    { id: "espera", hub: "resolucion", ancho: 12, nodo: () => experiencia ? (
      <ClientesEsperando filas={esperaConTicket} onAbrir={(id) => onConversationClick?.(id)} onVerTodos={() => setDetalle({ tipo: "espera" })} />
    ) : null },

  ] : [];
  const fijados = MODULOS.filter(m => m.pinable !== false && estaFijado(m.id) && m.nodo(false) != null);
  const modulosDe = (h: HubId) => MODULOS.filter(m => m.hub === h && m.nodo(true) != null);

  return (
    <div className="flex flex-col min-h-full gap-4 pt-1 pb-4">

      {/* ── Cabecera ── */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold tracking-tight truncate">
            Hola{userName ? `, ${userName.split(" ")[0]}` : ""}
          </h2>
          <p className="text-[12.5px] text-muted-foreground/60">
            Cómo está funcionando tu atención {ROTULO_RANGO[rango]}
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-border/30 overflow-hidden text-[11.5px] font-semibold flex-shrink-0">
          {RANGOS.map(r => (
            <button
              key={r.id}
              onClick={() => setRango(r.id)}
              className={`px-3 py-1.5 transition-colors ${
                rango === r.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── El sistema de alertas: estado y contador de reclamos ──
          Va arriba de todo porque es lo único de la pantalla que puede estar pasando
          ahora mismo y pedir que alguien actúe. */}
      {companyId && <EstadoAlertas companyId={companyId} onConfigurar={onIrASistemaAlertas} onVerAlerta={onIrAAlertaActiva} />}

      {/* ── Fila 1: saldo y los cuatro números que importan ──
          El saldo va primero y ancho: es lo que se acaba. Mantener el cursor encima abre el
          panel de Mensajería. "Calidad del agente" salió de esta fila (queda en "Margen de
          error" más abajo) para dejar solo lo que se mira todos los días. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6
        [&>*:nth-child(1)]:col-span-2 lg:[&>*:nth-child(n+4)]:col-span-2 xl:[&>*:nth-child(n+4)]:col-span-1">
        <TarjetaSaldo companyId={companyId} abierto={hub === "mensajeria"} alAbrir={() => setHub("mensajeria")} alEntrar={() => calentar("mensajeria")} innerRef={refSaldo} />
        <Tile
          icon={MessageCircle} tono="text-primary" fondo="bg-primary/10"
          rotulo="Conversaciones"
          hub={{ abierto: hub === "conversaciones", alAbrir: () => setHub("conversaciones"), alEntrar: () => calentar("conversaciones"), innerRef: refConv }}
          valor={cargando ? null : nf(totalConv)}
          delta={dConv}
          pie={rango === "hoy" || rango === "todo"
            ? ""
            : `${((totalConv / DIAS[rango]) || 0).toFixed(1)} por día`}
        />
        <Tile
          icon={Bot} tono="text-emerald-600 dark:text-emerald-400" fondo="bg-emerald-500/15"
          rotulo="Resueltas sin operador"
          hub={{ abierto: hub === "resolucion", alAbrir: () => setHub("resolucion"), alEntrar: () => calentar("resolucion"), innerRef: refRes }}
          valor={cargando || contVista == null ? null : `${Math.round(contVista)}%`}
          delta={dCont}
          pie={`${nf(derivadasConv)} de ${nf(totalConv)} necesitaron a alguien`}
        />
        <Tile
          icon={Clock} tono="text-violet-600 dark:text-violet-400" fondo="bg-violet-500/15"
          rotulo="Tiempo ahorrado"
          alTocar={resumen?.time_saved_hours ? () => setDetalle({ tipo: "tiempo" }) : undefined}
          valor={cargando ? null : resumen?.time_saved_hours != null ? `${nf(Math.round(resumen.time_saved_hours))} h` : "—"}
          delta={dHoras}
          pie={resumen?.time_saved_hours
            ? `≈ ${clp(Math.round(resumen.time_saved_hours * valorHora))} en horas de operador`
            : "sin datos del período"}
        />
        <Tile
          icon={ShoppingCart} tono="text-sky-600 dark:text-sky-400" fondo="bg-sky-500/15"
          alTocar={() => setDetalle({ tipo: "ventas" })}
          rotulo="Ventas del agente"
          valor={cargando ? null : nf(ventasResumidas.cantidad)}
          delta={dVentas}
          pie={ventasResumidas.sinCerrar > 0
            ? `${clp(ventasResumidas.monto)} · ${nf(ventasResumidas.sinCerrar)} consultas sin cerrar`
            : ventasResumidas.monto > 0 ? `${clp(ventasResumidas.monto)} mensuales` : "sin ventas cerradas"}
        />
      </div>

      {/* ── Tu panel: lo que cada persona fijó ──
          El inicio es corto a propósito: cinco números y lo que cada uno eligió ver. Todo lo
          demás vive en el panel de cada tarjeta (mantén el cursor encima un segundo) y se
          fija desde ahí. */}
      {companyId && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-[17px] font-bold tracking-tight">Tu panel</h3>
              <p className="text-[12.5px] text-muted-foreground">
                Mantén el cursor sobre un número de arriba para ver más y fijar aquí lo que quieras.
              </p>
            </div>
          </div>
          {fijados.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card/50 px-5 py-8 text-[13.5px] text-muted-foreground leading-relaxed text-center">
              Todavía no fijaste nada. Abre cualquier tarjeta y toca «Fijar» en lo que quieras ver todos los días.
            </p>
          ) : (
            <div className="columns-[460px] gap-5 pt-2">
              {fijados.map(m => (
                <Fijable key={m.id} fijado modo="inicio" alAlternar={() => alternarPin(m.id)}
                  className="break-inside-avoid mb-5">
                  {m.nodo(false)}
                </Fijable>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── El panel de cada tarjeta: sale de ella con un vórtice y vuelve a entrar al cerrarse ── */}
      {companyId && (["mensajeria", "conversaciones", "resolucion"] as HubId[]).map(h => (
        <PanelVortice
          key={h}
          abierto={hub === h} alCerrar={() => setHub(null)} precalentar={calientes.has(h)}
          origen={{ mensajeria: refSaldo, conversaciones: refConv, resolucion: refRes }[h]}
          titulo={HUBS[h].titulo} subtitulo={`${HUBS[h].subtitulo} Fija lo que quieras ver en el inicio.`}
        >
          {(calientes.has(h) || hub === h) && (
            <div className="columns-[420px] gap-6">
              {modulosDe(h).map(m => m.pinable === false ? (
                <div key={m.id} className="break-inside-avoid mb-6">{m.nodo(true)}</div>
              ) : (
                <Fijable key={m.id} fijado={estaFijado(m.id)} alAlternar={() => alternarPin(m.id)}
                  className="break-inside-avoid mb-6">
                  {m.nodo(true)}
                </Fijable>
              ))}
            </div>
          )}
        </PanelVortice>
      ))}

      {/* ── El detrás de un número ── */}
      <Dialog open={!!detalle} onOpenChange={o => { if (!o) setDetalle(null); }}>
        <DialogContent className="max-w-2xl bg-card border-border/30">
          <DialogHeader>
            <DialogTitle className="text-[15px]">
              {detalle?.tipo === "ventas" ? "Ventas del agente"
                : detalle?.tipo === "espera" ? "Clientes esperando a una persona"
                : detalle?.tipo === "tiempo" ? "De dónde salen esas horas"
                : detalle ? <span className="capitalize">{detalle.tema}</span> : ""}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              {detalle?.tipo === "ventas"
                ? `Cada venta cerrada en ${ROTULO_RANGO[rango]}, con el precio que tenía el plan ese día.`
                : detalle?.tipo === "espera"
                  ? "Tienen un ticket abierto y nadie del equipo les respondió. El que más espera va primero — toca una para abrirla."
                  : detalle?.tipo === "tiempo"
                    ? `Cada caso que el agente resolvió solo son minutos que un operador no tuvo que poner, en ${ROTULO_RANGO[rango]}.`
                    : `Conversaciones sobre este motivo en ${ROTULO_RANGO[rango]}.`}
            </DialogDescription>
            <DialogDescription className="text-[11.5px]">
              {/*
                La tarjeta cuenta con `ventas_resumen` y esta lista sale de los
                tickets que tienen precio guardado. Cuando no coinciden hay ventas
                sin precio, y eso hay que decirlo: si no, el que compara los dos
                números concluye que uno de los dos miente.
              */}
              {detalle?.tipo === "ventas" && filasDetalle && filasDetalle.length < ventasResumidas.cantidad && (
                <span className="text-amber-500">
                  El resumen cuenta {nf(ventasResumidas.cantidad)}; acá se listan{" "}
                  {nf(filasDetalle.length)}. Las {nf(ventasResumidas.cantidad - filasDetalle.length)} que
                  faltan no tienen el precio guardado en el ticket, así que se cuentan pero no suman.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1">
            {detalle?.tipo === "tiempo" ? (
              <DetalleTiempo resumen={resumen} valorHora={valorHora} />
            ) : filasDetalle === null ? (
              <Espera alto={180} />
            ) : filasDetalle.length === 0 ? (
              detalle?.tipo === "ventas" ? (
                /* El contador y el detalle no coinciden: eso es un dato, no un vacío. */
                <div className="py-8 px-4 text-center space-y-2">
                  <p className="text-[12.5px] font-semibold text-amber-500">
                    El resumen cuenta {nf(ventasResumidas.cantidad)}, pero ninguna tiene el precio guardado.
                  </p>
                  <p className="text-[11.5px] text-muted-foreground/60 leading-relaxed">
                    El precio se copia al ticket cuando se cierra la venta. Sin ese dato
                    se puede contar cuántas hubo, pero no cuánto sumaron.
                  </p>
                </div>
              ) : detalle?.tipo === "espera" ? (
                <Vacio texto="Ningún ticket abierto está esperando respuesta." alto={180} />
              ) : (
                <Vacio texto="No hay conversaciones analizadas con este motivo en el período" alto={180} />
              )
            ) : detalle?.tipo === "espera" ? (
              <div className="space-y-2">
                {(filasDetalle as EsperaCliente[]).map(f => (
                  <button
                    key={f.conversation_id}
                    onClick={() => { setDetalle(null); onConversationClick?.(f.conversation_id); }}
                    className="w-full text-left rounded-xl border border-border/20 bg-background/40 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-[12.5px] font-bold truncate">
                        {f.profile_name || f.wa_id || "Sin nombre"}
                      </span>
                      {/* El tiempo de espera es el orden de atención: se pinta como
                          gravedad, no como fecha. */}
                      <span className={`text-[11px] font-black tabular-nums flex-shrink-0 px-1.5 py-0.5 rounded ${
                        f.horas_esperando >= 168 ? "bg-red-500/15 text-red-500"
                          : f.horas_esperando >= 48 ? "bg-amber-500/15 text-amber-500"
                          : "bg-muted/50 text-muted-foreground/70"}`}>
                        {espera(f.horas_esperando)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {f.wa_id && f.profile_name && (
                        <span className="text-[10.5px] text-muted-foreground/50 tabular-nums">{f.wa_id}</span>
                      )}
                      {f.topic && (
                        <span className="text-[10px] px-1.5 py-px rounded bg-primary/12 text-primary capitalize">
                          {f.topic.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-muted-foreground/75 leading-relaxed line-clamp-2">
                      {f.summary || "Sin resumen"}
                    </p>
                  </button>
                ))}
              </div>
            ) : detalle?.tipo === "ventas" ? (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/45 text-left">
                    <th className="font-bold pb-2">Cliente</th>
                    <th className="font-bold pb-2">RUT</th>
                    <th className="font-bold pb-2">Fecha</th>
                    <th className="font-bold pb-2 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/15">
                  {filasDetalle.map((f: any) => (
                    <tr key={f.id}>
                      <td className="py-2 pr-3 truncate max-w-[220px]">{f.customer_name || "Sin nombre"}</td>
                      <td className="py-2 pr-3 text-muted-foreground/60 tabular-nums whitespace-nowrap">
                        {f.customer_rut || "—"}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground/60 whitespace-nowrap">
                        {new Date(f.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="py-2 text-right tabular-nums font-semibold whitespace-nowrap">
                        {clp(Number(f.plan_precio) || 0)}
                        {f.plan_fue_oferta && (
                          <span className="ml-1.5 text-[9px] font-black uppercase text-emerald-500">oferta</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/30">
                    <td className="pt-2 font-bold" colSpan={3}>{filasDetalle.length} ventas</td>
                    <td className="pt-2 text-right font-black tabular-nums">
                      {clp(filasDetalle.reduce((a: number, f: any) => a + (Number(f.plan_precio) || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <div className="space-y-2">
                {filasDetalle.map((f: any) => (
                  <div key={f.id} className="rounded-xl border border-border/20 bg-background/40 px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      {f.bot_score != null && (
                        <span className={`text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded ${
                          f.bot_score >= 8 ? "bg-emerald-500/15 text-emerald-500"
                            : f.bot_score >= 6 ? "bg-amber-500/15 text-amber-500"
                            : "bg-red-500/15 text-red-500"}`}>
                          {f.bot_score}/10
                        </span>
                      )}
                      <span className="text-[10.5px] text-muted-foreground/50">
                        {f.session_start
                          ? new Date(f.session_start).toLocaleDateString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                          : ""}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted-foreground/85 leading-relaxed">
                      {f.summary || "Sin resumen"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Piezas ───────────────────────────────────────────────────────────────────

/**
 * Un número de la fila de arriba.
 *
 * Dos decisiones que vale la pena dejar escritas, porque las dos son quitar cosas:
 *
 * 1. No hay minigráfico. Lo había, y dibujaba la misma serie que el gráfico grande
 *    de más abajo — pero sin ejes, sin escala y sin rótulo, o sea la misma
 *    información peor contada. Sacarlo achica la fila entera y no se pierde nada.
 *
 * 2. "Toca para ver el detalle" va pegado al fondo con `mt-auto`. Antes flotaba
 *    justo debajo del pie de cada tarjeta, y como los pies miden distinto, la
 *    misma frase aparecía a tres alturas distintas en la misma fila.
 */
interface Delta { texto: string; subio: boolean; bueno: boolean | null }

/** Una variación lista para pintar: verde si la cifra mejoró, rojo si empeoró, gris si es neutra. */
function mkDelta(v: number, unidad: string, sube: "bueno" | "neutro"): Delta {
  const redondo = Math.round(Math.abs(v));
  const signo = v > 0 ? "+" : v < 0 ? "−" : "";
  return {
    texto: `${signo}${redondo}${unidad}`,
    subio: v > 0,
    bueno: v === 0 || sube === "neutro" ? null : v > 0,
  };
}

function Tile({ icon: Icon, tono, fondo = "bg-muted", rotulo, valor, pie, alTocar, delta, hub }: {
  icon: React.ElementType; tono: string; fondo?: string; rotulo: string;
  valor: string | null; pie: string;
  /** Si se puede abrir el detrás del número. */
  alTocar?: () => void;
  /** Cuánto cambió contra el período anterior. */
  delta?: Delta;
  /** Si la tarjeta abre un panel con más información al mantener el cursor encima. */
  hub?: { abierto: boolean; alAbrir: () => void; alEntrar?: () => void; innerRef: React.RefObject<HTMLDivElement> };
}) {
  const { encima, manejadores } = useHoverAbre(hub?.alAbrir ?? (() => undefined), hub?.abierto ?? false, hub?.alEntrar);
  const esHub = !!hub;
  const Contenedor: any = !esHub && alTocar ? "button" : "div";
  const propsHub = esHub ? {
    ref: hub!.innerRef, role: "button", tabIndex: 0,
    "aria-label": `${rotulo}. Abrir el detalle`,
    ...manejadores,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hub!.alAbrir(); } },
  } : { onClick: alTocar };
  return (
    <Contenedor
      {...propsHub}
      className={`relative overflow-hidden rounded-2xl border border-border/40 bg-card px-5 py-4 flex flex-col text-left transition-shadow ${
        esHub || alTocar ? "cursor-pointer hover:shadow-[0_14px_34px_-12px_rgba(20,60,160,0.28)]" : ""} ${
        esHub ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${fondo}`}>
          <Icon className={`w-5 h-5 ${tono}`} />
        </span>
        <span className="text-[13px] font-medium text-muted-foreground leading-tight">{rotulo}</span>
      </div>
      {valor === null ? (
        <div className="h-12 flex items-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/25" />
        </div>
      ) : (
        <div className="mt-3 flex items-baseline gap-2 flex-wrap">
          <p className="text-[32px] leading-none font-extrabold tabular-nums tracking-tight">{valor}</p>
          {delta && (
            <span className={`inline-flex items-center gap-0.5 text-[12px] font-bold ${
              delta.bueno === null ? "text-muted-foreground"
              : delta.bueno ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {delta.texto !== "0%" && delta.texto !== "0 pts" && (delta.subio ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
              {delta.texto}
            </span>
          )}
        </div>
      )}
      {delta && <p className="text-[10.5px] text-muted-foreground/60 mt-1 leading-none">vs. período anterior</p>}
      <p className="text-[11.5px] text-muted-foreground mt-1.5 leading-snug">{pie}</p>
      {esHub ? (
        <>
          <span className="text-[11px] text-muted-foreground/70 mt-auto pt-2.5">
            {encima ? "Mantén el cursor… se abre en 1 s" : "Más detalle"}
          </span>
          <div className="absolute left-0 right-0 bottom-0 h-[3px]">
            <motion.div className="h-full bg-primary origin-left" initial={false}
              animate={{ scaleX: encima ? 1 : 0 }}
              transition={encima ? { duration: ESPERA_HOVER_MS / 1000, ease: "linear" } : { duration: 0.2 }} />
          </div>
        </>
      ) : alTocar && (
        <span className="text-[10.5px] text-muted-foreground/50 mt-auto pt-2">Toca para ver el detalle</span>
      )}
    </Contenedor>
  );
}

/**
 * Cuánto espera el cliente hasta que alguien le contesta.
 *
 * El argumento NO es el mismo para todas las empresas y por eso la frase se
 * arma con los datos de cada una: donde el equipo humano tarda 39 minutos, lo
 * que vende es la velocidad; donde contesta en 3, lo que vende es que el agente
 * está a las 3 de la mañana. Una frase fija para las dos se la desarma el
 * primero que la revise.
 */
function ExperienciaCliente({ exp, peak }: { exp: Experiencia; peak: Peak | null }) {
  const agente = Number(exp.agente_mediana_min) || 0;
  const humano = exp.humano_mediana_min != null ? Number(exp.humano_mediana_min) : null;
  const esVelocidad = humano != null && humano >= 10;
  const veces = humano && agente > 0 ? Math.round(humano / agente) : null;
  // El promedio de simultáneas solo vale con muestra suficiente: si los mensajes
  // van firmados con el nombre de la empresa, la RPC mide sobre una ventana.
  const concurrenciaFiable = (peak?.operador_ventanas ?? 0) >= MIN_VENTANAS_OPERADOR;

  return (
    <div className="rounded-2xl border border-border/25 bg-card/40 p-4">
      <div className="mb-3">
        <h3 className="text-[13px] font-bold">Lo que espera tu cliente</h3>
        <p className="text-[10.5px] text-muted-foreground/50 mt-0.5">
          Tiempo hasta la primera respuesta, según quién contesta
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500">Con el agente</p>
          <p className="text-[30px] leading-none font-black tabular-nums mt-1 text-emerald-500">
            {duracion(agente)}
          </p>
          <p className="text-[10.5px] text-muted-foreground/55 mt-1.5">
            {nf(exp.agente_n)} respuestas · 9 de cada 10 en {duracion(exp.agente_p90_min)}
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-amber-500">Con una persona</p>
          <p className="text-[30px] leading-none font-black tabular-nums mt-1">
            {duracion(humano)}
          </p>
          {/* El p90 es el dato incómodo y por eso va escrito: es el cliente que
              se queda esperando y del que nadie se entera. */}
          <p className="text-[10.5px] text-muted-foreground/55 mt-1.5">
            {nf(exp.humano_n)} respuestas · 1 de cada 10 espera {duracion(exp.humano_p90_min)}
          </p>
        </div>

        <div className="rounded-xl border border-primary/25 bg-primary/[0.07] px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-primary">Peak atendido</p>
          <p className="text-[30px] leading-none font-black tabular-nums mt-1">
            {nf(peak?.peak_5min ?? 0)}
          </p>
          <p className="text-[10.5px] text-muted-foreground/55 mt-1.5">
            conversaciones a la vez, sin esperas
            {concurrenciaFiable && peak?.operador_simultaneas_media
              ? ` · un operador lleva ${peak.operador_simultaneas_media} en paralelo`
              : ""}
          </p>
        </div>
      </div>

      <p className="text-[11.5px] text-muted-foreground/70 mt-3 leading-relaxed">
        {esVelocidad ? (
          <>
            El agente contesta en <strong className="text-foreground">{duracion(agente)}</strong>
            {veces && veces > 1 ? <>, {veces} veces más rápido que una persona</> : null}. Y cuando
            responde alguien del equipo, uno de cada diez clientes espera{" "}
            <strong className="text-foreground">{duracion(exp.humano_p90_min)}</strong>.
          </>
        ) : (
          <>
            Tu equipo contesta rápido —<strong className="text-foreground">{duracion(humano)}</strong>—
            así que acá el agente no gana en velocidad: gana en que contesta en{" "}
            <strong className="text-foreground">{duracion(agente)}</strong> a cualquier hora, también
            de noche y el fin de semana.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * El desglose del tiempo ahorrado.
 *
 * Existe porque un número de horas sin origen no se puede defender. Acá se ve
 * cuántos casos de cada tipo entraron, cuántos minutos vale cada uno y cuánto
 * suma — y cuánto de eso son casos que igual pasaron a un operador, donde solo
 * se ahorra el trabajo previo.
 */
function DetalleTiempo({ resumen, valorHora }: { resumen: Resumen | null; valorHora: number }) {
  if (!resumen?.time_saved_hours) {
    return <Vacio texto="Sin tiempo ahorrado registrado en el período" alto={180} />;
  }
  const desglose = Object.entries(resumen.time_saved_desglose ?? {});
  const autonomas = resumen.time_saved_autonomas_hours;
  const triage = resumen.time_saved_triage_hours;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.07] px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-violet-500">Horas</p>
          <p className="text-[22px] font-black tabular-nums leading-tight mt-0.5">
            {nf(Math.round(resumen.time_saved_hours))} h
          </p>
        </div>
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500">En dinero</p>
          <p className="text-[22px] font-black tabular-nums leading-tight mt-0.5 text-emerald-500">
            {clp(Math.round(resumen.time_saved_hours * valorHora))}
          </p>
          <p className="text-[10px] text-muted-foreground/55 mt-0.5">
            a {clp(valorHora)} la hora de operador
          </p>
        </div>
      </div>

      {desglose.length > 0 ? (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/45 text-left">
              <th className="font-bold pb-2">Tipo de caso</th>
              <th className="font-bold pb-2 text-right">Casos</th>
              <th className="font-bold pb-2 text-right">Min. c/u</th>
              <th className="font-bold pb-2 text-right">Horas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/15">
            {desglose.map(([cat, d]) => (
              <tr key={cat}>
                <td className="py-2 pr-3">{ETIQUETA_CATEGORIA[cat] ?? cat}</td>
                <td className="py-2 text-right tabular-nums">{nf(d.conversaciones)}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground/60">{d.minutos_por_caso}</td>
                <td className="py-2 text-right tabular-nums font-semibold">{(d.minutos / 60).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[11.5px] text-muted-foreground/50">
          El desglose por tipo de caso todavía no viene en los datos.
        </p>
      )}

      {(autonomas != null || triage != null) && (
        <div className="rounded-xl border border-border/20 bg-background/40 px-3 py-2.5 text-[11.5px] space-y-1">
          {autonomas != null && (
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground/70">Casos que resolvió el agente entero</span>
              <span className="font-semibold tabular-nums">{autonomas} h</span>
            </p>
          )}
          {triage != null && (
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground/70">
                Casos que pasaron a un operador, ya con el trabajo previo hecho
                {resumen.triage_pct != null && ` (${resumen.triage_pct}% del caso)`}
              </span>
              <span className="font-semibold tabular-nums">{triage} h</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Panel({ titulo, nota, children, className = "" }: {
  titulo: string; nota?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border/25 bg-card/40 p-4 flex flex-col ${className}`}>
      <div className="mb-3">
        <h3 className="text-[13px] font-bold">{titulo}</h3>
        {nota && <p className="text-[10.5px] text-muted-foreground/50 mt-0.5">{nota}</p>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

/**
 * Tooltip del gráfico apilado.
 *
 * En un apilado la línea de arriba está dibujada a la altura de la SUMA, no del
 * valor de su serie: un día con 41 resueltas y 17 derivadas pone esa línea en 58.
 * Recharts entrega los valores correctos, pero el ojo lee la altura, así que acá
 * se escribe el total además del reparto — si no, "pasaron a un operador" parece
 * tres veces más grande de lo que es.
 */
function TooltipVolumen({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const valor = (k: string) => Number(payload.find((p: any) => p.dataKey === k)?.value) || 0;
  const resueltas = valor("resueltas");
  const derivadas = valor("derivadas");
  const soloTotal = payload.length === 1 && payload[0].dataKey === "total";
  const total = soloTotal ? Number(payload[0].value) || 0 : resueltas + derivadas;
  return (
    <div className="rounded-xl border border-border/40 bg-card/95 backdrop-blur px-3 py-2 shadow-xl text-[12px]">
      <p className="text-muted-foreground/60 mb-1.5">{label}</p>
      {!soloTotal && (
        <>
          <p className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: "hsl(160 70% 45%)" }} />
              Resueltas por el agente
            </span>
            <span className="font-bold tabular-nums">{resueltas}</span>
          </p>
          <p className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: "hsl(38 92% 55%)" }} />
              Pasaron a un operador
            </span>
            <span className="font-bold tabular-nums">{derivadas}</span>
          </p>
        </>
      )}
      <p className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t border-border/30">
        <span className="text-muted-foreground/70">Total del día</span>
        <span className="font-black tabular-nums">{total}</span>
      </p>
    </div>
  );
}

/**
 * Saldo de mensajes: cuánto queda en la cuenta con la que salen los mensajes por
 * el canal oficial.
 *
 * No dice quién es el proveedor a propósito. El ISP no tiene por qué saber con qué
 * BSP prestamos el servicio, y nombrarlo solo invita a preguntas que no llevan a
 * ninguna parte: no puede recargarlo él, es una cuenta nuestra.
 *
 * Se refresca solo cada 10 minutos. El saldo no se mueve tan rápido y llamar a la
 * API del proveedor en cada render no aporta nada.
 */
/**
 * Meta empieza a cobrar los mensajes de servicio el 1 de octubre de 2026.
 *
 * Hasta esa fecha, todo lo que la IA o un operador responden dentro de la ventana
 * de 24 horas es gratis: no son plantillas. Desde el 1 de octubre se cobran a la
 * misma tarifa que utilidad y autenticación, y sin tramos de volumen.
 *
 * Junto con el cobro, Meta abre una franquicia mensual: los primeros mil mensajes
 * de servicio de cada mes no se cobran. No está en el rate card vigente porque
 * hoy los mensajes de servicio son gratis igual; aparece recién con el cambio.
 */
const COBRO_SERVICIO_DESDE = new Date("2026-10-01T00:00:00-03:00");


type Nivel = "diario" | "semanal" | "mensual";

/**
 * Cuanto lleva la empresa de su plan.
 *
 * Sin un solo numero de dinero, y no por pudor: el costo de los modelos es
 * informacion nuestra. La RPC `get_uso_plan` tampoco devuelve costo, asi que
 * aunque alguien mire la pestana de red del navegador no hay nada que ver.
 *
 * El tope puede venir en null y eso NO es un error: hoy ninguna empresa tiene uno
 * fijado. Igual se dibuja una barra, pero midiendo otra cosa: cuanto del ciclo va
 * corrido. Un numero solo no dice nada -- 2.419 puede ser mucho o poco segun si
 * van tres dias o veintiocho.
 */
/** Ventana del minigrafico de la tarjeta del agente. */
const DIAS_MINIGRAFICO = 30;

function PlanIA({ companyId }: { companyId: string | null }) {
  const [plan, setPlan] = useState<UsoPlan | null>(null);
  const [diario, setDiario] = useState<PuntoUsoDiario[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelado = false;
    setCargando(true);
    const hoy = new Date();
    // El primero del mes en curso: la RPC agrupa por ciclo y devuelve sus fechas.
    const mes = inicioMesChile(hoy);
    Promise.all([
      usoPlan(companyId, mes),
      usoPlanDiario(companyId, DIAS_MINIGRAFICO),
    ]).then(([p, d]) => {
      if (cancelado) return;
      setPlan(p);
      setDiario(d);
      setCargando(false);
    });
    return () => { cancelado = true; };
  }, [companyId]);

  if (cargando) {
    return (
      <div className="rounded-2xl border border-border/25 bg-card/40 p-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/25" />
      </div>
    );
  }
  if (!plan) return null;

  const usados = Number(plan.mensajes_ia_usados) || 0;
  const tope = plan.tope != null ? Number(plan.tope) : null;

  /*
   * Los dias del ciclo se calculan aca, con las fechas que devolvio la RPC.
   *
   * Pedi que la RPC devolviera `ciclo_fin` y no "dias restantes" justamente por
   * esto: si el servidor calcula 12 dias y la pantalla queda abierta tres horas,
   * el numero ya es otro. Con la fecha hay una sola fuente de verdad.
   *
   * Los corridos salen de restar los restantes, no de una cuenta propia: asi los
   * dos numeros suman el ciclo siempre, sin un dia de mas por redondeo.
   */
  const inicio = new Date(plan.ciclo_inicio + "T00:00:00");
  const fin = new Date(plan.ciclo_fin + "T23:59:59");
  const diasTotales = Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / 86400000));
  const diasRestantes = Math.max(0, Math.ceil((fin.getTime() - Date.now()) / 86400000));
  const diasCorridos = Math.min(diasTotales, Math.max(1, diasTotales - diasRestantes));

  const pctTiempo = Math.min(100, (diasCorridos / diasTotales) * 100);
  const pctUso = tope && tope > 0 ? Math.min(100, (usados / tope) * 100) : null;

  // Proyeccion al cierre. Con un solo dia corrido no es una tendencia, es un dato
  // suelto multiplicado por treinta, asi que no se muestra.
  const ritmo = usados / diasCorridos;
  const proyeccion = Math.round(ritmo * diasTotales);
  const hayRitmo = diasCorridos >= 2 && usados > 0;
  // Va mas rapido que el calendario: con tope, terminaria pasandose.
  const adelantado = pctUso != null && pctUso - pctTiempo >= 10;

  /*
   * La RPC no dice desde cuando hay registro, asi que se mira donde arranca la
   * serie. Por eso la tarjeta habla del grafico —"arranca el 6 de septiembre"— y
   * no de la base: un primer dia mas tarde de lo pedido puede ser que el registro
   * empezo ahi, y tambien puede ser que ese dia fue el primero con movimiento.
   * Decir lo que se ve es cierto en los dos casos.
   */
  const primerDia = diario.length ? String(diario[0].dia) : null;
  const ventanaCompleta = primerDia
    ? new Date(primerDia + "T12:00:00").getTime() <= Date.now() - (DIAS_MINIGRAFICO - 1) * 86400000
    : true;
  const promedio = diario.length
    ? diario.reduce((a, d) => a + (Number(d.mensajes_ia) || 0), 0) / diario.length
    : 0;

  const fecha = (valor: string) =>
    new Date(valor + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" });

  return (
    <div className="rounded-2xl border border-border/25 bg-card/40 p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Bot className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55">
          Mensajes del agente
        </span>
      </div>

      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-[25px] leading-none font-black tabular-nums">{nf(usados)}</p>
        <p className="text-[10.5px] text-muted-foreground/55">
          {tope != null ? `de ${nf(tope)} de tu plan` : "este ciclo"}
        </p>
      </div>

      {/*
       * La barra se dibuja siempre. Con tope mide el consumo y lleva una marca en
       * el punto del calendario: si el relleno pasa la marca, el mes va a cerrar
       * arriba del plan y se ve sin leer ningun numero. Sin tope mide el tiempo,
       * que es informacion util igual y no necesita techo.
       */}
      <div className="relative mt-3">
        <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              pctUso == null
                ? "bg-primary/45"
                : pctUso >= 100 ? "bg-rose-500" : pctUso >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${pctUso ?? pctTiempo}%` }}
          />
        </div>
        {pctUso != null && (
          <div
            className="absolute top-[-3px] w-[2px] h-[14px] rounded-full bg-foreground/40"
            style={{ left: `calc(${pctTiempo}% - 1px)` }}
            title="Donde iria el consumo si fuera parejo todo el ciclo"
          />
        )}
      </div>

      <p className="text-[10.5px] text-muted-foreground/55 mt-2 leading-relaxed">
        {pctUso != null ? (
          <>
            {Math.round(pctUso)}% del plan con {Math.round(pctTiempo)}% del ciclo corrido
            {adelantado && <span className="text-amber-500 font-semibold"> · va adelantado</span>}
          </>
        ) : (
          <>{diasCorridos} de {diasTotales} días del ciclo{diasRestantes > 0 && ` · quedan ${diasRestantes}`}</>
        )}
      </p>

      <p className="text-[10.5px] text-muted-foreground/45 mt-1 leading-relaxed">
        Del {fecha(plan.ciclo_inicio)} al {fecha(plan.ciclo_fin)}
        {hayRitmo && ` · a este ritmo cierra en ${nf(proyeccion)}`}
      </p>

      {/* Los ultimos 30 dias */}
      {diario.length > 1 && (
        <div className="mt-3 pt-3 border-t border-border/20">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/45">
              Últimos 30 días
            </span>
            <span className="text-[10.5px] text-muted-foreground/55 tabular-nums">
              {nf(Math.round(promedio))} por día
            </span>
          </div>
          <ResponsiveContainer width="100%" height={48}>
            <AreaChart data={diario} margin={{ top: 3, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="planIaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              {/*
               * El eje va oculto pero tiene que existir.
               *
               * Sin un XAxis con `dataKey`, recharts usa el indice del arreglo como
               * etiqueta del globo: llegaba "5" en vez de "2026-08-30" y
               * `new Date("5T12:00:00")` daba Invalid Date. El dato nunca estuvo mal
               * —el numero de mensajes salia bien al lado— y por eso costo verlo.
               */}
              <XAxis dataKey="dia" hide />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
                  borderRadius: 10, fontSize: 11, padding: "4px 8px",
                }}
                labelFormatter={(v: any) => fecha(String(v))}
                formatter={(v: any) => [`${nf(Number(v))} mensajes`, ""]}
              />
              <Area type="monotone" dataKey="mensajes_ia" stroke="hsl(var(--primary))"
                strokeWidth={1.5} fill="url(#planIaFill)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          {/*
           * Si el registro arranco hace poco, el grafico cubre menos de 30 dias. Se
           * dice con una linea en vez de estirar el eje con ceros que no existieron.
           */}
          {!ventanaCompleta && primerDia && (
            <p className="text-[10px] text-muted-foreground/45 mt-1 leading-relaxed">
              El gráfico arranca el {fecha(primerDia)}: todavía no cubre los {DIAS_MINIGRAFICO} días completos.
            </p>
          )}
        </div>
      )}

      {/* Solo cuenta lo que mando la IA. Lo que escriben los operadores no entra. */}
      <p className="text-[10px] text-muted-foreground/40 mt-2 leading-relaxed">
        Cuenta solo los mensajes que envió el agente. Los que escriben los operadores
        no consumen plan.
      </p>
    </div>
  );
}

function SaldoMensajes({ companyId, companyName }: { companyId: string | null; companyName?: string | null }) {
  const [saldo, setSaldo] = useState<{ amount: number; currency: string } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [dias, setDias] = useState<FilaMetrica[]>([]);
  const [costoMensaje, setCostoMensaje] = useState<number | null>(null);
  const [nivel, setNivel] = useState<Nivel | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelado = false;
    const cargar = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-ycloud-balance", {
          body: { companyId },
        });
        if (!cancelado && !error && data && typeof data.amount === "number") {
          setSaldo({ amount: data.amount, currency: data.currency || "USD" });
        }
      } catch {
        // Que no se pueda leer el saldo no puede tumbar el panel entero.
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    cargar();
    const t = setInterval(cargar, 10 * 60 * 1000);
    return () => { cancelado = true; clearInterval(t); };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let cancelado = false;
    // Un año de historia: alcanza para la vista mensual y sigue siendo una consulta.
    metricasCanal(companyId, iso(new Date(Date.now() - 370 * 86400000)), iso(new Date())).then(r => { if (!cancelado) setDias(r); });
    /*
     * El precio por mensaje lo carga el equipo en `company_config`. No va fijo en el
     * código: cambia por país y por acuerdo, y un número quemado acá se vuelve
     * mentira sin que nadie se entere.
     */
    (supabase as any)
      .from("company_config").select("costo_mensaje_oficial").eq("id", companyId).maybeSingle()
      .then(({ data }: any) => {
        if (!cancelado) {
          const v = Number(data?.costo_mensaje_oficial);
          setCostoMensaje(isNaN(v) || v <= 0 ? null : v);
        }
      });
    return () => { cancelado = true; };
  }, [companyId]);

  const mes = useMemo(() => {
    const desde = inicioMesChile();
    const filas = dias.filter(d => String(d.dia) >= desde);
    const oficial = filas.reduce((a, d) => a + (Number(d.oficial) || 0), 0);
    const sinCosto = filas.reduce((a, d) => a + (Number(d.sin_costo) || 0), 0);
    return { oficial, sinCosto };
  }, [dias]);

  /*
   * La barra se pinta desde ya, a pedido: las empresas están avisadas del cambio y
   * la idea es que lleguen al 1 de octubre acostumbradas a mirarla, no descubriéndola.
   *
   * Lo que `vigente` sigue decidiendo es el tiempo verbal del dinero. Antes de la
   * fecha el excedente "costaría"; después "cuesta". Es la única diferencia que
   * queda, y es la que no se puede borrar sin mentir: hoy no se cobra ninguno.
   */
  const vigente = Date.now() >= COBRO_SERVICIO_DESDE.getTime();
  const consumo = Math.min(1, mes.oficial / FRANQUICIA_SERVICIO);
  const excedente = Math.max(0, mes.oficial - FRANQUICIA_SERVICIO);

  const nf = (n: number) => n.toLocaleString("es-CL");

  const tono =
    saldo == null ? { texto: "text-muted-foreground", borde: "border-border/25 bg-card/40", icono: "text-muted-foreground/50" }
    : saldo.amount <= UMBRAL_ROJO ? { texto: "text-red-500", borde: "border-red-500/30 bg-red-500/[0.07]", icono: "text-red-500" }
    : saldo.amount <= UMBRAL_AMARILLO ? { texto: "text-amber-500", borde: "border-amber-500/30 bg-amber-500/[0.06]", icono: "text-amber-500" }
    : { texto: "text-emerald-500", borde: "border-border/25 bg-card/40", icono: "text-emerald-500" };

  return (
    <div className={`rounded-2xl border p-4 ${tono.borde}`}>
      <div className="flex items-center gap-2 mb-2">
        <DollarSign className={`w-4 h-4 ${tono.icono}`} />
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Saldo Mensajes
        </span>
      </div>

      {cargando && !saldo ? (
        <div className="h-[46px] flex items-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/30" />
        </div>
      ) : saldo ? (
        <>
          <p className={`text-[30px] leading-none font-black tabular-nums ${tono.texto}`}>
            {new Intl.NumberFormat("en-US", { style: "currency", currency: saldo.currency }).format(saldo.amount)}
            {/* La moneda escrita: "$109.00" a secas se lee como pesos. */}
            <span className="ml-1.5 text-[13px] font-bold tracking-wide text-muted-foreground/60">{saldo.currency}</span>
          </p>
          <p className="text-[10.5px] text-muted-foreground/50 mt-1.5">
            Se actualiza cada 10 minutos
          </p>
          {saldo.amount <= UMBRAL_AMARILLO && (
            <p className={`text-[11px] font-medium mt-2 leading-relaxed ${tono.texto}`}>
              {saldo.amount <= UMBRAL_ROJO
                ? "Queda poco. Cuando se acabe deja de salir cualquier mensaje por el canal oficial."
                : "Conviene recargar en los próximos días."}
            </p>
          )}
        </>
      ) : (
        /* Sin saldo no es cero: es que no se pudo leer, y decirlo evita que alguien
           crea que se quedó sin plata. */
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-muted-foreground/70 leading-relaxed">
            No se pudo leer el saldo. El servicio del proveedor no respondió.
          </p>
        </div>
      )}

      {/* Cuánto son esos dólares en pesos, y cómo cargar. Va pegado al número
          del saldo porque es donde aparece la pregunta "¿cuánto pongo?". */}
      <CargarSaldo empresa={companyName ?? undefined} />

      {/* ── Mensajes del mes ── */}
      {dias.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/15">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55">
            Mensajes de este mes
          </span>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <p className="text-[17px] font-black tabular-nums leading-tight">{nf(mes.oficial)}</p>
              <p className="text-[10px] text-muted-foreground/55">por la API oficial</p>
            </div>
            <div>
              <p className="text-[17px] font-black tabular-nums leading-tight text-emerald-500">{nf(mes.sinCosto)}</p>
              <p className="text-[10px] text-muted-foreground/55">por el canal sin costo</p>
            </div>
          </div>
          {costoMensaje != null && (
            <p className="text-[10.5px] text-muted-foreground/60 mt-2 leading-relaxed">
              A {clp(costoMensaje)} por mensaje oficial:{" "}
              <strong className="text-foreground">{clp(mes.oficial * costoMensaje)}</strong> si se
              cobraran todos.
            </p>
          )}
          {/*
           * La franquicia de mil.
           *
           * Antes del 1 de octubre la barra igual se muestra, en gris y rotulada como
           * simulación: el mes que viene esto empieza a costar plata y conviene llegar
           * sabiendo en qué parte de la barra está la empresa, no enterarse ese día.
           * Después de la fecha se pinta y pasa a ser el número real.
           *
           * El denominador tiene una trampa que hay que decir en voz alta: la franquicia
           * cubre solo los mensajes de categoría servicio, y `metricas_canal` devuelve
           * todos los oficiales sin separar categoría. Así que mientras el backend no
           * entregue ese desglose, `mes.oficial` es una COTA SUPERIOR — el consumo real
           * de la franquicia es este número o menos, nunca más. Se rotula como tal para
           * que nadie lo lea como exacto.
           */}
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55">
                Franquicia de servicio
              </span>
              <span className="text-[10.5px] tabular-nums text-muted-foreground/70">
                hasta {nf(Math.min(mes.oficial, FRANQUICIA_SERVICIO))} de {nf(FRANQUICIA_SERVICIO)}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted/50 overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  consumo >= 1 ? "bg-rose-500"
                    : consumo >= 0.8 ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, consumo * 100)}%` }}
              />
            </div>
            <p className="text-[10.5px] text-muted-foreground/60 mt-1.5 leading-relaxed">
              Cota superior: son todos los mensajes oficiales del mes. La franquicia cubre
              solo los de servicio, y todavía no los distinguimos, así que el consumo real
              es este o menor.
            </p>
            {excedente > 0 && costoMensaje != null && (
              <p className={`text-[10.5px] mt-1.5 leading-relaxed ${vigente ? "text-rose-500/90" : "text-amber-500/85"}`}>
                Franquicia superada por {nf(excedente)} mensajes:{" "}
                <strong>{clp(excedente * costoMensaje)}</strong>
                {vigente ? "." : " al mes cuando empiece a regir."}
              </p>
            )}
            {!vigente && (
              <p className="text-[10.5px] text-muted-foreground/60 mt-1.5 leading-relaxed">
                Rige desde el 1 de octubre de 2026: Meta empieza a cobrar los mensajes de
                servicio y regala los primeros {nf(FRANQUICIA_SERVICIO)} de cada mes, por número
                de teléfono. Hasta esa fecha no se cobra ninguno — la barra está para ir
                mirándola.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Historial ── */}
      {dias.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/15">
          <div className="flex items-center gap-1.5">
            {(["diario", "semanal", "mensual"] as Nivel[]).map(n => (
              <button
                key={n}
                onClick={() => setNivel(v => (v === n ? null : n))}
                className={`text-[10.5px] font-semibold px-2 py-1 rounded-lg border transition-colors ${
                  nivel === n
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border/25 text-muted-foreground/70 hover:bg-muted/40"
                }`}
              >
                {n === "diario" ? "30 días" : n === "semanal" ? "Semanas" : "Meses"}
              </button>
            ))}
          </div>
          {nivel && <Historial dias={dias} nivel={nivel} costoMensaje={costoMensaje} />}
        </div>
      )}
    </div>
  );
}

/**
 * Historial de mensajería agrupado.
 *
 * Los días vienen ya cortados por la base en hora de Chile, así que sumarlos en
 * semanas o meses no reintroduce el problema de zona horaria: el riesgo estaba en
 * derivar el día desde un timestamp, y eso ya está resuelto aguas arriba.
 *
 * Lo que no se puede mostrar es el saldo al cierre de cada período: el proveedor
 * entrega el saldo de ahora y nadie guarda una foto diaria. Poner el saldo actual
 * en una fila de hace tres semanas sería inventar el dato.
 */
function Historial({ dias, nivel, costoMensaje }: {
  dias: FilaMetrica[]; nivel: Nivel; costoMensaje: number | null;
}) {
  const filas = useMemo(() => {
    const clave = (dia: string) => {
      if (nivel === "mensual") return dia.slice(0, 7);
      if (nivel === "diario") return dia;
      // Semana ISO simplificada: se etiqueta por el lunes que la abre.
      const d = new Date(dia + "T12:00:00");
      const lunes = new Date(d);
      lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return lunes.toISOString().slice(0, 10);
    };
    const grupos = new Map<string, { oficial: number; sinCosto: number; costo: number }>();
    for (const d of dias) {
      const k = clave(String(d.dia));
      const g = grupos.get(k) ?? { oficial: 0, sinCosto: 0, costo: 0 };
      g.oficial += Number(d.oficial) || 0;
      g.sinCosto += Number(d.sin_costo) || 0;
      g.costo += Number(d.costo_estimado) || 0;
      grupos.set(k, g);
    }
    const tope = nivel === "diario" ? 30 : nivel === "semanal" ? 12 : 24;
    return Array.from(grupos.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, tope)
      .map(([k, g]) => ({ k, ...g }));
  }, [dias, nivel]);

  const etiqueta = (k: string) => {
    if (nivel === "mensual") {
      const [a, m] = k.split("-");
      const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
      return `${nombres[Number(m) - 1] ?? m} ${a}`;
    }
    const [, m, d] = k.split("-");
    return nivel === "semanal" ? `sem. ${d}/${m}` : `${d}/${m}`;
  };

  if (filas.length === 0) {
    return <p className="text-[10.5px] text-muted-foreground/45 mt-2.5">Sin mensajes en el período.</p>;
  }

  return (
    <div className="mt-2.5 max-h-[220px] overflow-y-auto">
      <table className="w-full text-[10.5px] tabular-nums">
        <thead>
          <tr className="text-muted-foreground/50 text-left">
            <th className="font-semibold pb-1">Período</th>
            <th className="font-semibold pb-1 text-right">Oficial</th>
            <th className="font-semibold pb-1 text-right">Sin costo</th>
            <th className="font-semibold pb-1 text-right">Costo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.k} className="border-t border-border/10">
              <td className="py-1 text-muted-foreground/75">{etiqueta(f.k)}</td>
              <td className="py-1 text-right">{f.oficial.toLocaleString("es-CL")}</td>
              <td className="py-1 text-right text-emerald-500/80">{f.sinCosto.toLocaleString("es-CL")}</td>
              <td className="py-1 text-right">
                {costoMensaje != null || f.costo > 0 ? clp(f.costo) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Se dice en voz alta en vez de dejar una columna vacía que nadie entiende. */}
      <p className="text-[9.5px] text-muted-foreground/40 mt-2 leading-relaxed">
        No se muestra el saldo al cierre de cada período: el proveedor solo entrega el
        saldo actual y no se guarda una foto diaria.
      </p>
    </div>
  );
}

/** Tooltip de las horas, con los colores del tema y sin el bloque gris detrás. */
function TooltipHoras({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/40 bg-card/95 backdrop-blur px-3 py-2 shadow-xl text-[12px]">
      <p className="text-muted-foreground/60 mb-1">{String(label).padStart(2, "0")}:00</p>
      <p className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground/80">Conversaciones</span>
        <span className="font-black tabular-nums">{Number(payload[0]?.value) || 0}</span>
      </p>
    </div>
  );
}

function Espera({ alto }: { alto: number }) {
  return (
    <div className="flex items-center justify-center" style={{ height: alto }}>
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/25" />
    </div>
  );
}

function Vacio({ texto, alto }: { texto: string; alto: number }) {
  return (
    <div className="flex items-center justify-center text-center px-4" style={{ height: alto }}>
      <p className="text-[12px] text-muted-foreground/45">{texto}</p>
    </div>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/60">
      <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
      {texto}
    </span>
  );
}
