import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Plus, Pencil, Trash2, Wifi, Tv, Layers, X,
  ExternalLink, Check, AlertTriangle,
} from "lucide-react";
import {
  listarPlanesWeb, guardarPlanWeb, borrarPlanWeb,
  leerAjustesWeb, guardarAjustesWeb, guardarUrlSitio, urlDelSitio,
  CATEGORIAS_WEB, PLAN_WEB_VACIO, AJUSTES_WEB_VACIOS,
  type PlanWeb, type PlanWebEditable, type CategoriaWeb, type AjustesWeb,
} from "@/lib/sitioWeb";

const ICONO: Record<CategoriaWeb, any> = { internet: Wifi, tv: Tv, duo: Layers };
const MAX_CARACTERISTICAS = 8;

/** Ancho con el que se dibuja la página antes de achicarla: el de un monitor. */
const ANCHO_LOGICO = 1440;

/** Alto de la caja en pantalla. Lo que cambia con el zoom es cuánta página entra. */
const ALTO_CAJA = 620;

/*
 * Los niveles de alejamiento.
 *
 * No hay un "ajustar a la página" porque el sitio es de otro dominio y desde acá
 * no se puede medir cuánto mide: habría que adivinarlo. Con pasos fijos el que
 * mira elige cuánto quiere ver, que además cambia según qué esté revisando —no es
 * lo mismo corregir un precio que mirar cómo quedaron las tres secciones juntas.
 */
const ZOOMS: { id: string; label: string; escala: number }[] = [
  { id: "cerca", label: "100%", escala: 1 },
  { id: "normal", label: "75%", escala: 0.75 },
  { id: "lejos", label: "50%", escala: 0.5 },
  { id: "todo", label: "Toda la página", escala: 0.33 },
];

const clp = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

/**
 * La página real de la empresa, mostrando el borrador.
 *
 * No es una imitación: es el sitio de producción dentro de un iframe. Lo que se
 * está editando se le manda por `postMessage` y él se redibuja con esos datos sin
 * guardarlos. Así lo que se ve antes de publicar es exactamente lo que va a
 * quedar publicado, con la tipografía y el diseño de verdad.
 *
 * Mientras el sitio no tenga el oyente puesto (ver PARCHE_SITIO_PREVIEW.md), el
 * iframe muestra lo que ya está publicado y los cambios recién aparecen al
 * guardar. Por eso el cartel dice de dónde viene lo que se está viendo.
 */
function VistaPrevia({ sitio, planes, ajustes, listoParaBorrador }: {
  sitio: string; planes: PlanWeb[]; ajustes: AjustesWeb; listoParaBorrador: boolean;
}) {
  const marco = useRef<HTMLIFrameElement | null>(null);
  const contenedor = useRef<HTMLDivElement | null>(null);
  const [disponible, setDisponible] = useState(0);
  const [cargado, setCargado] = useState(false);
  const [zoom, setZoom] = useState("lejos");

  useEffect(() => {
    const el = contenedor.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setDisponible(e.contentRect.width));
    ro.observe(el);
    setDisponible(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  /*
   * La escala elegida, salvo que no quepa a lo ancho.
   *
   * Al achicar, la caja se angosta sola —1440 al 50% son 720 px— y queda centrada:
   * es la caja acotada que muestra la página entera, en vez de una franja enorme
   * donde entra una tarjeta y media.
   */
  const elegida = ZOOMS.find(z => z.id === zoom)?.escala ?? 0.5;
  const escala = disponible > 0 ? Math.min(elegida, disponible / ANCHO_LOGICO) : elegida;
  const anchoVisible = Math.round(ANCHO_LOGICO * escala);
  const altoLogico = Math.round(ALTO_CAJA / escala);
  const [pagina, setPagina] = useState<"/" | "/planes">("/planes");

  // Cada cambio del borrador viaja al iframe. El sitio decide si lo escucha.
  useEffect(() => {
    if (!cargado) return;
    marco.current?.contentWindow?.postMessage(
      { tipo: "artoria:borrador", planes, ajustes },
      new URL(sitio).origin,
    );
  }, [planes, ajustes, cargado, pagina]);

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="inline-flex rounded-lg border border-border/30 overflow-hidden text-[11px] font-bold">
          {(["/", "/planes"] as const).map((p) => (
            <button
              key={p}
              onClick={() => { setCargado(false); setPagina(p); }}
              className={`px-2.5 py-1 transition-colors ${
                pagina === p ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground/70"}`}
            >
              {p === "/" ? "Portada" : "Planes"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border/30 overflow-hidden text-[11px] font-bold">
            {ZOOMS.map((z) => (
              <button
                key={z.id}
                onClick={() => setZoom(z.id)}
                className={`px-2 py-1 transition-colors ${
                  zoom === z.id ? "bg-primary/15 text-primary" : "hover:bg-muted/50 text-muted-foreground/60"}`}
              >
                {z.label}
              </button>
            ))}
          </div>
          <a
            href={sitio + pagina} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            Abrir el sitio <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/*
       * La página se dibuja a 1440 px y se achica hasta entrar.
       *
       * A tamaño real entraba una tarjeta y media y había que desplazarse dentro
       * del iframe para ver el efecto de un cambio. Alejándola se ve la página
       * como la ve alguien en un monitor, que es lo que se está revisando.
       */}
      <div ref={contenedor} className="w-full flex justify-center">
        <div
          className="rounded-xl border border-border/30 overflow-hidden bg-white shadow-sm"
          style={{ width: anchoVisible, height: ALTO_CAJA }}
        >
          <iframe
            ref={marco}
            key={pagina}
            src={`${sitio}${pagina}?preview=1`}
            title="Vista previa del sitio"
            onLoad={() => setCargado(true)}
            sandbox="allow-scripts allow-same-origin"
            style={{
              width: ANCHO_LOGICO,
              height: altoLogico,
              border: 0,
              transform: `scale(${escala})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/45 mt-1.5 leading-relaxed">
        {listoParaBorrador
          ? "Se ve el borrador: todavía no está publicado."
          : "Se ve lo que ya está publicado. Los cambios aparecen acá recién al guardar, hasta que el sitio acepte la vista previa en vivo."}
      </p>
    </div>
  );
}

/**
 * Contenido del SITIO WEB público de la empresa.
 *
 * Es lo que ve un cliente que entra a la página desde Google o desde un link de
 * WhatsApp. Está separado de "Planes y precios" a propósito: acá se edita lo que se
 * publica, no lo que el agente cotiza. Un plan se puede sacar de la web sin que el bot
 * deje de ofrecerlo, y al revés.
 */
export default function SitioWebPanel({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [planes, setPlanes] = useState<PlanWeb[] | null>(null);
  const [editando, setEditando] = useState<{ id?: string; datos: PlanWebEditable } | null>(null);
  const [caracteristicasTexto, setCaracteristicasTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState<string | null>(null);
  const [ajustes, setAjustes] = useState<AjustesWeb>({ ...AJUSTES_WEB_VACIOS });
  const [guardandoAjustes, setGuardandoAjustes] = useState(false);

  /*
   * El sitio de esta empresa. Antes era una constante con el dominio de Dropp,
   * así que el panel solo servía para ellos: cualquier otra empresa habría
   * editado sus propios planes mirando la página ajena.
   */
  const sitio = urlDelSitio(companyId, ajustes);

  const cargar = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([listarPlanesWeb(companyId), leerAjustesWeb(companyId)]);
      setPlanes(p);
      setAjustes(a);
    } catch (e: any) {
      setPlanes([]);
      toast({ title: "No se pudo cargar el contenido del sitio", description: e.message, variant: "destructive" });
    }
  }, [companyId, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  // El "¿eliminar?" vuelve solo si el usuario se arrepiente o se distrae.
  useEffect(() => {
    if (!confirmandoBorrado) return;
    const t = setTimeout(() => setConfirmandoBorrado(null), 4000);
    return () => clearTimeout(t);
  }, [confirmandoBorrado]);

  const abrirNuevo = () => {
    const maxOrden = Math.max(0, ...(planes ?? []).map(p => p.orden));
    setCaracteristicasTexto("");
    setEditando({ datos: { ...PLAN_WEB_VACIO, orden: maxOrden + 1 } });
  };

  /*
   * El mismo lápiz abre y cierra.
   * Antes solo abría: volver a tocarlo recargaba el mismo plan en el formulario y
   * parecía que el botón no hacía nada.
   */
  const abrirEdicion = (p: PlanWeb) => {
    if (editando?.id === p.id) { setEditando(null); return; }
    setCaracteristicasTexto((p.caracteristicas ?? []).join("\n"));
    setEditando({ id: p.id, datos: { ...p } });
  };

  const campo = (k: keyof PlanWebEditable, v: any) =>
    setEditando(e => (e ? { ...e, datos: { ...e.datos, [k]: v } } : e));

  const guardar = async () => {
    if (!editando) return;
    const d = editando.datos;

    if (!d.nombre.trim()) {
      toast({ title: "Falta el nombre del plan", variant: "destructive" });
      return;
    }
    if (d.nombre.trim().length > 60) {
      toast({ title: "El nombre es muy largo", description: "Máximo 60 caracteres: en la tarjeta no entra más.", variant: "destructive" });
      return;
    }
    if (!(d.precio_oferta > 0)) {
      toast({ title: "Falta el precio de oferta", description: "Es el precio grande que muestra la web.", variant: "destructive" });
      return;
    }
    // Un "precio normal" menor que el de oferta se lee como un error de tipeo y
    // descoloca la tarjeta: la web muestra el de oferta como precio principal.
    if (d.precio_normal != null && d.precio_normal < d.precio_oferta) {
      toast({
        title: "El precio normal es menor que el de oferta",
        description: "El precio normal es el que se cobra después de la promoción: debería ser igual o mayor.",
        variant: "destructive",
      });
      return;
    }
    if (d.etiqueta && d.etiqueta.trim().length > 24) {
      toast({ title: "La etiqueta es muy larga", description: "Máximo 24 caracteres (por ejemplo: \"Más elegido\").", variant: "destructive" });
      return;
    }

    const caracteristicas = caracteristicasTexto
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);

    if (caracteristicas.length > MAX_CARACTERISTICAS) {
      toast({
        title: `Máximo ${MAX_CARACTERISTICAS} características`,
        description: "Más bullets hacen que la tarjeta crezca y se desalinee de las del lado.",
        variant: "destructive",
      });
      return;
    }
    if (caracteristicas.some((c) => c.length > 80)) {
      toast({ title: "Una característica es muy larga", description: "Máximo 80 caracteres cada una.", variant: "destructive" });
      return;
    }

    setGuardando(true);
    try {
      await guardarPlanWeb(
        companyId,
        {
          ...d,
          nombre: d.nombre.trim(),
          etiqueta: d.etiqueta?.trim() || null,
          caracteristicas,
        },
        editando.id,
      );
      toast({ title: "Plan publicado", description: "Ya se ve en el sitio al recargar la página." });
      setEditando(null);
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (p: PlanWeb) => {
    try {
      await borrarPlanWeb(p.id);
      toast({ title: `"${p.nombre}" eliminado del sitio`, description: "Dejó de mostrarse en la web. El agente no se toca." });
      setConfirmandoBorrado(null);
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo eliminar", description: e.message, variant: "destructive" });
    }
  };


  const guardarLinks = async () => {
    const problemas: string[] = [];
    const esUrl = (v: string) => /^https?:\/\/\S+\.\S+/.test(v.trim());
    if (ajustes.link_pago && !esUrl(ajustes.link_pago)) problemas.push("El link de pago no parece una dirección web.");
    if (ajustes.link_sucursal && !esUrl(ajustes.link_sucursal)) problemas.push("El link de la Sucursal Virtual no parece una dirección web.");
    if (ajustes.whatsapp && !/^https?:\/\/\S+/.test(ajustes.whatsapp.trim())) problemas.push("El WhatsApp debe ser un link que empiece con https://");
    if (ajustes.correo && !ajustes.correo.includes("@")) problemas.push("El correo no parece un correo.");
    const meses = parseInt(ajustes.meses_oferta, 10);
    if (!(meses >= 1 && meses <= 36)) problemas.push("Los meses de oferta deben ser un número entre 1 y 36.");

    if (problemas.length) {
      toast({ title: "Revisá estos datos", description: problemas.join(" "), variant: "destructive" });
      return;
    }

    setGuardandoAjustes(true);
    try {
      const { sitio_url, ...resto } = ajustes;
      await guardarAjustesWeb(companyId, resto);
      try {
        await guardarUrlSitio(companyId, sitio_url);
      } catch (e: any) {
        // El resto sí se guardó: se avisa de lo único que faltó.
        toast({
          title: "La dirección del sitio no se guardó",
          description: "El resto sí. La base todavía no acepta esa clave: " + e.message,
          variant: "destructive",
        });
      }
      toast({ title: "Datos del sitio guardados", description: "Ya se ven en la web al recargar la página." });
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setGuardandoAjustes(false);
    }
  };

  if (planes === null) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>;
  }

  const activos = planes.filter(p => p.activo).length;

  /*
   * Lo que se le muestra a la vista previa incluye la edición en curso.
   *
   * Si solo fueran los planes guardados, escribir no se vería hasta apretar
   * guardar, que es justo lo que se quiere evitar.
   */
  const planesParaVista = (() => {
    const base = (planes ?? []).filter((p) => p.activo);
    if (!editando) return base;
    const enCurso = { ...editando.datos, caracteristicas: caracteristicasTexto.split(/\r?\n/).map((c) => c.trim()).filter(Boolean) };
    if (!editando.id) return [...base, { ...enCurso, id: "borrador", company_id: companyId } as PlanWeb];
    return base.map((p) => (p.id === editando.id ? ({ ...p, ...enCurso } as PlanWeb) : p));
  })();


  /*
   * El formulario se dibuja donde está el plan, no al final de la página.
   *
   * Antes vivía después de las tres categorías: había que bajar hasta el fondo
   * para editar y volver a subir para ver cuál se estaba tocando. Devolverlo como
   * función permite montarlo justo debajo de la fila.
   */
  const formulario = () => (
        <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3.5 space-y-3 mt-1">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold">{editando.id ? "Editar plan del sitio" : "Nuevo plan del sitio"}</p>
            <button onClick={() => setEditando(null)}
              className="w-7 h-7 rounded-lg hover:bg-muted/60 flex items-center justify-center">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[11px] text-muted-foreground">Nombre que se muestra</Label>
              <Input value={editando.datos.nombre} onChange={e => campo("nombre", e.target.value)}
                placeholder="500 Mbps" className="h-9 text-sm rounded-xl" maxLength={60} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Categoría</Label>
              <div className="flex gap-1.5">
                {CATEGORIAS_WEB.map(c => (
                  <button key={c.id} onClick={() => campo("categoria", c.id)}
                    className={`flex-1 h-9 rounded-xl text-[11.5px] font-semibold border transition-colors ${
                      editando.datos.categoria === c.id
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/30 hover:bg-muted/40"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Precio de oferta (CLP)</Label>
              <Input type="number" min={0} value={editando.datos.precio_oferta || ""}
                onChange={e => campo("precio_oferta", parseInt(e.target.value) || 0)}
                placeholder="11990" className="h-9 text-sm rounded-xl" />
              <p className="text-[10px] text-muted-foreground/40">Es el precio grande de la tarjeta.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Precio normal (después de la oferta)</Label>
              <Input type="number" min={0} value={editando.datos.precio_normal ?? ""}
                onChange={e => campo("precio_normal", e.target.value === "" ? null : parseInt(e.target.value))}
                placeholder="13990" className="h-9 text-sm rounded-xl" />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[11px] text-muted-foreground">Características — una por línea</Label>
              <textarea
                value={caracteristicasTexto}
                onChange={e => setCaracteristicasTexto(e.target.value)}
                rows={5}
                placeholder={"Velocidad simétrica\nSin límite de descarga\nRouter WiFi 5G incluido"}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
                Hasta {MAX_CARACTERISTICAS} bullets de 80 caracteres. Con más, la tarjeta crece y se
                desalinea de las que tiene al lado.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between py-1 border-t border-border/20 pt-3">
            <div>
              <Label className="text-[12px] font-semibold">Mostrar en el sitio</Label>
              <p className="text-[10px] text-muted-foreground/50">Si lo apagás, no aparece en la web (queda guardado acá)</p>
            </div>
            <Switch checked={editando.datos.activo} onCheckedChange={v => campo("activo", v)} />
          </div>

          <div className="flex gap-2">
            <Button onClick={guardar} disabled={guardando} className="rounded-xl gap-2 flex-1">
              {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Publicar
            </Button>
            <Button variant="outline" onClick={() => setEditando(null)} className="rounded-xl">
              Cancelar
            </Button>
          </div>
        </div>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-5 min-w-0">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-base font-bold">Sitio web</h3>
          <p className="text-[12px] text-muted-foreground/60 leading-relaxed max-w-xl">
            Lo que se publica en la página de la empresa. Es independiente de «Planes y precios»:
            lo que saques de acá <strong>no</strong> cambia lo que cotiza el agente, y al revés.
          </p>
          <a href={sitio} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11.5px] text-primary hover:underline mt-1.5">
            Ver el sitio <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <Button size="sm" className="rounded-xl gap-1.5 flex-shrink-0" onClick={abrirNuevo}>
          <Plus className="w-3.5 h-3.5" /> Nuevo plan
        </Button>
      </div>

      {/* Aviso de estado */}
      <div className="rounded-xl border border-border/25 bg-card/30 px-3 py-2.5 flex items-center gap-2.5">
        <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
        <p className="text-[11.5px] text-muted-foreground/70">
          {activos} plan{activos === 1 ? "" : "es"} publicado{activos === 1 ? "" : "s"} de {planes.length}.
          Los desactivados quedan guardados acá pero no se muestran en la web.
        </p>
      </div>

      {/* Planes por categoría */}
      {CATEGORIAS_WEB.map(({ id, label }) => {
        const delGrupo = planes.filter(p => p.categoria === id).sort((a, b) => a.orden - b.orden);
        if (delGrupo.length === 0) return null;
        const Icon = ICONO[id];
        return (
          <div key={id} className="space-y-1.5">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/50 flex items-center gap-1.5">
              <Icon className="w-3 h-3" /> {label}
            </p>
            {/* Dos columnas: con una sola, cinco planes empujaban la vista previa
                fuera de la pantalla y había que bajar para ver el efecto. */}
            <div className="grid sm:grid-cols-2 gap-1.5 items-start">
            {delGrupo.map((p) => (
              <div key={p.id} className={editando?.id === p.id ? "sm:col-span-2" : ""}>
              <div
                className={`rounded-xl border px-3 py-2 flex items-center gap-2 ${
                  p.activo ? "border-border/25 bg-card/40" : "border-border/15 bg-card/20 opacity-55"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold truncate">{p.nombre}</span>
                    {p.etiqueta && (
                      <span className="text-[10px] font-bold px-1.5 py-px rounded bg-primary/15 text-primary">
                        {p.etiqueta}
                      </span>
                    )}
                    {p.canales != null && (
                      <span className="text-[10px] font-medium px-1.5 py-px rounded bg-muted/50 text-muted-foreground/70">
                        {p.canales} canales
                      </span>
                    )}
                    {!p.activo && <span className="text-[10px] text-muted-foreground/50">no se muestra</span>}
                  </div>
                  <p className="text-[11.5px] text-muted-foreground/70 tabular-nums mt-0.5">
                    <span className="font-bold text-emerald-500">{clp(p.precio_oferta)}</span>
                    {p.precio_normal != null && (
                      <>
                        <span className="mx-1.5 text-muted-foreground/30">·</span>
                        después {clp(p.precio_normal)}
                      </>
                    )}
                    {p.caracteristicas?.length ? (
                      <>
                        <span className="mx-1.5 text-muted-foreground/30">·</span>
                        {p.caracteristicas.length} características
                      </>
                    ) : null}
                  </p>
                </div>

                <button onClick={() => abrirEdicion(p)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                    editando?.id === p.id ? "bg-primary/15 text-primary" : "hover:bg-muted/60 text-muted-foreground/70"}`}
                  aria-label={editando?.id === p.id ? `Cerrar ${p.nombre}` : `Editar ${p.nombre}`}>
                  {editando?.id === p.id ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                </button>
                {confirmandoBorrado === p.id ? (
                  <button onClick={() => borrar(p)}
                    className="h-8 px-2.5 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive text-[11px] font-bold flex-shrink-0">
                    ¿Eliminar?
                  </button>
                ) : (
                  <button onClick={() => setConfirmandoBorrado(p.id)}
                    className="w-8 h-8 rounded-lg hover:bg-destructive/10 flex items-center justify-center flex-shrink-0"
                    aria-label={`Eliminar ${p.nombre}`}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                  </button>
                )}
              </div>
              {editando?.id === p.id && formulario()}
              </div>
            ))}
            </div>
          </div>
        );
      })}

      {/* Un plan nuevo no cuelga de ninguna fila: va al final de la lista. */}
      {editando && !editando.id && formulario()}

      {planes.length === 0 && (
        <p className="text-[12px] text-muted-foreground/50 text-center py-8">
          Todavía no hay planes cargados: la web muestra los que tenga el código mientras tanto.
        </p>
      )}

      {/* Botones y datos de contacto */}
      <div className="rounded-2xl border border-border/25 bg-card/30 p-4 space-y-3">
        <div>
          <p className="text-[13px] font-bold">Botones y datos de contacto</p>
          <p className="text-[11.5px] text-muted-foreground/60 leading-relaxed">
            Los links a los que apuntan los botones de la web y los datos que se muestran en el pie.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[11px] text-muted-foreground">Dirección del sitio</Label>
            <Input value={ajustes.sitio_url} onChange={e => setAjustes(a => ({ ...a, sitio_url: e.target.value }))}
              placeholder="https://tuempresa.cl" className="h-9 text-sm rounded-xl" />
            <p className="text-[10px] text-muted-foreground/40">
              De dónde sale la vista previa de más abajo. Sin barra al final.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[11px] text-muted-foreground">Link de «Paga tu cuenta»</Label>
            <Input value={ajustes.link_pago} onChange={e => setAjustes(a => ({ ...a, link_pago: e.target.value }))}
              placeholder="https://clientes.tuempresa.cl/isppay/" className="h-9 text-sm rounded-xl" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[11px] text-muted-foreground">Link de «Sucursal Virtual»</Label>
            <Input value={ajustes.link_sucursal} onChange={e => setAjustes(a => ({ ...a, link_sucursal: e.target.value }))}
              placeholder="https://clientes.tuempresa.cl/cliente/login" className="h-9 text-sm rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">WhatsApp (link)</Label>
            <Input value={ajustes.whatsapp} onChange={e => setAjustes(a => ({ ...a, whatsapp: e.target.value }))}
              placeholder="https://wa.me/56900000000" className="h-9 text-sm rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Teléfono (como se muestra)</Label>
            <Input value={ajustes.telefono} onChange={e => setAjustes(a => ({ ...a, telefono: e.target.value }))}
              placeholder="+56 9 0000 0000" className="h-9 text-sm rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Correo de contacto</Label>
            <Input value={ajustes.correo} onChange={e => setAjustes(a => ({ ...a, correo: e.target.value }))}
              placeholder="contacto@tuempresa.cl" className="h-9 text-sm rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Meses de la oferta</Label>
            <Input type="number" min={1} max={36} value={ajustes.meses_oferta}
              onChange={e => setAjustes(a => ({ ...a, meses_oferta: e.target.value }))}
              placeholder="6" className="h-9 text-sm rounded-xl" />
            <p className="text-[10px] text-muted-foreground/40">Se usa en el «Oferta por N meses» del inicio.</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Los cambios se publican directo: no hay borrador. Se ven en el sitio apenas alguien
            recarga la página. Si algo sale mal, el contenido anterior se puede volver a cargar a mano.
          </p>
        </div>

        <Button onClick={guardarLinks} disabled={guardandoAjustes} className="rounded-xl gap-2 w-full sm:w-auto">
          {guardandoAjustes && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Guardar botones y datos
        </Button>
      </div>
      </div>

      {/*
       * La página de verdad, abajo y a lo ancho.
       *
       * Al costado entraba a la mitad del ancho y había que adivinar cómo se vería
       * de verdad. Una página se mira con la forma que tiene, así que va completa
       * debajo del editor.
       */}
      <div className="min-w-0">
        {sitio ? (
          <VistaPrevia sitio={sitio} planes={planesParaVista} ajustes={ajustes} listoParaBorrador={false} />
        ) : (
          <div className="rounded-xl border border-dashed border-border/40 px-4 py-8 text-center">
            <p className="text-[12.5px] text-muted-foreground/70">
              Falta la dirección del sitio para mostrar la vista previa.
            </p>
            <p className="text-[11px] text-muted-foreground/45 mt-1">
              Se carga más arriba, en «Botones y datos de contacto».
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
