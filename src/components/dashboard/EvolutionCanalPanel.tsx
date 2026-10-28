import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Smartphone, Loader2, QrCode, RefreshCw, Unlink, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  evolutionEstado, evolutionVincular, fijarCanalDefault,
  ES_PROVEEDOR, type EstadoEvolution, type Proveedor,
} from "@/lib/canalSalida";

/**
 * Cuántos códigos se pueden pedir seguidos.
 *
 * Evolution corta la instancia a los 10 intentos, así que se para antes con margen:
 * quedarse sin poder vincular por haber gastado los intentos es peor que tener que
 * cerrar el modal y empezar de nuevo.
 */
const MAX_INTENTOS = 8;
const SEGUNDOS_QR = 60;
const MS_POLL = 3000;

export default function EvolutionCanalPanel({ companyId, puedeCambiarDefault = false }: {
  companyId: string | null;
  /** Cambiar el default afecta todos los chats y la factura: solo administradores. */
  puedeCambiarDefault?: boolean;
}) {
  const { toast } = useToast();
  const [estado, setEstado] = useState<EstadoEvolution | null>(null);
  const [canalDefault, setCanalDefault] = useState<Proveedor | null>(null);
  const [canalEfectivo, setCanalEfectivo] = useState<Proveedor | null>(null);
  const [guardandoDefault, setGuardandoDefault] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [pidiendoQr, setPidiendoQr] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [intentos, setIntentos] = useState(0);
  const [confirmarDesvincular, setConfirmarDesvincular] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const modalRef = useRef(false);

  const refrescar = useCallback(async () => {
    if (!companyId) return null;
    const e = await evolutionEstado(companyId);
    setEstado(e);
    if (ES_PROVEEDOR(e.canal_default)) setCanalDefault(e.canal_default);
    // canal_efectivo viene del backend en vez de deducirse de tres campos: si el
    // default es "evolution" y la sesión está caída, dice "ycloud" directamente.
    if (ES_PROVEEDOR(e.canal_efectivo)) setCanalEfectivo(e.canal_efectivo);
    return e;
  }, [companyId]);

  const cambiarDefault = async (p: Proveedor) => {
    if (!companyId || p === canalDefault) return;
    setGuardandoDefault(true);
    const r = await fijarCanalDefault(companyId, p);
    setGuardandoDefault(false);

    if (!r.ok) {
      toast({
        title: "No se pudo guardar",
        description: r.error === "sin_permiso"
          ? "Solo un administrador puede cambiar el canal por defecto."
          : r.error,
        variant: "destructive",
      });
      return;
    }
    setCanalDefault(r.provider ?? p);
    // El default queda guardado igual, pero si la sesión está caída lo que sale de
    // verdad sigue siendo el oficial. El backend lo dice en sesion_activa.
    setCanalEfectivo(p === "evolution" && r.sesion_activa === false ? "ycloud" : p);
    toast(r.aviso
      ? { title: "Guardado, con una advertencia", description: r.aviso }
      : { title: "Canal por defecto actualizado" });
  };

  useEffect(() => { refrescar(); }, [refrescar]);

  // Mientras el modal está abierto se consulta el estado cada 3 s: el escaneo ocurre
  // en el teléfono y no hay forma de enterarse desde acá si no se pregunta.
  useEffect(() => {
    modalRef.current = modalAbierto;
    if (!modalAbierto) return;
    const t = setInterval(async () => {
      const e = await refrescar();
      if (e?.state === "open") {
        setModalAbierto(false);
        setQr(null);
        toast({ title: "Canal vinculado", description: e.numero ? `Conectado con ${e.numero}.` : "La sesión quedó activa." });
      }
    }, MS_POLL);
    return () => clearInterval(t);
  }, [modalAbierto, refrescar, toast]);

  // Cuenta regresiva del código. Al llegar a cero no se pide otro solo: hacerlo en
  // bucle gastaría los intentos que Evolution permite antes de cortar.
  useEffect(() => {
    if (!modalAbierto || segundos <= 0) return;
    const t = setTimeout(() => setSegundos(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [modalAbierto, segundos]);

  const pedirQr = async () => {
    if (!companyId || intentos >= MAX_INTENTOS) return;
    setPidiendoQr(true);
    const r = await evolutionVincular(companyId, "connect");
    setPidiendoQr(false);

    if (!r.ok) {
      toast({ title: "No se pudo generar el código", description: r.error, variant: "destructive" });
      return;
    }
    if (r.yaVinculado) {
      setModalAbierto(false);
      refrescar();
      toast({ title: "Ya estaba vinculado", description: "La sesión sigue activa." });
      return;
    }
    setQr(r.qr ?? null);
    setSegundos(r.expiraEnSegundos ?? SEGUNDOS_QR);
    setIntentos(n => n + 1);
  };

  const abrirModal = async () => {
    setIntentos(0);
    setQr(null);
    setSegundos(0);
    setModalAbierto(true);
    await pedirQr();
  };

  const desvincular = async () => {
    if (!companyId) return;
    setConfirmarDesvincular(false);
    setTrabajando(true);
    const r = await evolutionVincular(companyId, "logout");
    setTrabajando(false);
    await refrescar();
    toast(r.ok
      ? { title: "Canal desvinculado", description: "Los mensajes vuelven a salir por el canal oficial." }
      : { title: "No se pudo desvincular", description: r.error, variant: "destructive" });
  };

  const reiniciar = async () => {
    if (!companyId) return;
    setTrabajando(true);
    const r = await evolutionVincular(companyId, "restart");
    setTrabajando(false);
    await refrescar();
    toast(r.ok
      ? { title: "Sesión reiniciada", description: "Revisa el estado en unos segundos." }
      : { title: "No se pudo reiniciar", description: r.error, variant: "destructive" });
  };

  // Empresa sin el canal contratado: no hay nada que configurar y no se muestra nada.
  if (!estado || !estado.enabled) return null;

  const vinculada = estado.state === "open";
  const conectando = estado.state === "connecting";

  return (
    <div className="rounded-2xl border border-border/30 bg-card/40 p-5 mb-6">
      <div className="flex items-start gap-3 flex-wrap">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${vinculada ? "bg-emerald-500/15" : "bg-amber-500/15"}`}>
          <Smartphone className={`w-5 h-5 ${vinculada ? "text-emerald-500" : "text-amber-500"}`} />
        </div>

        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-bold">WhatsApp sin costo</h3>
            <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
              vinculada
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : conectando
                  ? "border-sky-500/40 bg-sky-500/15 text-sky-500"
                  : "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400"
            }`}>
              {vinculada ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
              {vinculada ? "Vinculado" : conectando ? "Esperando escaneo" : "Desconectado"}
            </span>
          </div>

          <p className="text-[12px] text-muted-foreground/80 leading-relaxed mt-1">
            {vinculada
              ? <>Los mensajes de la bandeja pueden salir sin costo por esta sesión{estado.numero ? <> desde <strong>{estado.numero}</strong></> : null}.</>
              : "Mientras esté desconectado, todos los mensajes salen por el canal oficial y cuestan alrededor de $20 cada uno."}
          </p>

          {estado.desde && (
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">
              {vinculada ? "Vinculado" : "Sin sesión"} {formatDistanceToNow(new Date(estado.desde), { addSuffix: true, locale: es })}
            </p>
          )}

          {/* Se va a caer sola más de una vez, y por dos motivos que no se arreglan
              igual. Distinguirlos acá le ahorra al operador reintentar un QR que no
              va a resolver nada. */}
          <div className="text-[11px] text-muted-foreground/50 mt-2 leading-relaxed space-y-1">
            <p>
              Esta sesión se cae sola cada tanto. Hay dos casos y no se arreglan igual:
            </p>
            <p>
              <strong className="text-foreground/70">WhatsApp desvinculó el teléfono</strong> —
              se ve como «Desconectado» y se recupera escaneando el código de nuevo. Es lo
              habitual y toma medio minuto.
            </p>
            <p>
              <strong className="text-foreground/70">WhatsApp cambió su protocolo</strong> —
              el código se escanea y la sesión igual no conecta. Ahí no hay nada que hacer
              desde acá: hay que esperar la actualización. Mientras tanto todo sale por el
              canal oficial, que sigue funcionando normal.
            </p>
          </div>

          {/* La versión instalada. Solo se pinta si el backend la expone: inventar un
              «desconocida» sería peor que no mostrar la línea. */}
          {estado.version && (
            <p className="text-[11px] text-muted-foreground/40 mt-2">
              Evolution <span className="font-mono text-muted-foreground/60">{estado.version}</span>
              {estado.actualizado_en && (
                <> · actualizado {formatDistanceToNow(new Date(estado.actualizado_en), { addSuffix: true, locale: es })}</>
              )}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0">
          <Button size="sm" onClick={abrirModal} disabled={trabajando} className="h-9 gap-1.5 text-[11px] font-bold">
            <QrCode className="w-3.5 h-3.5" />
            {vinculada ? "Vincular otro teléfono" : "Vincular teléfono"}
          </Button>
          {vinculada && (
            <Button
              size="sm" variant="outline" disabled={trabajando}
              onClick={() => setConfirmarDesvincular(true)}
              className="h-9 gap-1.5 text-[11px] font-bold text-red-500 border-red-500/25 hover:bg-red-500/10"
            >
              <Unlink className="w-3.5 h-3.5" /> Desvincular
            </Button>
          )}
          {!vinculada && (
            /* Para soporte: sirve cuando la sesión queda rara sin llegar a caerse. */
            <button
              onClick={reiniciar}
              disabled={trabajando}
              className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground underline underline-offset-2 disabled:opacity-50"
            >
              Reiniciar sesión (soporte)
            </button>
          )}
        </div>
      </div>

      {/* ── Aviso permanente ──
          Va escrito y no en la cabeza de nadie: el día que el canal se caiga por
          días, esto es lo que evita que parezca una falla del portal. */}
      <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/[0.07] p-3.5">
        <p className="text-[11px] font-black uppercase tracking-wider text-red-500 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Importante — es un complemento, no el canal principal
        </p>
        <div className="text-[11.5px] text-muted-foreground/80 leading-relaxed mt-2 space-y-1.5">
          <p>
            Este canal usa una sesión de WhatsApp Web, no la API oficial de Meta. Cuando
            WhatsApp cambia su protocolo interno, el canal deja de funcionar hasta que se
            publique y se aplique una actualización. Eso puede tomar{" "}
            <strong className="text-foreground/85">desde algunas horas hasta varios días</strong>,
            y no depende de nosotros.
          </p>
          <p>
            <strong className="text-foreground/85">La actualización no es automática</strong>:
            hay que aplicarla a mano en el servidor.
          </p>
          <p>
            Mientras tanto la API oficial sigue funcionando con normalidad. Nunca dependas de
            este canal como única vía de contacto con tus clientes.
          </p>
        </div>
      </div>

      {/* ── Canal por defecto de la empresa ──
          Vive acá y no en cada chat: los operadores no tienen que decidirlo mensaje
          a mensaje, y esta elección afecta a la factura de toda la empresa. */}
      {puedeCambiarDefault && (
        <div className="mt-4 pt-4 border-t border-border/25">
          <p className="text-[12px] font-bold">Por dónde se responde por defecto</p>
          <p className="text-[11.5px] text-muted-foreground/75 leading-relaxed mt-0.5 mb-2.5">
            Se aplica a todos los chats de la empresa. Un operador puede cambiarlo en una
            conversación puntual desde el menú del chat.
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            {(["ycloud", "evolution"] as const).map(p => {
              const elegido = canalDefault === p;
              return (
                <button
                  key={p}
                  onClick={() => cambiarDefault(p)}
                  disabled={guardandoDefault}
                  className={`px-3 py-2 rounded-xl border text-left transition-colors disabled:opacity-60 ${
                    elegido
                      ? p === "evolution"
                        ? "border-emerald-500/60 bg-emerald-500/15"
                        : "border-primary/60 bg-primary/15"
                      : "border-border/40 hover:bg-muted/50"
                  }`}
                >
                  <span className="block text-[12px] font-bold">
                    {p === "ycloud" ? "Canal oficial" : "WhatsApp sin costo"}
                  </span>
                  <span className="block text-[10.5px] text-muted-foreground/70">
                    {p === "ycloud" ? "~$20 por mensaje" : "Gratis, mientras esté vinculado"}
                  </span>
                </button>
              );
            })}
            {guardandoDefault && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/50" />}
          </div>

          {canalDefault && canalEfectivo && canalDefault !== canalEfectivo && (
            <p className="text-[11px] text-amber-500 mt-2 leading-relaxed">
              Está elegido el canal sin costo, pero ahora mismo los mensajes salen por el
              oficial y sí se cobran. Vuelve a vincular el teléfono para que se aplique.
            </p>
          )}
        </div>
      )}

      {/* ── Modal del QR ── */}
      <Dialog open={modalAbierto} onOpenChange={(op) => { setModalAbierto(op); if (!op) setQr(null); }}>
        <DialogContent className="bg-card border-border/30 max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Vincular WhatsApp</DialogTitle>
          </DialogHeader>

          {/* La ruta exacta en el teléfono. Es donde la gente se pierde: el código no
              se escanea desde la cámara ni desde WhatsApp normal. */}
          <ol className="text-[12.5px] text-muted-foreground/90 leading-relaxed space-y-1 list-decimal pl-4">
            <li>Abre <strong>WhatsApp Business</strong> en el teléfono.</li>
            <li>Toca el menú <strong>⋮</strong> y entra a <strong>Dispositivos vinculados</strong>.</li>
            <li>Toca <strong>Vincular un dispositivo</strong> y escanea este código.</li>
          </ol>

          <div className="flex flex-col items-center gap-3 py-2">
            <div className="w-56 h-56 rounded-2xl border border-border/40 bg-white flex items-center justify-center overflow-hidden">
              {pidiendoQr ? (
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/40" />
              ) : qr ? (
                <img src={qr} alt="Código QR para vincular WhatsApp" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[12px] text-muted-foreground/50 px-6 text-center">
                  El código venció. Pide uno nuevo.
                </span>
              )}
            </div>

            {qr && segundos > 0 ? (
              <p className="text-[12px] text-muted-foreground">
                El código vence en <strong className="tabular-nums">{segundos}s</strong>
              </p>
            ) : (
              <p className="text-[12px] text-amber-500 font-medium">Código vencido</p>
            )}

            <Button
              variant="outline" size="sm"
              onClick={pedirQr}
              disabled={pidiendoQr || intentos >= MAX_INTENTOS}
              className="h-8 gap-1.5 text-[11px] font-semibold"
            >
              {pidiendoQr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Generar otro código
            </Button>

            {intentos >= MAX_INTENTOS ? (
              /*
               * Gastar los ocho códigos sin conectar es la señal de la segunda caída:
               * si el QR resolviera, ya habría resuelto. Decirle «intenta más tarde»
               * lo deja reintentando algo que no depende de él.
               */
              <div className="text-[11px] text-center leading-relaxed max-w-[300px] space-y-1.5">
                <p className="text-amber-500 font-semibold">
                  Escaneaste varias veces y la sesión no conecta.
                </p>
                <p className="text-muted-foreground/70">
                  Cuando pasa esto no suele ser el teléfono: es que WhatsApp cambió su
                  protocolo y hace falta actualizar el servidor. No se arregla escaneando.
                  Avisa a soporte y sigue trabajando con el canal oficial mientras tanto.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground/50 text-center">
                En cuanto escanees, esta ventana se cierra sola.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarDesvincular} onOpenChange={setConfirmarDesvincular}>
        <AlertDialogContent className="border-border/30 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desvincular el canal sin costo?</AlertDialogTitle>
            <AlertDialogDescription>
              Desde ese momento todos los mensajes de la bandeja salen por el canal oficial,
              a unos $20 cada uno, hasta que alguien vuelva a escanear el código.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={desvincular} className="bg-red-500 hover:bg-red-600 text-white">
              Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
