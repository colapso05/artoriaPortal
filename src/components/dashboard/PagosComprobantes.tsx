import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Copy, ExternalLink, FileUp, Loader2, RefreshCw, Search, Upload, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  capacidades, estadoComprobante, listarComprobantes, ModuloNoDisponible, registrarFacturas, rechazarFacturas,
  subirComprobante, urlDelArchivo, validarArchivo, MAX_BYTES,
  type Capacidades, type Comprobante, type FacturaComprobante, type Pago, type ResumenComprobante, type ResultadoCrear,
} from "@/lib/comprobantes";

const SONDEO_MS = 4000;
/** Pasado este tiempo en "analizando" se avisa que está demorando, pero se sigue esperando. */
const DEMORA_MS = 2 * 60 * 1000;
/** Cuántos comprobantes se traen del historial. Filtros y contadores trabajan sobre estos. */
const TOPE_HISTORIAL = 200;
const POR_PAGINA = 20;
/** Facturas que se dibujan antes de pedir "Ver todas". */
const MAX_FILAS = 20;

const clp = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString("es-CL")}`);
const dos = (n: number) => String(n).padStart(2, "0");

/** "2026-10-08" → "08-10-2026", sin pasar por Date para que la zona horaria no corra el día. */
const fechaCorta = (s: string | null) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : `${dos(d.getDate())}-${dos(d.getMonth() + 1)}-${d.getFullYear()}`;
};
/** "08-10-2026 a las 14:35" */
const fechaHora = (s: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${dos(d.getDate())}-${dos(d.getMonth() + 1)}-${d.getFullYear()} a las ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};
/** Día local de un instante, como "2026-10-08", para comparar y filtrar por fecha. */
const diaLocal = (s: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

const NO_LEIDO = <span className="text-muted-foreground/50 font-normal">No se pudo leer</span>;

type Pendiente = { tipo: "registrar" | "rechazar"; facturas: FacturaComprobante[]; titulo: string; sinPropuesta?: boolean };

/** Cada estado con su color: analizando azul, por revisar ámbar, registrado verde, rechazado gris, error rojo. */
const ESTADOS: Record<string, { texto: string; clase: string }> = {
  analizando: { texto: "Analizando", clase: "text-sky-500 bg-sky-500/10 border-sky-500/30" },
  listo: { texto: "Por revisar", clase: "text-amber-500 bg-amber-500/10 border-amber-500/30" },
  parcial: { texto: "Parcial", clase: "text-amber-500 bg-amber-500/10 border-amber-500/30" },
  registrado: { texto: "Registrado", clase: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30" },
  rechazado: { texto: "Rechazado", clase: "text-muted-foreground bg-secondary/40 border-border/30" },
  duplicado: { texto: "Duplicado", clase: "text-muted-foreground bg-secondary/40 border-border/30" },
  error: { texto: "Error", clase: "text-red-500 bg-red-500/10 border-red-500/30" },
};
const estadoVisual = (e: string) => ESTADOS[e] ?? { texto: e || "—", clase: "text-muted-foreground bg-secondary/40 border-border/30" };

export default function PagosComprobantes({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [noDisponible, setNoDisponible] = useState(false);

  // ── el comprobante que se está mirando ──
  const [actualId, setActualId] = useState<string | null>(null);
  const [comp, setComp] = useState<Comprobante | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [desde, setDesde] = useState<number>(0);
  const [demora, setDemora] = useState(false);
  const [duplicado, setDuplicado] = useState<Extract<ResultadoCrear, { tipo: "duplicado" }> | null>(null);

  // ── subida ──
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── acciones ──
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  // El diálogo se anima al cerrarse; sin esto su texto se vacía a mitad de la animación.
  const ultimoPendiente = useRef<Pendiente | null>(null);
  if (pendiente) ultimoPendiente.current = pendiente;
  const vista = pendiente ?? ultimoPendiente.current;
  const [motivo, setMotivo] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  /** Errores de ISPControl por factura, de los intentos de esta sesión. */
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [verTodas, setVerTodas] = useState(false);
  const [urlArchivo, setUrlArchivo] = useState<string | null>(null);
  // Hasta saber que se puede registrar, no se puede.
  const [cap, setCap] = useState<Capacidades | null>(null);
  const bloqueado = !cap?.puedeRegistrar;

  // ── historial ──
  const [historial, setHistorial] = useState<ResumenComprobante[] | null>(null);
  const [fEstado, setFEstado] = useState("todos");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);

  const manejar = useCallback((e: unknown, alFallar: (m: string) => void) => {
    if (e instanceof ModuloNoDisponible) setNoDisponible(true);
    else alFallar(e instanceof Error ? e.message : "Error desconocido");
  }, []);

  const cargarHistorial = useCallback(async () => {
    try { setHistorial(await listarComprobantes(companyId, TOPE_HISTORIAL, 0)); }
    catch (e) { manejar(e, () => setHistorial([])); }
  }, [companyId, manejar]);

  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);
  useEffect(() => { capacidades().then(setCap); }, []);

  const refrescar = useCallback(async (id: string) => {
    try { setComp(await estadoComprobante(id)); setErrorCarga(null); }
    catch (e) { manejar(e, setErrorCarga); }
  }, [manejar]);

  // Al abrir otro comprobante se parte de cero.
  useEffect(() => {
    setComp(null); setErrores({}); setVerTodas(false); setDemora(false); setErrorCarga(null); setUrlArchivo(null);
    if (!actualId) return;
    setDesde(Date.now());
    refrescar(actualId);
  }, [actualId, refrescar]);

  // Mientras el análisis no termina se vuelve a preguntar, solo con la pestaña a la vista.
  const analizando = !!actualId && (!comp || comp.estado === "analizando") && !errorCarga;
  useEffect(() => {
    if (!analizando || !actualId) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - desde > DEMORA_MS) setDemora(true);
      refrescar(actualId);
    }, SONDEO_MS);
    return () => clearInterval(t);
  }, [analizando, actualId, desde, refrescar]);

  // Cuando termina, el historial ya cambió de estado.
  useEffect(() => { if (comp && comp.estado !== "analizando") cargarHistorial(); }, [comp?.estado, cargarHistorial]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const origen = comp?.storage_path ?? comp?.archivo_url;
    if (!origen) { setUrlArchivo(null); return; }
    let cancelado = false;
    urlDelArchivo(origen).then(u => { if (!cancelado) setUrlArchivo(u); }).catch(() => {});
    return () => { cancelado = true; };
  }, [comp?.storage_path, comp?.archivo_url]);

  const volver = () => { setActualId(null); setDuplicado(null); setErrorSubida(null); };

  const subir = async (file: File | undefined | null) => {
    if (!file || subiendo) return;
    const invalido = validarArchivo(file);
    if (invalido) { setErrorSubida(invalido); return; }
    setErrorSubida(null); setDuplicado(null); setSubiendo(true);
    try {
      const r = await subirComprobante(companyId, file);
      if (r.tipo === "duplicado") { setDuplicado(r); setActualId(null); }
      else setActualId(r.id);
      cargarHistorial();
    } catch (e) { manejar(e, setErrorSubida); }
    setSubiendo(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const confirmar = async () => {
    if (!pendiente || !comp) return;
    const accion = pendiente;
    const nfacturas = accion.facturas.map(f => f.nfactura);
    setTrabajando(true);
    try {
      const res = accion.tipo === "registrar"
        ? await registrarFacturas(comp.id, nfacturas)
        : await rechazarFacturas(comp.id, nfacturas, motivo);
      const fallidas = res.filter(r => !r.ok);
      setErrores(prev => {
        const next = { ...prev };
        for (const r of res) { if (r.ok) delete next[r.nfactura]; else next[r.nfactura] = r.error || "No se pudo completar."; }
        return next;
      });
      const verbo = accion.tipo === "registrar" ? "registrada" : "rechazada";
      if (fallidas.length === 0) {
        toast({ title: res.length === 1 ? `Factura ${verbo}` : `${res.length} facturas ${verbo}s` });
      } else {
        toast({
          title: fallidas.length === res.length ? "No se pudo completar" : "Se completó solo una parte",
          description: `${fallidas.length} de ${res.length} fallaron. Revisa el detalle en cada factura.`,
          variant: "destructive",
        });
      }
      // El estado final lo dice el servidor, no esta pantalla.
      await refrescar(comp.id);
      cargarHistorial();
    } catch (e) {
      manejar(e, m => toast({ title: "No se pudo completar", description: m, variant: "destructive" }));
    }
    setTrabajando(false); setPendiente(null); setMotivo("");
  };

  const pedirRegistrar = (facturas: FacturaComprobante[], titulo: string, sinPropuesta = false) => setPendiente({ tipo: "registrar", facturas, titulo, sinPropuesta });
  const pedirRechazar = (facturas: FacturaComprobante[], titulo: string) => { setMotivo(""); setPendiente({ tipo: "rechazar", facturas, titulo }); };

  // ── historial: contadores y filtros ──
  const contadores = useMemo(() => {
    const hoy = diaLocal(new Date().toISOString());
    const mes = hoy?.slice(0, 7);
    const h = historial ?? [];
    return {
      porRevisar: h.filter(x => x.estado === "listo" || x.estado === "parcial").length,
      registradosHoy: h.filter(x => x.estado === "registrado" && diaLocal(x.registrado_at ?? x.creado_at) === hoy).length,
      rechazados: h.filter(x => x.estado === "rechazado").length,
      totalMes: h.filter(x => diaLocal(x.creado_at)?.slice(0, 7) === mes).length,
    };
  }, [historial]);

  const filtrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const qRut = q.replace(/[.\s]/g, "");
    return (historial ?? []).filter(h => {
      if (fEstado !== "todos" && h.estado !== fEstado) return false;
      const dia = diaLocal(h.creado_at);
      if (fDesde && (!dia || dia < fDesde)) return false;
      if (fHasta && (!dia || dia > fHasta)) return false;
      if (q) {
        const enNombre = (h.nombre ?? "").toLowerCase().includes(q);
        const enRut = qRut !== "" && (h.rut ?? "").toLowerCase().replace(/[.\s]/g, "").includes(qRut);
        if (!enNombre && !enRut) return false;
      }
      return true;
    });
  }, [historial, fEstado, fDesde, fHasta, busqueda]);

  useEffect(() => { setPagina(1); }, [fEstado, fDesde, fHasta, busqueda]);
  const hayFiltros = fEstado !== "todos" || !!fDesde || !!fHasta || !!busqueda.trim();
  const limpiarFiltros = () => { setFEstado("todos"); setFDesde(""); setFHasta(""); setBusqueda(""); };

  if (noDisponible) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-2">
        <h2 className="text-lg font-bold">Pagos todavía no está disponible</h2>
        <p className="text-sm text-muted-foreground">Este módulo se está terminando de conectar. Vuelve a intentarlo más tarde.</p>
      </div>
    );
  }

  // ── los pagos del comprobante, en sus grupos ──
  const todasFacturas = comp?.facturas ?? [];
  const pagos = comp?.pagos ?? [];
  /**
   * Las facturas de un pago. El vínculo exacto es `pago_orden`; si una factura no lo trae
   * (respuestas anteriores) se cae al cliente y, al final, a lo que el pago propone.
   */
  const facturasDe = (p: Pago) => todasFacturas.filter(f =>
    p.sintetico
    || (f.pago_orden != null ? f.pago_orden === p.orden
      : p.match_nfacturas.includes(f.nfactura) || (f.cliente_id != null && p.cliente_id != null && f.cliente_id === p.cliente_id)));
  const reclamadas = new Set(pagos.flatMap(p => facturasDe(p).map(f => f.nfactura)));
  // Una factura que no cuadra con ningún pago no se esconde: queda en su propio grupo.
  const huerfanas = todasFacturas.filter(f => !reclamadas.has(f.nfactura));

  const conFacturas: { pago: Pago; facturas: FacturaComprobante[] }[] = [];
  const alDia: Pago[] = [];
  const conError: Pago[] = [];
  for (const p of pagos) {
    if (p.estado === "error") { conError.push(p); continue; }
    const fs = facturasDe(p);
    if (fs.length > 0) conFacturas.push({ pago: p, facturas: fs }); else alDia.push(p);
  }
  // Los que todavía tienen algo pendiente van primero.
  conFacturas.sort((a, b) => Number(b.facturas.some(f => f.estado === "pendiente")) - Number(a.facturas.some(f => f.estado === "pendiente")));
  const esPropuesta = (p: Pago | null, f: FacturaComprobante) => f.propuesta || (p?.match_nfacturas.includes(f.nfactura) ?? false);

  // Registrar todo / Rechazar todo: solo el grupo con boletas pendientes, nunca los que están al día.
  const pendientesGrupo = [
    ...conFacturas.flatMap(({ pago, facturas }) => facturas.filter(f => f.estado === "pendiente").map(f => ({ pago: pago as Pago | null, f }))),
    ...huerfanas.filter(f => f.estado === "pendiente").map(f => ({ pago: null as Pago | null, f })),
  ];
  const facturasPendientes = pendientesGrupo.map(x => x.f);
  const propuestas = pendientesGrupo.filter(x => esPropuesta(x.pago, x.f)).map(x => x.f);
  const pagosConPendientes = conFacturas.filter(x => x.facturas.some(f => f.estado === "pendiente")).length;
  const gestionados = conFacturas.length - pagosConPendientes;
  const mostradas = filtrado.slice(0, pagina * POR_PAGINA);

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6 pb-10">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Pagos y comprobantes</h2>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Cuando el banco no registra un pago, el cliente queda como moroso aunque haya pagado. Sube aquí el comprobante: el sistema detecta quién
          pagó y qué facturas cubre, y tú confirmas el registro en ISPControl. <strong className="text-foreground/80">Nada se registra solo.</strong>
        </p>
      </div>

      {/* ── Contadores ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Contador etiqueta="Pendientes de revisión" valor={historial ? contadores.porRevisar : null} tono="text-amber-500" />
        <Contador etiqueta="Registrados hoy" valor={historial ? contadores.registradosHoy : null} tono="text-emerald-500" />
        <Contador etiqueta="Rechazados" valor={historial ? contadores.rechazados : null} />
        <Contador etiqueta="Total del mes" valor={historial ? contadores.totalMes : null} />
      </div>

      {/* ── Subida ── */}
      {!actualId && !duplicado && (
        <div
          onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={e => { e.preventDefault(); setArrastrando(false); subir(e.dataTransfer.files?.[0]); }}
          className={`rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-colors ${
            arrastrando ? "border-primary/60 bg-primary/[0.05]" : "border-border/40 bg-card/30"}`}
        >
          {subiendo ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary/60" />
              <p className="text-sm">Subiendo el comprobante…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center"><FileUp className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-sm font-semibold">Arrastra el comprobante aquí</p>
                <p className="text-xs text-muted-foreground mt-0.5">Foto (JPG o PNG), PDF o TXT, de hasta {MAX_BYTES / 1024 / 1024} MB</p>
              </div>
              <Button size="sm" className="gap-2" onClick={() => inputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> Elegir archivo
              </Button>
            </div>
          )}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,application/pdf,text/plain,.txt" className="hidden"
            onChange={e => subir(e.target.files?.[0])} />
          {errorSubida && <p className="text-xs text-red-500 mt-3">{errorSubida}</p>}
        </div>
      )}

      {/* ── Duplicado ── */}
      {duplicado && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">Este comprobante ya fue subido</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {duplicado.registradoAt
                  ? <>Este pago ya fue registrado el {fechaHora(duplicado.registradoAt)}{duplicado.registradoPor ? <> por {duplicado.registradoPor}</> : null}. No se registró de nuevo.</>
                  : "El mismo archivo ya está en el sistema, así que no se duplicó."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {duplicado.id && <Button size="sm" variant="outline" onClick={() => { const id = duplicado.id; setDuplicado(null); setActualId(id); }}>Ver ese comprobante</Button>}
            <Button size="sm" variant="ghost" onClick={volver}>Subir otro</Button>
          </div>
        </div>
      )}

      {/* ── Revisión ── */}
      {actualId && (
        <div className="space-y-4">
          <button onClick={volver} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver
          </button>

          {errorCarga && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12.5px] flex items-center gap-3">
              <span className="flex-1">No se pudo consultar el comprobante: <span className="text-muted-foreground">{errorCarga}</span></span>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => refrescar(actualId)}>
                <RefreshCw className="w-3.5 h-3.5" /> Reintentar
              </Button>
            </div>
          )}

          {analizando && (
            <div className="rounded-2xl border border-border/30 bg-card/40 px-6 py-8 text-center space-y-1.5">
              <Loader2 className="w-6 h-6 animate-spin text-primary/60 mx-auto" />
              <p className="text-sm font-semibold">Analizando el comprobante…</p>
              <p className="text-xs text-muted-foreground">Se lee el archivo y se busca al cliente en ISPControl. Suele tomar unos segundos.</p>
              {demora && <p className="text-xs text-amber-500 pt-1">Está demorando más de lo normal, o el análisis automático todavía no está disponible. El comprobante quedó guardado y lo encuentras en el historial.</p>}
            </div>
          )}

          {comp?.estado === "error" && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 space-y-3">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold">No se pudo analizar el comprobante</p>
                  <p className="text-xs text-muted-foreground mt-1">{comp.error_mensaje ?? "El análisis falló sin dar un motivo."}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={volver}>Subir otro</Button>
            </div>
          )}

          {comp?.estado === "listo" && (
            <>
              {bloqueado && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[12.5px] leading-relaxed">
                    <strong>Por ahora no se pueden registrar pagos desde acá.</strong>{" "}
                    {cap === null ? "Verificando permisos con ISPControl…" : (cap.motivo ?? "ISPControl no lo permite todavía.")}{" "}
                    Puedes revisar los pagos y las facturas, y rechazar si no corresponde.
                  </p>
                </div>
              )}

              {/* Resumen del archivo */}
              <Bloque titulo="Resumen del comprobante" derecha={urlArchivo && (
                <a href={urlArchivo} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-1">
                  Ver archivo <ExternalLink className="w-3 h-3" />
                </a>
              )}>
                <p className="text-sm font-semibold">
                  {pagos.length} pago{pagos.length === 1 ? "" : "s"} detectado{pagos.length === 1 ? "" : "s"}
                  <span className="text-muted-foreground font-normal"> · </span>
                  <span className={pagosConPendientes > 0 ? "text-amber-500" : ""}>{pagosConPendientes} con boletas pendientes</span>
                  <span className="text-muted-foreground font-normal"> · </span>
                  <span>{alDia.length} al día</span>
                  {gestionados > 0 && <><span className="text-muted-foreground font-normal"> · </span><span>{gestionados} ya gestionado{gestionados === 1 ? "" : "s"}</span></>}
                  {conError.length > 0 && <><span className="text-muted-foreground font-normal"> · </span><span className="text-red-500">{conError.length} con error</span></>}
                </p>
                {(comp.banco || comp.analizado_at) && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {comp.banco && <>Banco: {comp.banco}</>}{comp.banco && comp.analizado_at && " · "}{comp.analizado_at && <>Analizado el {fechaHora(comp.analizado_at)}</>}
                  </p>
                )}
              </Bloque>

              {/* El texto tal cual, para compararlo con lo interpretado */}
              <details className="rounded-2xl border border-border/25 bg-card/40">
                <summary className="cursor-pointer select-none px-5 py-3.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-foreground/70">
                  Texto extraído del archivo
                </summary>
                <div className="px-5 pb-4">
                  {comp.texto_extraido ? (
                    <pre className="text-[11.5px] leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-y-auto rounded-lg bg-secondary/30 border border-border/20 p-3 font-mono">{comp.texto_extraido}</pre>
                  ) : (
                    <p className="text-xs text-muted-foreground/70">No se extrajo texto de este archivo.</p>
                  )}
                </div>
              </details>

              {/* 1. Los que el banco no registró: el motivo de esta sección */}
              {(conFacturas.length > 0 || huerfanas.length > 0) ? (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold">Pagos con boletas pendientes</h3>
                      <p className="text-xs text-muted-foreground">El cliente pagó, pero ISPControl todavía tiene la boleta como impaga.</p>
                    </div>
                    {facturasPendientes.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={trabajando || bloqueado || propuestas.length === 0}
                          onClick={() => pedirRegistrar(propuestas, propuestas.length === 1 ? "Registrar la factura propuesta" : `Registrar las ${propuestas.length} facturas propuestas`)}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Registrar todo lo propuesto ({propuestas.length})
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={trabajando}
                          onClick={() => pedirRechazar(facturasPendientes, facturasPendientes.length === 1 ? "Rechazar la factura" : `Rechazar las ${facturasPendientes.length} facturas pendientes`)}>
                          <XCircle className="w-3.5 h-3.5" /> Rechazar todo ({facturasPendientes.length})
                        </Button>
                      </div>
                    )}
                  </div>

                  {conFacturas.map(({ pago, facturas }) => (
                    <TarjetaPago key={pago.orden} pago={pago} facturas={facturas} errores={errores} ocupado={trabajando} sinRegistro={bloqueado}
                      esPropuesta={f => esPropuesta(pago, f)}
                      onRegistrar={f => pedirRegistrar([f], `Registrar la factura ${f.nfactura}`, !esPropuesta(pago, f))}
                      onRechazar={f => pedirRechazar([f], `Rechazar la factura ${f.nfactura}`)} />
                  ))}

                  {huerfanas.length > 0 && (
                    <div className="rounded-2xl border border-border/25 bg-card/40 overflow-hidden">
                      <p className="px-5 py-3 text-xs font-semibold text-muted-foreground border-b border-border/15">Facturas que no se pudieron asociar a un pago</p>
                      <ul className="divide-y divide-border/10">
                        {huerfanas.map(f => (
                          <FilaFactura key={f.nfactura} f={f} propuesta={esPropuesta(null, f)} errorLocal={errores[f.nfactura]} ocupado={trabajando} sinRegistro={bloqueado}
                            onRegistrar={() => pedirRegistrar([f], `Registrar la factura ${f.nfactura}`, !esPropuesta(null, f))}
                            onRechazar={() => pedirRechazar([f], `Rechazar la factura ${f.nfactura}`)} />
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ) : (
                <div className="rounded-2xl border border-border/25 bg-card/40 px-5 py-6 text-center">
                  <p className="text-sm font-semibold">Ningún pago de este comprobante tiene boletas pendientes.</p>
                  <p className="text-xs text-muted-foreground mt-1">No hay nada que registrar.</p>
                </div>
              )}

              {/* 2. Al día: solo informan, sin botones de registro */}
              {alDia.length > 0 && (
                <details className="rounded-2xl border border-border/20 bg-card/30">
                  <summary className="cursor-pointer select-none px-5 py-3 text-xs font-semibold text-muted-foreground hover:text-foreground/80">
                    Pagos al día ({alDia.length}) · sin boletas pendientes, no hay nada que registrar
                  </summary>
                  <ul className="divide-y divide-border/10 border-t border-border/10">
                    {alDia.map(p => (
                      <li key={p.orden} className="px-5 py-2 flex items-center gap-4 text-xs">
                        <span className="flex-1 min-w-0 truncate"><span className="font-semibold">{p.cliente_nombre ?? p.nombre ?? "Sin nombre"}</span>
                          <span className="text-muted-foreground"> · {p.rut ?? "RUT no leído"}</span></span>
                        <span className="text-muted-foreground tabular-nums">{fechaCorta(p.fecha) ?? ""}</span>
                        <span className="font-bold tabular-nums">{clp(p.monto)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* 3. Con error: RUT ilegible o cliente inexistente */}
              {conError.length > 0 && (
                <details className="rounded-2xl border border-red-500/25 bg-red-500/[0.04]">
                  <summary className="cursor-pointer select-none px-5 py-3 text-xs font-semibold text-red-500">
                    Pagos que no se pudieron procesar ({conError.length})
                  </summary>
                  <ul className="divide-y divide-border/10 border-t border-red-500/15">
                    {conError.map(p => (
                      <li key={p.orden} className="px-5 py-2 text-xs space-y-0.5">
                        <div className="flex items-center gap-4">
                          <span className="flex-1 min-w-0 truncate font-semibold">{p.nombre ?? "Sin nombre"} <span className="text-muted-foreground font-normal">· {p.rut ?? "RUT no leído"}</span></span>
                          <span className="font-bold tabular-nums">{clp(p.monto)}</span>
                        </div>
                        <p className="text-red-500">{p.error_mensaje ?? "No se pudo identificar al cliente."}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Historial ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Historial de comprobantes</h3>
        </div>

        {historial !== null && historial.length > 0 && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por RUT o nombre" className="h-9 pl-8 text-sm" />
            </div>
            <select value={fEstado} onChange={e => setFEstado(e.target.value)} aria-label="Filtrar por estado"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="todos">Todos los estados</option>
              {["analizando", "listo", "registrado", "rechazado", "error"].map(e => <option key={e} value={e}>{estadoVisual(e).texto}</option>)}
            </select>
            <label className="text-[10.5px] text-muted-foreground space-y-1">
              <span className="block">Desde</span>
              <Input type="date" value={fDesde} max={fHasta || undefined} onChange={e => setFDesde(e.target.value)} className="h-9 w-[150px] text-sm" />
            </label>
            <label className="text-[10.5px] text-muted-foreground space-y-1">
              <span className="block">Hasta</span>
              <Input type="date" value={fHasta} min={fDesde || undefined} onChange={e => setFHasta(e.target.value)} className="h-9 w-[150px] text-sm" />
            </label>
            {hayFiltros && <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={limpiarFiltros}>Limpiar</Button>}
          </div>
        )}

        {historial === null ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary/40" /></div>
        ) : historial.length === 0 ? (
          <p className="text-sm text-muted-foreground/70 py-8 text-center">
            Todavía no hay comprobantes. Sube uno cuando el banco no registre un pago.
          </p>
        ) : filtrado.length === 0 ? (
          <p className="text-sm text-muted-foreground/70 py-8 text-center">Ningún comprobante coincide con los filtros.</p>
        ) : (
          <div className="rounded-2xl border border-border/25 bg-card/40 overflow-hidden">
            <ul className="divide-y divide-border/10">
              {mostradas.map(h => <FilaHistorial key={h.id} h={h} onAbrir={() => { setDuplicado(null); setActualId(h.id); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}
            </ul>
            <div className="px-5 py-3 border-t border-border/10 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {mostradas.length} de {filtrado.length}
                {historial.length >= TOPE_HISTORIAL && ` · se consideran los últimos ${TOPE_HISTORIAL} comprobantes`}
              </span>
              {mostradas.length < filtrado.length && (
                <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => setPagina(p => p + 1)}>Ver más</Button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Confirmación ── */}
      <AlertDialog open={!!pendiente} onOpenChange={o => { if (!o && !trabajando) { setPendiente(null); setMotivo(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{vista?.titulo}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {vista?.tipo === "registrar" ? (
                  <>
                    <p>Esto registra el pago en ISPControl y <strong>no se puede deshacer desde acá</strong>.</p>
                    <ResumenAccion facturas={vista.facturas} pagado={comp?.monto ?? null} />
                    {vista.sinPropuesta && (
                      <p className="text-amber-500 text-xs">El sistema no propuso esta factura para este pago. Verifica que sea la correcta.</p>
                    )}
                  </>
                ) : (
                  <>
                    <p>Las facturas quedan marcadas como rechazadas. No se registra ningún pago.</p>
                    <ResumenAccion facturas={vista?.facturas ?? []} pagado={null} />
                    <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
                      placeholder="Motivo (opcional): por ejemplo, el monto no coincide" className="text-sm" />
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trabajando}>Cancelar</AlertDialogCancel>
            {/* No es AlertDialogAction a secas: ese cierra el diálogo al hacer clic, y acá
                tiene que seguir abierto mientras el servidor responde. */}
            <AlertDialogAction disabled={trabajando} onClick={e => { e.preventDefault(); confirmar(); }}>
              {trabajando && <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />}
              {vista?.tipo === "registrar" ? "Registrar" : "Rechazar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Contador({ etiqueta, valor, tono }: { etiqueta: string; valor: number | null; tono?: string }) {
  return (
    <div className="rounded-xl border border-border/25 bg-card/40 px-4 py-3">
      <p className="text-[10.5px] text-muted-foreground/70 leading-tight">{etiqueta}</p>
      <p className={`text-2xl font-black tabular-nums mt-1 ${valor ? tono ?? "" : "text-muted-foreground/50"}`}>{valor ?? "—"}</p>
    </div>
  );
}

function Bloque({ titulo, derecha, children }: { titulo: string; derecha?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/25 bg-card/40 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">{titulo}</h3>
        {derecha}
      </div>
      {children}
    </div>
  );
}

function Dato({ etiqueta, valor, grande, vacio }: { etiqueta: string; valor: string | null; grande?: boolean; vacio?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] text-muted-foreground/60">{etiqueta}</dt>
      <dd className={`mt-0.5 break-words ${grande ? "text-lg font-black tabular-nums" : "text-sm font-semibold"}`}>
        {valor ?? (vacio ? <span className="text-muted-foreground/50 font-normal text-sm">{vacio}</span> : NO_LEIDO)}
      </dd>
    </div>
  );
}

/** Un pago con sus facturas: quién pagó, cuánto, la propuesta en una frase y las acciones por factura. */
function TarjetaPago({ pago, facturas, errores, ocupado, sinRegistro, esPropuesta, onRegistrar, onRechazar }: {
  pago: Pago; facturas: FacturaComprobante[]; errores: Record<string, string>; ocupado: boolean; sinRegistro: boolean;
  esPropuesta: (f: FacturaComprobante) => boolean;
  onRegistrar: (f: FacturaComprobante) => void; onRechazar: (f: FacturaComprobante) => void;
}) {
  const propuestas = facturas.filter(f => f.estado === "pendiente" && esPropuesta(f));
  const total = propuestas.reduce((s, f) => s + (f.monto ?? 0), 0);
  const hayPendiente = facturas.some(f => f.estado === "pendiente");
  const frase = !hayPendiente ? null
    : propuestas.length === 0 ? "No se propuso ninguna factura para este pago: revisa cuál corresponde o recházalo."
    : propuestas.length === 1 ? `Este pago cubre 1 factura de ${clp(total)}.`
    : `Este pago cubre ${propuestas.length} facturas (${propuestas.map(f => clp(f.monto)).join(" + ")} = ${clp(total)}).`;
  const { toast } = useToast();
  const copiar = async () => {
    const texto = pago.linea_original;
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sin permiso del portapapeles (o sin https): se copia con un campo temporal.
      const t = document.createElement("textarea");
      t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      const ok = document.execCommand("copy");
      t.remove();
      if (!ok) { toast({ title: "No se pudo copiar", description: "Selecciona la línea y cópiala a mano.", variant: "destructive" }); return; }
    }
    toast({ title: "Línea copiada" });
  };
  return (
    <div className="rounded-2xl border border-border/25 bg-card/40 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/15 space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-bold">{pago.cliente_nombre ?? pago.nombre ?? "Sin nombre"}</p>
          <p className="text-base font-black tabular-nums">{clp(pago.monto)}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {pago.rut ?? "RUT no leído"}
          {pago.nombre && pago.cliente_nombre && pago.nombre !== pago.cliente_nombre && <> · Titular del pago: {pago.nombre}</>}
          {pago.fecha && <> · Pagó el {fechaCorta(pago.fecha)}</>}
        </p>
        {frase && (
          <p className={`text-xs font-semibold ${propuestas.length === 0 ? "text-amber-500" : "text-emerald-500"}`}>{frase}</p>
        )}
      </div>
      {/* La línea del archivo tal cual, para copiarla y registrar el pago con ella. */}
      {hayPendiente && pago.linea_original && (
        <div className="px-5 py-3 border-b border-border/15 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/60">Línea del archivo</p>
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={copiar}><Copy className="w-3.5 h-3.5" /> Copiar</Button>
          </div>
          <pre className="text-[12px] leading-relaxed font-mono whitespace-pre overflow-x-auto rounded-lg bg-secondary/30 border border-border/20 px-3 py-2 select-all">{pago.linea_original}</pre>
        </div>
      )}
      <ul className="divide-y divide-border/10">
        {facturas.map(f => (
          <FilaFactura key={f.nfactura} f={f} propuesta={esPropuesta(f)} errorLocal={errores[f.nfactura]} ocupado={ocupado} sinRegistro={sinRegistro}
            onRegistrar={() => onRegistrar(f)} onRechazar={() => onRechazar(f)} />
        ))}
      </ul>
    </div>
  );
}

function FilaFactura({ f, propuesta, errorLocal, ocupado, sinRegistro, onRegistrar, onRechazar }: {
  f: FacturaComprobante; propuesta: boolean; errorLocal?: string; ocupado: boolean; sinRegistro: boolean; onRegistrar: () => void; onRechazar: () => void;
}) {
  const error = errorLocal ?? f.error_ispcontrol;
  return (
    <li className={`px-5 py-3.5 ${f.estado !== "pendiente" ? "opacity-75" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="min-w-[110px]">
          <p className="text-sm font-bold tabular-nums">N° {f.nfactura}</p>
          {propuesta && f.estado === "pendiente" && (
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-1.5 py-px">Propuesta</span>
          )}
        </div>
        <p className="text-sm font-black tabular-nums w-24">{clp(f.monto)}</p>
        <p className="text-xs text-muted-foreground flex-1 min-w-[110px]">Vence {fechaCorta(f.vencimiento) ?? "—"}</p>

        {f.estado === "pendiente" && (
          <div className="flex gap-2">
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={ocupado || sinRegistro} onClick={onRegistrar}>
              {error ? <RefreshCw className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {error ? "Reintentar" : "Registrar"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={ocupado} onClick={onRechazar}>
              <XCircle className="w-3.5 h-3.5" /> Rechazar
            </Button>
          </div>
        )}
      </div>
      {/* g) Trazabilidad: quién y cuándo */}
      {f.estado === "registrado" && (
        <p className="text-xs text-emerald-500 font-semibold flex items-center gap-1.5 mt-2">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Registrado{f.registrado_por ? ` por ${f.registrado_por}` : ""}{f.registrado_at ? ` el ${fechaHora(f.registrado_at)}` : ""}
        </p>
      )}
      {f.estado === "rechazado" && (
        <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5 mt-2">
          <XCircle className="w-3.5 h-3.5" />
          Rechazado{f.registrado_por ? ` por ${f.registrado_por}` : ""}{f.registrado_at ? ` el ${fechaHora(f.registrado_at)}` : ""}
          {f.motivo_rechazo ? ` · Motivo: ${f.motivo_rechazo}` : ""}
        </p>
      )}
      {error && f.estado === "pendiente" && (
        <p className="text-[11.5px] text-red-500 mt-2 leading-snug">
          <strong>No se registró.</strong> ISPControl respondió: {error}
        </p>
      )}
    </li>
  );
}

/** Una fila del historial muestra solo lo que ya existe: nada de "Sin titular" mientras se analiza. */
function FilaHistorial({ h, onAbrir }: { h: ResumenComprobante; onAbrir: () => void }) {
  const est = estadoVisual(h.estado);
  let detalle: React.ReactNode = null;
  let monto: string | null = null;

  if (h.estado === "analizando") {
    detalle = <span className="text-sky-500/80">Analizando el comprobante…</span>;
  } else if (h.estado === "error") {
    detalle = <span className="text-red-500">{h.error_mensaje ?? "No se pudo analizar el comprobante."}</span>;
  } else {
    monto = clp(h.monto);
    const quien = [h.nombre, h.rut].filter(Boolean).join(" · ");
    detalle = (
      <>
        {quien ? <span>{quien}</span> : <span className="text-muted-foreground/60">Titular y RUT no leídos</span>}
        {h.cliente_encontrado === false && <span className="text-amber-500"> · No se encontró el cliente</span>}
        {(h.estado === "registrado" || h.estado === "rechazado") && (h.registrado_por || h.registrado_at) && (
          <span className="text-muted-foreground/60">
            {" "}· {h.estado === "registrado" ? "Registrado" : "Rechazado"}{h.registrado_por ? ` por ${h.registrado_por}` : ""}{h.registrado_at ? ` el ${fechaHora(h.registrado_at)}` : ""}
          </span>
        )}
      </>
    );
  }

  return (
    <li>
      <button onClick={onAbrir} className="w-full text-left px-5 py-3 flex items-center gap-4 hover:bg-secondary/20 transition-colors">
        <span className="text-xs text-muted-foreground tabular-nums w-[140px] flex-shrink-0">{fechaHora(h.creado_at)?.replace(" a las ", " ") ?? "—"}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold truncate">{h.archivo ?? "Comprobante"}</span>
          <span className="block text-[11.5px] text-muted-foreground leading-snug">{detalle}</span>
        </span>
        {monto && <span className="text-sm font-bold tabular-nums flex-shrink-0">{monto}</span>}
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${est.clase}`}>{est.texto}</span>
      </button>
    </li>
  );
}

function ResumenAccion({ facturas, pagado }: { facturas: FacturaComprobante[]; pagado: number | null }) {
  const total = facturas.reduce((s, f) => s + (f.monto ?? 0), 0);
  return (
    <div className="rounded-lg bg-secondary/30 border border-border/20 px-3 py-2.5 text-xs space-y-1">
      <ul className="space-y-0.5 max-h-32 overflow-y-auto">
        {facturas.map(f => (
          <li key={f.nfactura} className="flex justify-between tabular-nums"><span>Factura N° {f.nfactura}</span><span className="font-semibold">{clp(f.monto)}</span></li>
        ))}
      </ul>
      <div className="flex justify-between border-t border-border/20 pt-1 font-bold tabular-nums">
        <span>{facturas.length} factura{facturas.length === 1 ? "" : "s"}</span><span>{clp(total)}</span>
      </div>
      {pagado != null && (
        <div className={`flex justify-between tabular-nums ${total === pagado ? "text-muted-foreground" : "text-amber-500 font-semibold"}`}>
          <span>Monto del comprobante</span><span>{clp(pagado)}</span>
        </div>
      )}
    </div>
  );
}
