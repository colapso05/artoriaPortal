import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePwaTecnicos } from "@/hooks/usePwaTecnicos";
import { supabase } from "@/integrations/supabase/client";
import { TecnicoLogin } from "@/components/tecnicos/TecnicoLogin";
import { TecnicoAgenda } from "@/components/tecnicos/TecnicoAgenda";
import { TecnicoDetalle } from "@/components/tecnicos/TecnicoDetalle";
import { TecnicoCierre } from "@/components/tecnicos/TecnicoCierre";
import {
  getTecnicoActual, loadAppointments, logoutTecnico, updateAppointmentStatus,
  completeAppointment, type Appointment, type Tecnico,
} from "@/lib/tecnicos/api";
import { iniciarPush, cerrarPush } from "@/lib/tecnicos/push";
import { useTemaTecnicos } from "@/lib/tecnicos/tema";
import { CITA_DEMO, esCitaDemo } from "@/lib/tecnicos/demo";
import {
  TecnicoTour, TOTAL_PASOS, tourPendiente, marcarTourVisto, vistaDelPaso,
} from "@/components/tecnicos/TecnicoTour";

type Vista = "agenda" | "detalle" | "cierre";

/**
 * Portal Técnicos — versión web (PWA) de la app Android `artoria-soporte`.
 * Pensado para instalarse desde el navegador, principalmente para técnicos con iPhone
 * que no pueden instalar el APK.
 */
export default function PortalTecnicos() {
  const { toast } = useToast();
  usePwaTecnicos();
  // El tema se aplica aquí y no en la agenda: al abrir una cita esa pantalla se
  // desmonta, y con ella se perdería el modo claro a mitad de flujo.
  const { tema, alternar: alternarTema } = useTemaTecnicos();

  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [tecnico, setTecnico] = useState<Tecnico | null>(null);

  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [past, setPast] = useState<Appointment[]>([]);
  const [cargandoAgenda, setCargandoAgenda] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  const [vista, setVista] = useState<Vista>("agenda");
  const [seleccionada, setSeleccionada] = useState<Appointment | null>(null);

  // Tour guiado: 0 = apagado, 1..TOTAL_PASOS = paso en curso.
  const [tourPaso, setTourPaso] = useState(0);
  const [agendaLista, setAgendaLista] = useState(false);
  const enTour = tourPaso > 0;

  // ── Sesión activa al abrir ─────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false;
    getTecnicoActual()
      .then(t => { if (!cancelado) setTecnico(t); })
      .catch(() => { /* sin sesión válida → login */ })
      .finally(() => { if (!cancelado) setCargandoSesion(false); });
    return () => { cancelado = true; };
  }, []);

  // ── Carga de la agenda ─────────────────────────────────────────────────
  const cargarAgenda = useCallback(async (opts: { silencioso?: boolean } = {}) => {
    if (!tecnico) return;
    if (opts.silencioso) setRefrescando(true); else setCargandoAgenda(true);
    try {
      const { upcoming: up, past: pa } = await loadAppointments(tecnico.id);
      setUpcoming(up);
      setPast(pa);
      // Mantener sincronizada la cita abierta (p. ej. si cambió de estado en el portal)
      setSeleccionada(prev => prev ? [...up, ...pa].find(a => a.id === prev.id) ?? prev : prev);
    } catch (e: any) {
      toast({ title: "No se pudo cargar la agenda", description: e?.message, variant: "destructive" });
    } finally {
      setCargandoAgenda(false);
      setRefrescando(false);
      setAgendaLista(true);
    }
  }, [tecnico, toast]);

  useEffect(() => { if (tecnico) cargarAgenda(); }, [tecnico, cargarAgenda]);

  /*
   * ── Reconexión al volver al portal ──────────────────────────────────────
   *
   * En el celular, cuando el técnico cambia de app o apaga la pantalla, el
   * sistema corta el WebSocket de realtime para ahorrar batería. Al volver, el
   * canal está muerto: no llega ningún cambio y la agenda se queda congelada
   * hasta que alguien recarga a mano. En la app Android no pasa porque su
   * ciclo de vida reconstruye la suscripción al reanudarse.
   *
   * Al volver al primer plano —o al recuperar la conexión— se recarga la agenda
   * y se incrementa este contador, que rehace el canal desde cero. Recargar
   * además cubre lo que haya pasado mientras el socket estaba caído: esos
   * cambios ya no los va a reenviar nadie.
   */
  const [reconexion, setReconexion] = useState(0);
  useEffect(() => {
    if (!tecnico) return;
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      cargarAgenda({ silencioso: true });
      setReconexion(n => n + 1);
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alVolver);
    };
  }, [tecnico, cargarAgenda]);

  // ── Realtime: citas nuevas o cambios desde el portal ───────────────────
  const notificadasRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!tecnico) return;
    const canal = supabase
      .channel(`tec-appointments-${tecnico.id}-${reconexion}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `technician_id=eq.${tecnico.id}` },
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            const appt = payload.new as Appointment;
            if (!notificadasRef.current.has(appt.id)) {
              notificadasRef.current.add(appt.id);
              toast({
                title: "📋 Nuevo trabajo asignado",
                description: `${appt.service_type ?? "Servicio"} con ${appt.client_name ?? "cliente"}`,
              });
            }
          }
          cargarAgenda({ silencioso: true });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [tecnico, cargarAgenda, toast, reconexion]);

  // ── Push (OneSignal): vincula este dispositivo con el técnico ──────────
  // Las notificaciones del sistema las entrega OneSignal desde el backend, así que
  // llegan aunque el portal esté cerrado. Aquí solo se inicializa la suscripción.
  useEffect(() => {
    if (!tecnico) return;
    void iniciarPush(tecnico.id);
  }, [tecnico]);

  // ── Tour guiado ────────────────────────────────────────────────────────
  // Se lanza recién con la agenda cargada: antes no hay tarjetas que destacar.
  useEffect(() => {
    if (!tecnico || !agendaLista || tourPaso > 0) return;
    if (tourPendiente(tecnico.id)) setTourPaso(1);
  }, [tecnico, agendaLista, tourPaso]);

  // Cada paso vive en una pantalla concreta; el recorrido navega solo hasta ella
  // usando la cita de ejemplo, igual que la app Android.
  useEffect(() => {
    if (!enTour) return;
    const destino = vistaDelPaso(tourPaso);
    if (destino === "detalle" || destino === "cierre") {
      setSeleccionada(CITA_DEMO);
      setVista(destino);
    } else {
      setVista("agenda");
    }
  }, [tourPaso, enTour]);

  const cerrarTour = useCallback(() => {
    if (tecnico) marcarTourVisto(tecnico.id);
    setTourPaso(0);
    // Salir de la cita de ejemplo, que no existe fuera del recorrido.
    setVista("agenda");
    setSeleccionada(null);
  }, [tecnico]);

  const avanzarTour = useCallback(() => {
    if (tourPaso >= TOTAL_PASOS) { cerrarTour(); return; }
    setTourPaso(p => p + 1);
  }, [tourPaso, cerrarTour]);

  // ── Acciones ───────────────────────────────────────────────────────────
  const marcarEnCamino = async () => {
    if (!seleccionada) return;
    // Durante el tour no se escribe nada: la cita no existe en la base de datos.
    if (esCitaDemo(seleccionada.id)) {
      setSeleccionada(prev => prev ? { ...prev, status: "en_camino" } : prev);
      return;
    }
    try {
      await updateAppointmentStatus(seleccionada.id, "en_camino");
      setSeleccionada(prev => prev ? { ...prev, status: "en_camino" } : prev);
      toast({ title: "🚗 Vas en camino", description: "El operador ya lo sabe." });
      cargarAgenda({ silencioso: true });
    } catch (e: any) {
      toast({ title: "No se pudo actualizar", description: e?.message, variant: "destructive" });
    }
  };

  const cerrarTrabajo = async (notas: string, fotos: File[]) => {
    if (!seleccionada || !tecnico) return;
    if (esCitaDemo(seleccionada.id)) {
      toast({ title: "Trabajo de ejemplo", description: "Es parte del recorrido guiado, no se envía nada." });
      return;
    }
    const { isRetiro, sinTicket } = await completeAppointment(seleccionada, notas, fotos, tecnico);
    toast({
      title: isRetiro ? "⏳ Retiro registrado" : "✅ Trabajo completado",
      // Sin ticket la nota queda escrita en la cita: decirlo evita que el técnico
      // busque después una evidencia que no está donde la espera.
      description: sinTicket
        ? "Esta cita no tenía ticket: la nota quedó guardada en la cita."
        : isRetiro
          ? "Queda en espera de confirmación del operador."
          : "El ticket se marcó como resuelto.",
    });
    setVista("agenda");
    setSeleccionada(null);
    await cargarAgenda({ silencioso: true });
  };

  const salir = async () => {
    // Desvincular el dispositivo primero, para que no siga recibiendo avisos de este técnico
    await cerrarPush();
    await logoutTecnico();
    setTecnico(null);
    setUpcoming([]);
    setPast([]);
    setVista("agenda");
    setSeleccionada(null);
    setTourPaso(0);
    setAgendaLista(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (cargandoSesion) {
    return (
      <div className="min-h-[100dvh] bg-[var(--tec-fondo)] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--tec-acento)]" />
      </div>
    );
  }

  if (!tecnico) {
    return <TecnicoLogin onLogin={setTecnico} />;
  }

  // Durante el recorrido la cita de ejemplo encabeza la lista, para que el técnico
  // tenga algo real que tocar aunque todavía no le hayan asignado trabajos.
  const proximosMostrados = enTour ? [CITA_DEMO, ...upcoming] : upcoming;

  const pantalla =
    vista === "cierre" && seleccionada ? (
      <TecnicoCierre
        appointment={seleccionada}
        onBack={() => setVista("detalle")}
        onSubmit={cerrarTrabajo}
      />
    ) : vista === "detalle" && seleccionada ? (
      <TecnicoDetalle
        appointment={seleccionada}
        onBack={() => { setVista("agenda"); setSeleccionada(null); }}
        onEnCamino={marcarEnCamino}
        onCompletar={() => setVista("cierre")}
      />
    ) : (
      <TecnicoAgenda
        tecnico={tecnico}
        upcoming={proximosMostrados}
        past={past}
        loading={cargandoAgenda}
        refreshing={refrescando}
        onRefresh={() => cargarAgenda({ silencioso: true })}
        onSelect={a => { setSeleccionada(a); setVista("detalle"); }}
        onLogout={salir}
        forzarTab={enTour ? (vistaDelPaso(tourPaso) === "historial" ? "historial" : "proximos") : undefined}
        tema={tema}
        onAlternarTema={alternarTema}
      />
    );

  return (
    <>
      {pantalla}
      {enTour && (
        <TecnicoTour
          paso={tourPaso}
          nombre={tecnico.name || "técnico"}
          hayTrabajos={upcoming.length > 0}
          onSiguiente={avanzarTour}
          onSalir={cerrarTour}
        />
      )}
    </>
  );
}
