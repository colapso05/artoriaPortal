import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, Loader2, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

/**
 * ¿El agente ya lee estos valores?
 *
 * Hoy no: la tabla está poblada pero el agente sigue con los precios que tiene
 * escritos en su configuración. Mientras sea false la pantalla lo dice, porque
 * alguien que cambia un precio acá y no ve cambiar las respuestas del agente va a
 * pensar que algo está roto. Cuando el backend conecte la lectura, se pone en true.
 */
const AGENTE_LEE_VALORES = false;

interface Valor {
  id: number;
  tipo: "precio" | "politica" | "cobertura";
  clave: string | null;
  etiqueta: string | null;
  texto: string;
  nota_agente: string | null;
  activo: boolean;
}

/** Solo estos tipos se muestran. `valor` es un volcado viejo y `texto_aprobado` no se edita desde acá. */
const TIPOS: { tipo: Valor["tipo"]; titulo: string; ayuda: string }[] = [
  { tipo: "precio", titulo: "Precios", ayuda: "Montos que el agente cotiza a tus clientes." },
  { tipo: "politica", titulo: "Políticas", ayuda: "Reglas del negocio que el agente aplica y explica." },
  { tipo: "cobertura", titulo: "Cobertura", ayuda: "Lo que el agente dice sobre las zonas donde llegas." },
];

/**
 * `montoEdit` guarda lo que se está escribiendo en un campo de monto, por posición del
 * monto dentro del texto. Existe para poder dejar el campo vacío un momento mientras se
 * escribe otro valor, sin que el campo se regenere solo desde el texto. Un campo vacío
 * bloquea el guardado.
 */
type Borrador = { texto: string; nota: string; activo: boolean; montoEdit: Record<number, string> };

/** "pago_adelantado" → "Pago adelantado", para cuando una fila no trae etiqueta. */
const humanizar = (clave: string | null) =>
  clave ? clave.replace(/_/g, " ").replace(/^./, c => c.toUpperCase()) : "Sin nombre";

/**
 * Los montos en pesos que aparecen en el texto ("$15.990"). El punto de miles va dentro
 * del monto; el punto final de una oración no.
 */
const RE_MONTO = /\$\s?\d+(?:\.\d{3})*/g;
const montosDe = (texto: string) =>
  Array.from(texto.matchAll(RE_MONTO)).map(m => ({ literal: m[0], digitos: m[0].replace(/\D/g, ""), desde: m.index ?? 0 }));

/** "15990" → "15.990" */
const conMiles = (digitos: string) =>
  digitos.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Cambia solo el monto número `i` del texto, sin tocar el resto de lo escrito. */
const conMontoCambiado = (texto: string, i: number, digitos: string) => {
  const m = montosDe(texto)[i];
  if (!m) return texto;
  const signo = /^\$\s?/.exec(m.literal)?.[0] ?? "$";
  return texto.slice(0, m.desde) + signo + conMiles(digitos) + texto.slice(m.desde + m.literal.length);
};

/** El primer monto del texto, para mostrarlo destacado en el encabezado del precio. */
const montoDe = (texto: string) => montosDe(texto)[0]?.literal.replace(/\s/g, "") ?? null;

/**
 * Los precios y las políticas que el agente usa al responder, editables por la empresa.
 *
 * Qué se edita y qué no:
 *   · `texto` es el valor en sí, lo que el agente lee. Es lo editable.
 *   · `nota_agente` es opcional: una instrucción extra para el agente sobre ese valor.
 *   · `activo` apaga un valor sin borrarlo.
 *   · `clave` es el identificador con el que el sistema encuentra el valor. No se
 *     muestra ni se edita: si cambiara, el agente dejaría de encontrarlo.
 *
 * Todo lo que se escribe acá lo lee el agente tal cual, así que la pantalla lo
 * advierte y las filas solo se editan con permiso de administrador.
 */
export default function ValoresEmpresa({ companyId, puedeEditar }: { companyId: string; puedeEditar: boolean }) {
  const { toast } = useToast();
  const [filas, setFilas] = useState<Valor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Filas de la empresa de otros tipos (`valor`, `texto_aprobado`) que no se editan acá. */
  const [otros, setOtros] = useState(0);
  const [borradores, setBorradores] = useState<Record<number, Borrador>>({});
  const [guardando, setGuardando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: e } = await (supabase as any)
      .from("company_valores")
      .select("id, tipo, clave, etiqueta, texto, nota_agente, activo")
      .eq("company_id", companyId)
      .order("etiqueta", { ascending: true });
    if (e) { setError(e.message); setFilas([]); return; }
    // Se pide todo y se separa acá: si la tabla trae tipos que esta pantalla no
    // muestra, se puede decir cuántos hay en vez de afirmar que está vacía.
    const todas = (data ?? []) as Valor[];
    const visibles = TIPOS.map(t => t.tipo as string);
    setFilas(todas.filter(f => visibles.includes(f.tipo)));
    setOtros(todas.length - todas.filter(f => visibles.includes(f.tipo)).length);
    setBorradores({});
  }, [companyId]);

  useEffect(() => { cargar(); }, [cargar]);

  const original = (v: Valor): Borrador => ({ texto: v.texto, nota: v.nota_agente ?? "", activo: v.activo, montoEdit: {} });
  const actual = (v: Valor): Borrador => borradores[v.id] ?? original(v);
  const hayCambio = (v: Valor) => {
    const a = actual(v), o = original(v);
    return a.texto !== o.texto || a.nota !== o.nota || a.activo !== o.activo || Object.keys(a.montoEdit).length > 0;
  };
  /** Cambia un monto desde su campo propio y reescribe el texto con el valor nuevo. */
  const editarMonto = (v: Valor, i: number, escrito: string) => {
    const digitos = escrito.replace(/\D/g, "").slice(0, 9);
    const b = actual(v);
    if (digitos === "") { editar(v, { montoEdit: { ...b.montoEdit, [i]: "" } }); return; }
    const { [i]: _quitado, ...resto } = b.montoEdit;
    editar(v, { texto: conMontoCambiado(b.texto, i, digitos), montoEdit: resto });
  };
  const editar = (v: Valor, cambio: Partial<Borrador>) =>
    setBorradores(prev => ({ ...prev, [v.id]: { ...actual(v), ...cambio } }));
  const descartar = (v: Valor) =>
    setBorradores(prev => { const n = { ...prev }; delete n[v.id]; return n; });

  const guardar = async (v: Valor) => {
    const b = actual(v);
    const texto = b.texto.trim();
    // `texto` es NOT NULL en la base y es lo que el agente lee: vacío lo dejaría sin valor.
    if (!texto) {
      toast({ title: "El valor no puede quedar vacío", description: "Si no quieres que el agente lo use, apágalo con el interruptor.", variant: "destructive" });
      return;
    }
    if (Object.values(b.montoEdit).some(m => m === "")) {
      toast({ title: "Falta el precio", description: "Escribe el monto antes de guardar.", variant: "destructive" });
      return;
    }
    // Un precio que tenía monto no puede quedarse sin él por haber editado el texto.
    if (v.tipo === "precio" && montosDe(v.texto).length > 0 && montosDe(texto).length === 0) {
      toast({ title: "El precio no puede desaparecer", description: "El texto de un precio debe incluir su monto. Cámbialo en el campo Precio.", variant: "destructive" });
      return;
    }
    setGuardando(v.id);
    // Con el filtro de empresa además del id, y pidiendo la fila de vuelta: una política de
    // permisos que bloquea la escritura no da error, solo actualiza cero filas.
    const { data, error: e } = await (supabase as any)
      .from("company_valores")
      .update({ texto, nota_agente: b.nota.trim() || null, activo: b.activo })
      .eq("id", v.id)
      .eq("company_id", companyId)
      .select("id");
    setGuardando(null);
    if (e || !data || data.length === 0) {
      toast({
        title: "No se pudo guardar",
        description: e ? e.message : "No tienes permiso para editar este valor.",
        variant: "destructive",
      });
      return;
    }
    setFilas(prev => (prev ?? []).map(f => f.id === v.id
      ? { ...f, texto, nota_agente: b.nota.trim() || null, activo: b.activo } : f));
    descartar(v);
    toast({ title: "Guardado", description: `«${v.etiqueta || humanizar(v.clave)}» actualizado.` });
  };

  const grupos = useMemo(
    () => TIPOS.map(t => ({ ...t, filas: (filas ?? []).filter(f => f.tipo === t.tipo) })).filter(g => g.filas.length > 0),
    [filas],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Valores y políticas</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Los precios y las reglas que el agente usa cuando responde a tus clientes.
        </p>
      </div>

      <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-[12.5px] leading-relaxed">
          <strong>Lo que escribas acá lo lee el agente tal cual.</strong> Cambiar un precio o una política cambia
          lo que el agente le dice a tus clientes. Revisa bien antes de guardar.
        </p>
      </div>

      {!AGENTE_LEE_VALORES && (
        <div className="rounded-xl border border-border/30 bg-muted/20 px-4 py-3 flex items-start gap-3">
          <Info className="w-4 h-4 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Los cambios se guardan, pero <strong className="text-foreground/80">el agente todavía no usa estos valores</strong>:
            sigue respondiendo con los precios que tiene configurados. Empezará a leerlos cuando se conecte.
          </p>
        </div>
      )}

      {!puedeEditar && (
        <p className="text-[12px] text-muted-foreground/70">Solo un administrador puede editar estos valores.</p>
      )}

      {filas === null ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary/40" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12.5px]">
          No se pudieron cargar los valores: <span className="text-muted-foreground">{error}</span>
        </div>
      ) : grupos.length === 0 ? (
        <div className="py-8 text-center space-y-1.5">
          <p className="text-sm text-muted-foreground/70">No hay precios, políticas ni cobertura cargados para esta empresa.</p>
          <p className="text-[11.5px] text-muted-foreground/50 max-w-md mx-auto leading-relaxed">
            {otros > 0
              ? `La tabla tiene ${otros} fila${otros === 1 ? "" : "s"} de otros tipos que no se editan desde acá. Los precios y políticas deben cargarse con tipo «precio», «politica» o «cobertura».`
              : "Si ya hay filas cargadas y no aparecen, la base no está dejando leerlas con este usuario (permisos), o están guardadas con otra empresa."}
          </p>
        </div>
      ) : (
        grupos.map(g => (
          <section key={g.tipo} className="space-y-3">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">{g.titulo}</h3>
              <p className="text-[12px] text-muted-foreground/60">{g.ayuda}</p>
            </div>

            {g.filas.map(v => {
              const b = actual(v);
              const cambia = hayCambio(v);
              const monto = v.tipo === "precio" ? montoDe(b.texto) : null;
              const montos = v.tipo === "precio" ? montosDe(b.texto) : [];
              const montosOriginales = montosDe(v.texto);
              return (
                <div key={v.id} className={`rounded-xl border p-4 space-y-3 transition-colors ${
                  cambia ? "border-primary/40 bg-primary/[0.04]" : "border-border/25 bg-card/40"} ${b.activo ? "" : "opacity-70"}`}>
                  <div className="flex items-center gap-3">
                    <h4 className="text-[14px] font-bold flex-1 min-w-0 truncate">{v.etiqueta || humanizar(v.clave)}</h4>
                    {monto && (
                      <span className="text-[13px] font-black tabular-nums px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500">{monto}</span>
                    )}
                    <label className="flex items-center gap-2 text-[11px] text-muted-foreground/70 flex-shrink-0">
                      {b.activo ? "El agente lo usa" : "Apagado"}
                      <Switch checked={b.activo} disabled={!puedeEditar} onCheckedChange={c => editar(v, { activo: c })} />
                    </label>
                  </div>

                  {montos.length > 0 && (
                    <div className="flex flex-wrap gap-x-5 gap-y-3">
                      {montos.map((m, i) => {
                        const escrito = b.montoEdit[i];
                        const vacio = escrito === "";
                        const antes = montosOriginales[i]?.digitos;
                        const cambio = antes != null && !vacio && m.digitos !== antes;
                        return (
                          <div key={i} className="space-y-1.5">
                            <label className="text-[11px] text-muted-foreground">
                              {montos.length > 1 ? `Precio ${i + 1}` : "Precio"} <span className="text-muted-foreground/50">(CLP)</span>
                            </label>
                            <div className="relative w-40">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60 pointer-events-none">$</span>
                              <Input inputMode="numeric" value={vacio ? "" : conMiles(escrito ?? m.digitos)}
                                disabled={!puedeEditar} placeholder="0"
                                onChange={e => editarMonto(v, i, e.target.value)}
                                className={`h-10 pl-7 text-[15px] font-bold tabular-nums ${vacio ? "border-red-500/60" : ""}`} />
                            </div>
                            {vacio && <p className="text-[10.5px] text-red-500">Escribe el monto</p>}
                            {cambio && <p className="text-[10.5px] text-amber-600 dark:text-amber-400 tabular-nums">Antes: ${conMiles(antes)}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-muted-foreground">
                      {montos.length > 0 ? "Descripción que lee el agente" : "Lo que lee el agente"}
                    </label>
                    <Textarea value={b.texto} disabled={!puedeEditar} rows={3}
                      onChange={e => editar(v, { texto: e.target.value })} className="text-sm resize-y min-h-[72px]" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      Nota para el agente <span className="text-muted-foreground/50">(opcional)</span>
                    </label>
                    <Textarea value={b.nota} disabled={!puedeEditar} rows={2}
                      placeholder="Algo extra que el agente deba tener en cuenta sobre esto."
                      onChange={e => editar(v, { nota: e.target.value })} className="text-sm resize-y min-h-[56px]" />
                    <p className="text-[10.5px] text-amber-600/80 dark:text-amber-400/80 leading-snug">
                      El agente la lee como una instrucción, no como información: lo que pongas acá cambia cómo se comporta.
                    </p>
                  </div>

                  {puedeEditar && cambia && (
                    <div className="flex gap-2 justify-end pt-1">
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => descartar(v)} disabled={guardando === v.id}>
                        <Undo2 className="w-3.5 h-3.5" /> Descartar
                      </Button>
                      <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => guardar(v)} disabled={guardando === v.id}>
                        {guardando === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Guardar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
