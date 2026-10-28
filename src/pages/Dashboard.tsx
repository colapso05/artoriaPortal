import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageCircle, X } from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
// ── Siempre cargados (layout visible desde el primer render) ──────────────────
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { OnboardingTour } from "@/components/dashboard/OnboardingTour";
import ChangePasswordScreen from "@/components/dashboard/ChangePasswordScreen";
import AgentToggle from "@/components/dashboard/AgentToggle";
import { syncShortcutsCache } from "@/components/dashboard/ShortcutsManager";
import { esSesionTecnico } from "@/lib/tecnicos/api";
import SitioWebPanel from "@/components/dashboard/SitioWebPanel";
import PagosComprobantes from "@/components/dashboard/PagosComprobantes";
import { moduloDisponible } from "@/lib/comprobantes";
// ── Lazy: se cargan solo cuando el usuario navega a esa vista ─────────────────
const AdminUserManager     = React.lazy(() => import("@/components/dashboard/AdminUserManager"));
const WhatsAppInbox        = React.lazy(() => import("@/components/dashboard/WhatsAppInbox"));
const TicketManager        = React.lazy(() => import("@/components/dashboard/TicketManager"));
const CoverageMap          = React.lazy(() => import("@/components/dashboard/CoverageMap"));
const CompanyTeamManager   = React.lazy(() => import("@/components/dashboard/CompanyTeamManager"));
const AdminDashboardHome   = React.lazy(() => import("@/components/dashboard/AdminDashboardHome"));
const PanelEmpresa         = React.lazy(() => import("@/components/dashboard/PanelEmpresa"));

/**
 * Interruptor del panel de empresa: `true` = el nuevo, `false` = el de siempre.
 *
 * Una línea, sin borrar nada. El panel anterior queda intacto en
 * `ClientDashboardHome.tsx` por si hay que volver.
 */
const PANEL_EMPRESA_NUEVO = true;
const ClientDashboardHome  = React.lazy(() => import("@/components/dashboard/ClientDashboardHome"));
const AdminAgentReports    = React.lazy(() => import("@/components/dashboard/AdminAgentReports"));
const ShortcutsManager     = React.lazy(() => import("@/components/dashboard/ShortcutsManager"));
const SettingsPage         = React.lazy(() => import("@/components/dashboard/SettingsPage"));
const CreditsManager       = React.lazy(() => import("@/components/dashboard/CreditsManager"));
const MyReports            = React.lazy(() => import("@/components/dashboard/MyReports"));
const AdminCreditRequests  = React.lazy(() => import("@/components/dashboard/AdminCreditRequests"));
const ConversationsAnalytics = React.lazy(() => import("@/components/dashboard/ConversationsAnalytics"));
const ScheduleManager        = React.lazy(() => import("@/components/dashboard/schedule/ScheduleManager"));
const BillingManager         = React.lazy(() => import("@/components/dashboard/BillingManager"));
const AdminBillingPanel      = React.lazy(() => import("@/components/dashboard/AdminBillingPanel"));
const ConsumoIA              = React.lazy(() => import("@/components/dashboard/ConsumoIA"));
const SimuladorWhatsApp      = React.lazy(() => import("@/components/dashboard/SimuladorWhatsApp"));

// Spinner mínimo para el Suspense boundary
function ViewLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[200px]">
      <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
    </div>
  );
}



interface UserToggle {
  id: string;
  name: string;
  nocodb_table_id: string;
}

// Permissions matrix for company roles
const ROLE_PERMISSIONS: Record<string, string[]> = {
  administrador: ["team", "inbox", "coverage", "tickets"],
  supervisor: ["inbox", "tickets"],
  operador: ["inbox", "tickets"],
};

export default function Dashboard() {
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [toggles, setToggles] = useState<UserToggle[]>([]);
  // La vista activa vive en la URL (?view=...) para que el botón atrás/adelante
  // del navegador funcione y la recarga conserve la sección.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = searchParams.get("view") || "";
  const setActiveView = useCallback((view: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("view", view);
      // Estos los pone solo quien navega a un destino concreto (una sección de
      // Configuración, un ticket puntual). Si quedaran pegados, la próxima visita
      // aterrizaría en lo de la vez anterior en vez de donde corresponde.
      next.delete("sec");
      next.delete("ticket");
      next.delete("tbuscar");
      // `conv` tambien: ir a la Bandeja desde el menu o desde una alerta no puede
      // reabrir el chat que alguien miro hace dos dias. Quien quiere abrir uno
      // concreto usa `openInboxConversation`, que lo fija en el mismo cambio de URL.
      next.delete("conv");
      return next;
    });
  }, [setSearchParams]);

  // El panel ocupa exactamente la ventana y se desplaza por dentro. Se bloquea el
  // desplazamiento del documento mientras está montado; al salir a la landing se
  // devuelve, porque esa sí tiene que poder desplazarse.
  useEffect(() => {
    document.body.classList.add("panel-sin-scroll");
    return () => document.body.classList.remove("panel-sin-scroll");
  }, []);

  // Ir a vincular el canal sin costo. Fija ?sec= junto con ?view= en el mismo cambio
  // de URL: con dos actualizaciones seguidas, Configuración alcanza a montarse en
  // "Personalizar" y el operador aterriza en la pantalla equivocada.
  const abrirVinculacionCanal = useCallback(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("view", "settings");
      next.set("sec", "integraciones");
      return next;
    });
  }, [setSearchParams]);

  // Navegar a la Bandeja y abrir una conversación puntual. Fija ?conv= en el MISMO
  // cambio de URL que ?view=inbox — si no, el efecto que restaura el chat desde la
  // URL (deps: [activeView]) puede leer un ?conv= viejo (de una visita anterior a la
  // Bandeja) y pisar la conversación que se quiso abrir.
  const openInboxConversation = useCallback((conversationId: string) => {
    setPendingConversationId(conversationId);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("view", "inbox");
      next.set("conv", conversationId);
      return next;
    });
  }, [setSearchParams]);
  const [sidebarIconSize, setSidebarIconSize] = useState<number>(24);
  // Guardamos el tamaño del admin para restaurarlo al salir de simulación
  const adminIconSizeRef = React.useRef<number>(24);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const [pendingConvData, setPendingConvData] = useState<any>(null);
  const [pendingInboxPhone, setPendingInboxPhone] = useState<string | null>(null);
  const [pendingInboxMessage, setPendingInboxMessage] = useState<string | null>(null);
  const [tourContextoTemporal, setTourContextoTemporal] = useState(false);
  const [tourAlreadySeen, setTourAlreadySeen] = useState(false);

  const [activeToggle, setActiveToggle] = useState<UserToggle | null>(null);
  const [companyRole, setCompanyRole] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [operatorRoles, setOperatorRoles] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState<string>("");
  const [simulatedCompanyId, setSimulatedCompanyId] = useState<string | null>(null);
  const [simulatedCompanyName, setSimulatedCompanyName] = useState<string>("");
  const [simulatedUserName, setSimulatedUserName] = useState<string>("");

  /**
   * Con que nombre saludar.
   *
   * `profiles.display_name` a veces trae el cargo en vez del nombre -"Administrador",
   * "Usuario"- y saludar con el cargo se lee como un formulario, no como un saludo.
   * Cuando pasa eso se prefiere la parte del correo antes de la arroba, que al menos
   * es propia de la persona.
   *
   * Y si se esta simulando a alguien, manda el nombre de esa persona: el punto de
   * simular es ver lo que ve ella.
   */
  const nombreSaludo = useMemo(() => {
    const esCargo = (v: string) =>
      /^(administrador|administradora|admin|usuario|usuaria|user|cliente|empresa)$/i.test(v.trim());
    for (const c of [simulatedUserName, displayName]) {
      const v = (c || "").trim();
      if (v && !esCargo(v)) return v;
    }
    const local = (session?.user?.email || "").split("@")[0] || "";
    // Los separadores del correo se vuelven espacios: "juan.perez" -> "Juan perez".
    const limpio = local.replace(/[._-]+/g, " ").trim();
    if (limpio && !/^[0-9]+$/.test(limpio)) return limpio.charAt(0).toUpperCase() + limpio.slice(1);
    return "";
  }, [simulatedUserName, displayName, session?.user?.email]);
  const [simulatedUserRole, setSimulatedUserRole] = useState<string | null>(null);
  const [simulatedUserOperatorRoles, setSimulatedUserOperatorRoles] = useState<string[]>([]);
  const [creditsEnabled, setCreditsEnabled] = useState(false);
  /** `sitio_web_activo`: solo las empresas cuyo sitio público lee estas tablas. */
  const [sitioWebEnabled, setSitioWebEnabled] = useState(false);
  // El módulo de pagos aparece solo cuando la base ya tiene sus funciones: mientras no
  // existan, la entrada del menú no se ofrece (en vez de llevar a una pantalla vacía).
  const [pagosEnabled, setPagosEnabled] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [ticketInitialFilter, setTicketInitialFilter] = useState<string | undefined>();
  /** En qué pestaña abre Coberturas: "alerts" cuando se llega desde el inicio. */
  const [coverageTab, setCoverageTab] = useState<"map" | "alerts">("map");
  // Al salir de Coberturas se olvida la pestaña: entrar después por el menú tiene que abrir el mapa.
  useEffect(() => { if (activeView !== "coverage") setCoverageTab("map"); }, [activeView]);
  const navigate = useNavigate();

  // ── Notificaciones globales (activas fuera de la sección Bandeja) ────────────
  const [globalNotif, setGlobalNotif] = useState<{
    convId: string; clientName: string; preview: string;
    label: string; labelColor: string;
  } | null>(null);
  const globalNotifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevConvUnreadRef = useRef<Record<string, number>>({});
  const globalInitDoneRef = useRef(false);
  const activeViewRef = useRef<string>("");

  const effectiveIsAdmin = simulatedCompanyId ? false : isAdmin;
  const effectiveCompanyId = simulatedCompanyId || companyId;

  /*
   * `credits_enabled` es de la empresa que se está mirando, no de la del usuario.
   *
   * Se leía una sola vez, al arrancar, desde la empresa propia. Un admin de
   * plataforma no tiene empresa, así que al simular a una que sí compra créditos
   * la bandera quedaba en false y el saldo no aparecía por ninguna parte.
   */
  useEffect(() => {
    if (!effectiveCompanyId) { setCreditsEnabled(false); return; }
    let cancelado = false;
    supabase
      .from("company_config")
      .select("credits_enabled, sitio_web_activo")
      .eq("id", effectiveCompanyId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return;
        setCreditsEnabled(!!(data as any)?.credits_enabled);
        setSitioWebEnabled(!!(data as any)?.sitio_web_activo);
      });
    return () => { cancelado = true; };
  }, [effectiveCompanyId]);
  const effectiveCompanyRole = simulatedUserRole ?? (simulatedCompanyId ? "administrador" : companyRole);
  useEffect(() => {
    setPagosEnabled(false);
    if (!effectiveCompanyId || effectiveCompanyRole !== "administrador") return;
    let cancelado = false;
    moduloDisponible(effectiveCompanyId).then(ok => { if (!cancelado) setPagosEnabled(ok); });
    return () => { cancelado = true; };
  }, [effectiveCompanyId, effectiveCompanyRole]);
  const effectiveCompanyName = simulatedCompanyId ? simulatedCompanyName : companyName;
  const effectiveOperatorRoles = simulatedUserRole ? simulatedUserOperatorRoles : operatorRoles;

  /**
   * Vistas cuyo contenido crece hacia abajo y se desplaza como una pagina.
   * Los dos paneles de inicio entran: ambos tienen contenido bajo la primera
   * pantalla y por dentro usan `min-h-full` en vez de altura fija.
   */
  const vistaConScroll =
    activeView === "conversations-analytics" ||
    activeView === "home" ||
    /*
     * El sitio web también crece hacia abajo: la lista de planes es larga y la
     * vista previa va al lado. Sin esto el contenedor quedaba con `min-h-0` y la
     * columna de la izquierda se cortaba a media lista, sin forma de bajar.
     */
    activeView === "sitio-web" ||
    activeView === "pagos";

  // Carga el icon size de un usuario específico desde Supabase (para simulación)
  const loadIconSizeForUser = async (userId: string): Promise<number> => {
    try {
      const { data } = await (supabase as any)
        .from('user_preferences')
        .select('value')
        .eq('user_id', userId)
        .eq('key', 'sidebar_icon_size')
        .maybeSingle();
      if (data) {
        const size = parseInt(data.value);
        if (!isNaN(size)) return size;
      }
    } catch {}
    return 24; // default
  };

  /**
   * Entrar a simular una empresa y caer en la vista indicada.
   *
   * Estaba escrito dentro del `onSimulate` de la home del administrador, así que
   * cualquier otro sitio que quisiera simular tenía que copiarlo entero — y
   * copiado a medias deja al admin con la barra de otro usuario o sin nombre.
   */
  const simularEmpresa = async (id: string, name: string, vista: string) => {
    let adminName = "";
    let simulatedUserId = "";
    try {
      const { data: cu } = await supabase
        .from("company_users" as any)
        .select("user_id")
        .eq("company_id", id)
        .eq("role", "administrador")
        .limit(1)
        .single();
      if (cu) {
        simulatedUserId = (cu as any).user_id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", simulatedUserId)
          .single();
        adminName = profile?.display_name || "";
      }
    } catch {}
    adminIconSizeRef.current = sidebarIconSize;
    const simSize = simulatedUserId ? await loadIconSizeForUser(simulatedUserId) : 24;
    setSidebarIconSize(simSize);
    setSimulatedCompanyId(id);
    setSimulatedCompanyName(name);
    setSimulatedUserName(adminName);
    setSimulatedUserRole(null);
    setSimulatedUserOperatorRoles([]);
    setActiveView(vista);
  };

  // Escuchar cambios de tamaño de iconos desde SettingsPage
  useEffect(() => {
    const handler = (e: Event) => {
      const size = parseInt((e as CustomEvent).detail);
      if (!isNaN(size)) {
        setSidebarIconSize(size);
        // También actualizar el ref del admin si NO estamos simulando
        if (!simulatedCompanyId) adminIconSizeRef.current = size;
      }
    };
    window.addEventListener("ui:sidebar-icon-size-changed", handler);
    return () => window.removeEventListener("ui:sidebar-icon-size-changed", handler);
  }, [simulatedCompanyId]);

  useEffect(() => {
    // FIX: Radix UI injects a <style> tag with pointer-events: none !important;
    // We forcibly override it with our own !important.
    setTimeout(() => {
      document.body.style.setProperty("pointer-events", "auto", "important");
      document.body.removeAttribute("data-scroll-locked");
    }, 100);

    // Use onAuthStateChange exclusively — INITIAL_SESSION fires only after the
    // token is fully loaded into the HTTP client, avoiding the race condition
    // where getSession() resolves before the Authorization header is ready.
    let dashboardInitialized = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESH_FAILURE' || !session) {
        dashboardInitialized = false;
        navigate("/portal");
        return;
      }
      // El portal de técnicos usa este mismo cliente de Supabase, así que una sesión
      // de técnico queda guardada bajo la misma llave. Sin este corte, el técnico
      // caía en el dashboard de operadores y veía "Cambiar Contraseña", porque su
      // perfil trae must_change_password mientras use la clave temporal.
      if (esSesionTecnico(session.user?.email)) {
        navigate("/portal-tecnicos", { replace: true });
        return;
      }
      setSession(session);
      // Initialize only once per mount — skip TOKEN_REFRESHED / USER_UPDATED events
      if (!dashboardInitialized && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        dashboardInitialized = true;
        initializeDashboard(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const initializeDashboard = async (userId: string) => {
    // Verificar si el usuario ya vio el tour del Contexto Temporal
    supabase.auth.getUser().then(({ data: { user } }) => {
      const seenTours: string[] = user?.user_metadata?.seen_tours ?? [];
      setTourAlreadySeen(seenTours.includes('contexto_temporal_v1'));
    });

    // Cargar preferencia de ancho del sidebar desde Supabase
    (supabase as any).from('user_preferences')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'sidebar_icon_size')
      .maybeSingle()
      .then(({ data }: { data: { value: string } | null }) => {
        if (data) {
          const size = parseInt(data.value);
          if (!isNaN(size)) {
            setSidebarIconSize(size);
            adminIconSizeRef.current = size; // guardar como referencia del admin
          }
        }
      });

    // Check global admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    const admin = roleData && roleData.length > 0;
    setIsAdmin(!!admin);

    // Check company membership & role
    const { data: companyData, error: companyError } = await supabase
      .from("company_users" as any)
      .select("company_id, role, operator_roles")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (companyError) {
      console.error("Error fetching company user:", companyError);
    }

    if (companyData) {
      const cd = companyData as any;
      setCompanyRole(cd.role);
      setCompanyId(cd.company_id);
      setOperatorRoles(cd.operator_roles || []);

      // Get company config
      const { data: configData } = await supabase
        .from("company_config")
        .select("company_name, credits_enabled")
        .eq("id", cd.company_id)
        .single();
      if (configData) {
        setCompanyName(configData.company_name);
        setCreditsEnabled(!!(configData as any).credits_enabled);
      }

      // Pre-warm shortcuts cache so WhatsAppInbox slash commands work immediately
      syncShortcutsCache(cd.company_id);
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("must_change_password, display_name")
      .eq("user_id", userId)
      .single();
    if (profileData?.must_change_password) setMustChangePassword(true);
    if (profileData?.display_name) setDisplayName(profileData.display_name);



    // Load toggles
    const { data: togglesData } = await supabase
      .from("user_toggles")
      .select("*")
      .eq("user_id", userId);
    const loadedToggles: UserToggle[] = togglesData || [];
    setToggles(loadedToggles);

    // La vista por defecto ("home") la fija el efecto de default cuando no hay ?view=
  };

  // Re-fetch credits_enabled whenever the effective company changes (e.g. admin simulation)
  useEffect(() => {
    if (!effectiveCompanyId) { setCreditsEnabled(false); return; }
    (async () => {
      const { data } = await supabase
        .from("company_config")
        .select("credits_enabled")
        .eq("id", effectiveCompanyId)
        .single();
      setCreditsEnabled(!!(data as any)?.credits_enabled);
    })();
  }, [effectiveCompanyId]);

  const handleViewChange = (view: string, unused_module?: any, toggle?: UserToggle) => {
    setActiveView(view);
    setActiveToggle(toggle || null);
  };

  // Vista por defecto: si no hay ?view= en la URL, fijar "home" (replace para no
  // dejar una entrada muerta en el historial).
  useEffect(() => {
    if (session && !searchParams.get("view")) {
      setSearchParams({ view: "home" }, { replace: true });
    }
  }, [session, searchParams, setSearchParams]);

  // Restaurar el agente/toggle activo desde la URL (para back/forward y recarga).
  useEffect(() => {
    if (activeView.startsWith("toggle-")) {
      const id = activeView.slice("toggle-".length);
      setActiveToggle(toggles.find(t => t.id === id) || null);
    } else {
      setActiveToggle(null);
    }
  }, [activeView, toggles]);

  // Al entrar a la Bandeja (incluido back/forward y recarga), abrir el chat del ?conv=.
  // Depende solo de activeView, así no interfiere cuando el usuario cambia de chat
  // estando ya dentro de la bandeja (eso solo actualiza el ?conv= vía replace).
  useEffect(() => {
    if (activeView === "inbox") {
      const conv = searchParams.get("conv");
      if (conv) setPendingConversationId(conv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  useEffect(() => {
    const tourViews = ["home", "inbox", "team"];
    if (tourViews.includes(activeView) && !localStorage.getItem(`tour_seen_${activeView}`)) {
      const timer = setTimeout(() => setRunTour(true), 800);
      return () => clearTimeout(timer);
    }
  }, [activeView]);

  const handleTourFinish = () => {
    setRunTour(false);
    localStorage.setItem(`tour_seen_${activeView}`, "true");
  };

  const location = useLocation();
  useEffect(() => {
    if (location.state?.view === 'inbox') {
      if (location.state.conversationId) {
        openInboxConversation(location.state.conversationId);
      } else {
        setActiveView('inbox');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/portal");
  };

  // Mantener ref de activeView sincronizado (para usarlo dentro del closure de realtime)
  useEffect(() => { activeViewRef.current = activeView; }, [activeView]);

  // ── Suscripción global a conversaciones para notificaciones fuera de Bandeja ─
  useEffect(() => {
    if (!effectiveCompanyId) return;

    const TICKET_LABELS: Record<string, { name: string; color: string }> = {
      abierto:              { name: 'Abierto',              color: '#22c55e' },
      en_proceso:           { name: 'En Proceso',           color: '#3b82f6' },
      esperando_respuesta:  { name: 'Esperando Resp.',      color: '#f59e0b' },
      resuelto:             { name: 'Resuelto',             color: '#a855f7' },
    };

    const playSound = () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const master = ctx.createGain();
        master.connect(ctx.destination);
        const playNote = (freq: number, startAt: number, duration: number, vol: number) => {
          const osc  = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const g    = ctx.createGain();
          osc.type = 'sine'; osc2.type = 'sine';
          osc.frequency.setValueAtTime(freq, startAt);
          osc2.frequency.setValueAtTime(freq * 2, startAt);
          g.gain.setValueAtTime(0, startAt);
          g.gain.linearRampToValueAtTime(vol, startAt + 0.005);
          g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
          osc.connect(g); osc2.connect(g); g.connect(master);
          osc.start(startAt); osc.stop(startAt + duration);
          osc2.start(startAt); osc2.stop(startAt + duration);
        };
        playNote(1046, ctx.currentTime,        0.22, 0.22);
        playNote(880,  ctx.currentTime + 0.21, 0.22, 0.18);
      } catch (_) {}
    };

    const triggerNotif = async (conv: any) => {
      // Solo si no estamos en la bandeja
      if (activeViewRef.current === 'inbox') return;
      // Verificar que tenga ticket activo (no resuelto)
      const { data: ticket } = await (supabase as any)
        .from('tickets')
        .select('status')
        .eq('conversation_id', conv.id)
        .is('deleted_at', null)
        .neq('status', 'resuelto')
        .limit(1)
        .maybeSingle();
      if (!ticket) return;
      const labelInfo = TICKET_LABELS[ticket.status] || { name: ticket.status, color: '#888' };
      const clientName = conv.profile_name || conv.wa_id || 'Cliente';
      const preview = (conv.last_message_preview || '').slice(0, 50);
      playSound();
      if (globalNotifTimeoutRef.current) clearTimeout(globalNotifTimeoutRef.current);
      setGlobalNotif({ convId: conv.id, clientName, preview, label: labelInfo.name, labelColor: labelInfo.color });
      globalNotifTimeoutRef.current = setTimeout(() => setGlobalNotif(null), 5000);
    };

    const channel = supabase
      .channel(`global-notif-${effectiveCompanyId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `company_id=eq.${effectiveCompanyId}`,
      }, (payload) => {
        const updated = payload.new as any;
        const prevUnread = prevConvUnreadRef.current[updated.id] ?? updated.unread_count;
        if (globalInitDoneRef.current && (updated.unread_count || 0) > prevUnread) {
          triggerNotif(updated);
        }
        prevConvUnreadRef.current[updated.id] = updated.unread_count || 0;
      })
      .subscribe();

    // Cargar baseline de unread_count para no notificar mensajes viejos al montar
    (supabase as any)
      .from('conversations')
      .select('id, unread_count')
      .eq('company_id', effectiveCompanyId)
      .then(({ data }: any) => {
        if (data) {
          for (const c of data) prevConvUnreadRef.current[c.id] = c.unread_count || 0;
        }
        globalInitDoneRef.current = true;
      });

    return () => {
      supabase.removeChannel(channel);
      globalInitDoneRef.current = false;
      prevConvUnreadRef.current = {};
    };
  }, [effectiveCompanyId]);

  // Check if current user has permission for a view
  const hasPermission = (view: string): boolean => {
    if (effectiveIsAdmin) return true;
    if (!effectiveCompanyRole) return false;
    const perms = ROLE_PERMISSIONS[effectiveCompanyRole] || [];
    return perms.includes(view);
  };

  /*
   * Si esta vista va a dibujar algo o no.
   *
   * El area de contenido es una lista de `activeView === "x" && permiso && (...)`.
   * Cuando ninguna calza no pasa nada: ni error, ni redireccion, ni estado vacio.
   * Queda la barra lateral pintada y el centro en negro.
   *
   * Se llega ahi por dos caminos y los dos son reales:
   *
   *   1. Una vista que existe pero que el rol no tiene. Un visualizador que escribe
   *      ?view=tickets, o que tiene el enlace guardado de cuando era operador.
   *   2. Un nombre de vista que no existe. `?view=analytics` y `?view=config` no son
   *      vistas del portal —se llaman `conversations-analytics` y `settings`— asi que
   *      cualquiera que los escriba de memoria cae en el mismo vacio.
   *
   * Esta lista espeja las condiciones de abajo. Si se agrega una vista alla, va aca
   * tambien; el costo de olvidarse es que la vista nueva muestre "sin acceso", que
   * es molesto pero visible — al reves de ahora, que el olvido es invisible.
   */
  const vistaRenderizable = useMemo(() => {
    const puede = (p: string) => effectiveIsAdmin || hasPermission(p);
    switch (activeView) {
      case "home":
      case "shortcuts":
      case "my-reports":
      case "settings":
        return true;
      case "users":
      case "reports":
      case "credit-requests":
      case "admin-billing":
      // El costo de los modelos es informacion nuestra: la pantalla es solo del
      // administrador de la plataforma. Las RPC tambien lo rechazan por su cuenta,
      // asi que esto es la primera de dos puertas, no la unica.
      case "consumo-ia":
        // El simulador también es solo del administrador de plataforma: habla
        // con el agente en modo prueba y muestra trazas internas.
      case "simulador":
        return isAdmin;
      case "inbox":
      case "tickets":
      case "coverage":
        return puede(activeView);
      case "team":
        return hasPermission("team") && !!effectiveCompanyId;
      case "conversations-analytics":
        return !effectiveIsAdmin;
      case "credits":
        return !!effectiveCompanyId && creditsEnabled;
      case "billing":
        return !!effectiveCompanyId && !effectiveIsAdmin;
      case "schedule":
        return !!effectiveCompanyId;
      /*
       * Faltaba, y el síntoma era raro: la sección se dibujaba bien y más abajo
       * aparecía "no está disponible para tu cuenta". Las dos cosas se renderizan
       * por separado, así que al no reconocer la vista acá el cartel se colaba
       * debajo del contenido que sí había cargado.
       */
      case "sitio-web":
        return !!effectiveCompanyId && sitioWebEnabled;
      case "pagos":
        return !!effectiveCompanyId && pagosEnabled && effectiveCompanyRole === "administrador";
      default:
        // Los toggles son dinamicos: existen si hay un toggle cargado con ese nombre.
        return activeView.startsWith("toggle-") && !!activeToggle;
    }
  }, [activeView, effectiveIsAdmin, isAdmin, hasPermission, effectiveCompanyId, creditsEnabled, sitioWebEnabled, pagosEnabled, effectiveCompanyRole, activeToggle]);

  if (!session) return null;

  if (mustChangePassword) {
    return (
      <ChangePasswordScreen
        userId={session.user.id}
        onComplete={() => setMustChangePassword(false)}
      />
    );
  }

  return (
    <>
    {/* SidebarProvider trae `min-h-svh` por dentro. Se sobrescribe con `min-h-0` y una
        altura de viewport dinámica: si el envoltorio puede crecer más que la ventana
        —por una barra horizontal, una barra de descargas, una franja de extensión—,
        el documento entero se vuelve desplazable y aparece un vacío bajo la app. */}
    <SidebarProvider className="h-[100dvh] min-h-0 overflow-hidden">
      <div className="h-full overflow-hidden flex w-full bg-background min-w-0">
        <DashboardSidebar
          isAdmin={effectiveIsAdmin}
          activeView={activeView}
          onViewChange={handleViewChange}
          toggles={toggles}
          companyRole={effectiveCompanyRole}
          companyName={effectiveCompanyName}
          isSimulating={!!simulatedCompanyId}
          creditsEnabled={creditsEnabled}
          sitioWebEnabled={sitioWebEnabled}
          pagosEnabled={pagosEnabled}
          iconSize={sidebarIconSize}
        />

        <div className="flex-1 flex flex-col min-w-0">
          {activeView !== "inbox" && (
            <DashboardHeader
              email={session.user.email}
              userId={session.user.id}
              onAbrirConversacion={openInboxConversation}
              onAbrirVinculacion={abrirVinculacionCanal}
              displayName={displayName}
              onLogout={handleLogout}
              onSettings={() => setActiveView("settings")}
              simulatedCompanyName={simulatedCompanyName}
              simulatedUserName={simulatedUserName}
              simulatedUserRole={simulatedUserRole}
              onAgendaClick={() => setActiveView("schedule")}
              onContextoTemporalClick={() => {
                setActiveView("settings");
                // Solo mostrar el tour si el usuario no lo vio antes
                if (!tourAlreadySeen) setTourContextoTemporal(true);
              }}
              onStopSimulation={() => {
                setSidebarIconSize(adminIconSizeRef.current); // restaurar preferencia del admin
                setSimulatedCompanyId(null);
                setSimulatedCompanyName("");
                setSimulatedUserName("");
                setSimulatedUserRole(null);
                setSimulatedUserOperatorRoles([]);
                // Al Inicio: dejar de simular no es "volver al listado de empresas",
                // es volver a ser uno mismo, y uno mismo arranca en su panel.
                setActiveView("home");
              }}
            />
          )}

          {/* El relleno vive DENTRO del contenedor que se desplaza, no fuera.
              Si va en <main>, la barra de desplazamiento se dibuja en el borde
              interior y queda flotando a 32 px del canto de la ventana, con un
              vacío a su derecha. */}
          <main className={`flex-1 min-h-0 flex flex-col ${vistaConScroll ? "overflow-y-auto" : "overflow-hidden"}`}>
            <Suspense fallback={<ViewLoader />}>
            <div className={`flex-1 flex flex-col w-full max-w-none ${vistaConScroll ? "" : "min-h-0"} ${activeView === "inbox" ? "p-0" : "p-4 md:p-6 lg:p-8"}`}>
              {activeView === "home" && effectiveIsAdmin && (
                <AdminDashboardHome
                  onVerReportes={() => setActiveView("reports")}
                  onVerConsumoIA={() => setActiveView("consumo-ia")}
                  /*
                   * Una conversación que falló se mira en Rendimiento de IA, no en la
                   * bandeja: lo que se quiere ver es el análisis. Y hay que simular la
                   * empresa primero, porque esa pantalla trabaja sobre una sola.
                   */
                  onVerAnalisis={async ({ companyId: cid, companyName: cname, analysisId, waId }) => {
                    await simularEmpresa(cid, cname, "conversations-analytics");
                    setPendingConvData({ analysis_id: analysisId, wa_id: waId, profile_name: null });
                  }}
                  onSimulate={(id, name) => simularEmpresa(id, name, "home")}
                />
              )}
              {/*
                * Panel nuevo de la empresa. Para volver al anterior basta con poner
                * PANEL_EMPRESA_NUEVO en false: el componente viejo sigue entero y
                * con sus props, no se borró nada.
                */}
              {activeView === "home" && !effectiveIsAdmin && PANEL_EMPRESA_NUEVO && (
                <PanelEmpresa
                  companyId={effectiveCompanyId}
                  companyName={effectiveCompanyName}
                  userName={nombreSaludo}
                  onIrABandeja={() => setActiveView("inbox")}
                  onConversationClick={(id) => openInboxConversation(id)}
                  /* Configuración → Sistema de Alertas: los números que reciben el aviso y
                     cuántos reclamos lo disparan. Esa sección es solo de administradores, así
                     que el acceso directo también: no puede llevar a una pantalla cerrada. */
                  onIrASistemaAlertas={(effectiveCompanyRole === "administrador" || effectiveCompanyRole === "admin") ? () => {
                    setActiveView("settings");
                    setSearchParams(prev => {
                      const next = new URLSearchParams(prev);
                      next.set("view", "settings");
                      next.set("sec", "alertas");
                      next.delete("ticket"); next.delete("tbuscar");
                      return next;
                    });
                  } : undefined}
                  /* La alerta global (mensaje a clientes por zona) vive en Coberturas. */
                  onIrAAlertaActiva={(effectiveIsAdmin || hasPermission("coverage")) ? () => {
                    setCoverageTab("alerts");
                    setActiveView("coverage");
                    setSearchParams(prev => {
                      const next = new URLSearchParams(prev);
                      next.set("view", "coverage");
                      next.delete("ticket"); next.delete("tbuscar"); next.delete("sec");
                      return next;
                    });
                  } : undefined}
                  onNavigateToTickets={(status, ticketId) => {
                    // El filtro tiene que quedar puesto: llegar al Centro de Tickets
                    // sin filtro obliga a repetir a mano lo que ya se pidió.
                    setTicketInitialFilter(status && status !== "all" ? status : undefined);
                    setActiveView("tickets");
                    setSearchParams(prev => {
                      const next = new URLSearchParams(prev);
                      next.set("view", "tickets");
                      if (ticketId) next.set("ticket", ticketId); else next.delete("ticket");
                      next.delete("tbuscar");
                      next.delete("sec");
                      return next;
                    });
                  }}
                  onNavigateToConversations={(analysisId, convData) => {
                    setPendingConvData(convData ?? null);
                    setActiveView("conversations-analytics");
                  }}
                />
              )}
              {activeView === "home" && !effectiveIsAdmin && !PANEL_EMPRESA_NUEVO && (
                <ClientDashboardHome
                  companyId={effectiveCompanyId}
                  companyName={effectiveCompanyName}
                  userId={session.user.id}
                  userName={nombreSaludo}
                  userRole={effectiveCompanyRole || undefined}
                  operatorRoles={effectiveOperatorRoles}
                  onConversationClick={(id) => openInboxConversation(id)}
                  onNavigateToTickets={(status, ticketId) => {
                    setTicketInitialFilter(status);
                    // ?ticket= se fija (o se borra) en el mismo cambio de URL que ?view=:
                    // si quedaba el de una visita anterior, el panel derecho seguía
                    // mostrando aquel ticket aunque la lista viniera filtrada por otro.
                    setSearchParams(prev => {
                      const next = new URLSearchParams(prev);
                      next.set("view", "tickets");
                      if (ticketId) next.set("ticket", ticketId); else next.delete("ticket");
                      next.delete("tbuscar");
                      next.delete("sec");
                      return next;
                    });
                  }}
                  creditsEnabled={creditsEnabled}
                  onNavigateToCredits={() => setActiveView("credits")}
                  onNavigateToConversations={(analysisId, convData) => { setPendingConvData(convData ?? null); setActiveView("conversations-analytics"); }}
                  onNavigateToSchedule={() => setActiveView("schedule")}
                />
              )}
              {activeView === "users" && isAdmin && (
                <AdminUserManager
                  onSimulate={async (id, name) => {
                    let adminName = "";
                    let simulatedUserId = "";
                    try {
                      const { data: cu } = await supabase
                        .from("company_users" as any)
                        .select("user_id")
                        .eq("company_id", id)
                        .eq("role", "administrador")
                        .limit(1)
                        .single();
                      if (cu) {
                        simulatedUserId = (cu as any).user_id;
                        const { data: profile } = await supabase
                          .from("profiles")
                          .select("display_name")
                          .eq("user_id", simulatedUserId)
                          .single();
                        adminName = profile?.display_name || "";
                      }
                    } catch {}
                    // Guardar tamaño del admin y cargar el del usuario simulado
                    adminIconSizeRef.current = sidebarIconSize;
                    const simSize = simulatedUserId ? await loadIconSizeForUser(simulatedUserId) : 24;
                    setSidebarIconSize(simSize);
                    setSimulatedCompanyId(id);
                    setSimulatedCompanyName(name);
                    setSimulatedUserName(adminName);
                    setSimulatedUserRole(null);
                    setSimulatedUserOperatorRoles([]);
                    setActiveView("home");
                  }}
                  onSimulateUser={async (cId, payload) => {
                    // Guardar tamaño del admin y cargar el del usuario simulado
                    adminIconSizeRef.current = sidebarIconSize;
                    const simSize = payload.userId ? await loadIconSizeForUser(payload.userId) : 24;
                    setSidebarIconSize(simSize);
                    setSimulatedCompanyName(payload.companyName ?? "");
                    setSimulatedCompanyId(cId);
                    setSimulatedUserName(payload.name || "");
                    setSimulatedUserRole(payload.role);
                    setSimulatedUserOperatorRoles(payload.operatorRoles);
                    setActiveView("home");
                  }}
                />
              )}
              {activeView === "reports" && isAdmin && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <AdminAgentReports
                    currentUserId={session.user.id}
                    onOpenConversation={(companyId, companyName, conversationId) => {
                      setSimulatedCompanyId(companyId);
                      setSimulatedCompanyName(companyName);
                      openInboxConversation(conversationId);
                    }}
                  />
                </div>
              )}

              {activeView === "inbox" && (effectiveIsAdmin || hasPermission("inbox")) && (
                <WhatsAppInbox
                  companyId={effectiveCompanyId || undefined}
                  userId={session.user.id}
                  userName={nombreSaludo}
                  userRole={effectiveCompanyRole || undefined}
                  operatorRoles={effectiveOperatorRoles}
                  initialConversationId={pendingConversationId || undefined}
                  initialPhone={pendingInboxPhone || undefined}
                  initialMessage={pendingInboxMessage || undefined}
                  onConversationOpened={() => { setPendingConversationId(null); setPendingInboxPhone(null); setPendingInboxMessage(null); }}
                  onConversationSelect={(convId) => {
                    setSearchParams(prev => {
                      const next = new URLSearchParams(prev);
                      if (convId) next.set("conv", convId); else next.delete("conv");
                      return next;
                    }, { replace: true });
                  }}
                  isSimulating={!!simulatedCompanyId}
                  simulatedUserName={simulatedUserName || simulatedCompanyName || undefined}
                  onNavigateToSchedule={() => setActiveView("schedule")}
                  onNavigateToSettings={abrirVinculacionCanal}
                />
              )}
              {activeView === "tickets" && (effectiveIsAdmin || hasPermission("tickets")) && (
                <TicketManager
                  companyId={effectiveCompanyId || undefined}
                  initialFilter={ticketInitialFilter}
                  initialTicketId={searchParams.get("ticket") || undefined}
                  initialSearch={searchParams.get("tbuscar") || undefined}
                  onTicketSelect={(ticketId) => {
                    setSearchParams(prev => {
                      const next = new URLSearchParams(prev);
                      if (ticketId) next.set("ticket", ticketId); else next.delete("ticket");
                      return next;
                    }, { replace: true });
                  }}
                  onOpenConversation={(conversationId) => openInboxConversation(conversationId)}
                />
              )}
              {activeView === "coverage" && (effectiveIsAdmin || hasPermission("coverage")) && (
                <div className="flex-1 flex flex-col gap-8 min-h-0">
                  <div className="flex-1 min-h-[500px]">
                    <CoverageMap companyId={effectiveCompanyId || undefined} tabInicial={coverageTab} />
                  </div>
                </div>
              )}
              {activeView === "team" && hasPermission("team") && effectiveCompanyId && (
                <CompanyTeamManager companyId={effectiveCompanyId} companyName={effectiveCompanyName} />
              )}
              {activeView === "shortcuts" && (
                <ShortcutsManager companyId={effectiveCompanyId || undefined} />
              )}
              {activeView === "conversations-analytics" && !effectiveIsAdmin && (
                <ConversationsAnalytics
                  companyId={effectiveCompanyId || ""}
                  companyName={effectiveCompanyName}
                  isAdminView={isAdmin}
                  initialConvData={pendingConvData ?? undefined}
                  onInitialConvDataHandled={() => setPendingConvData(null)}
                  onOpenConversation={(convId) => openInboxConversation(convId)}
                />
              )}
              {/*
                * El sitio web dejó de ser una pestaña de Configuración.
                *
                * Ahí dentro vivía apretado contra un `max-w-3xl` y escondido tres
                * clics adentro, cuando es la cara pública de la empresa. Acá tiene
                * el ancho completo y se llega de una.
                */}
              {activeView === "sitio-web" && effectiveCompanyId && sitioWebEnabled && (
                <SitioWebPanel companyId={effectiveCompanyId} />
              )}

              {activeView === "pagos" && effectiveCompanyId && pagosEnabled && effectiveCompanyRole === "administrador" && (
                <PagosComprobantes companyId={effectiveCompanyId} />
              )}

              {activeView === "credits" && effectiveCompanyId && creditsEnabled && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <CreditsManager
                    companyId={effectiveCompanyId}
                    userId={session.user.id}
                  />
                </div>
              )}
              {activeView === "credit-requests" && isAdmin && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <AdminCreditRequests />
                </div>
              )}
              {activeView === "consumo-ia" && isAdmin && (
                <ConsumoIA />
              )}
              {activeView === "simulador" && isAdmin && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <SimuladorWhatsApp />
                </div>
              )}
              {activeView === "admin-billing" && isAdmin && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <AdminBillingPanel />
                </div>
              )}
              {activeView === "billing" && effectiveCompanyId && !effectiveIsAdmin && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <BillingManager companyId={effectiveCompanyId} userId={session.user.id} userEmail={session.user.email} />
                </div>
              )}
              {activeView === "my-reports" && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <MyReports userId={session.user.id} companyId={effectiveCompanyId} />
                </div>
              )}
              {activeView === "settings" && (
                <SettingsPage
                  companyId={effectiveCompanyId}
                  companyName={effectiveCompanyName}
                  userRole={effectiveCompanyRole}
                  userId={session.user.id}
                  isSimulating={!!simulatedCompanyId}
                  initialSection={searchParams.get("sec") || undefined}
                  tourActive={tourContextoTemporal}
                  onTourComplete={async () => {
                    setTourContextoTemporal(false);
                    setTourAlreadySeen(true);
                    // Guardar en Supabase user_metadata para que no se muestre de nuevo
                    const { data: { user } } = await supabase.auth.getUser();
                    const seenTours: string[] = user?.user_metadata?.seen_tours ?? [];
                    if (!seenTours.includes('contexto_temporal_v1')) {
                      await supabase.auth.updateUser({
                        data: { seen_tours: [...seenTours, 'contexto_temporal_v1'] },
                      });
                    }
                  }}
                />
              )}
              {activeView === "schedule" && effectiveCompanyId && (
                <ScheduleManager
                  companyId={effectiveCompanyId}
                  userId={session.user.id}
                  isAdmin={effectiveIsAdmin || effectiveCompanyRole === "administrador"}
                  initialAppointmentId={searchParams.get("appt") || undefined}
                  onAppointmentSelect={(appointmentId) => {
                    setSearchParams(prev => {
                      const next = new URLSearchParams(prev);
                      if (appointmentId) next.set("appt", appointmentId); else next.delete("appt");
                      return next;
                    }, { replace: true });
                  }}
                  onOpenTicket={({ ticketId, buscar }) => {
                    // El filtro va en "all" porque el ticket casi siempre está resuelto
                    // —el técnico ya cerró— y con el filtro por defecto quedaría fuera.
                    setTicketInitialFilter("all");
                    setSearchParams(prev => {
                      const next = new URLSearchParams(prev);
                      next.set("view", "tickets");
                      if (ticketId) next.set("ticket", ticketId); else next.delete("ticket");
                      if (buscar) next.set("tbuscar", buscar); else next.delete("tbuscar");
                      next.delete("appt");
                      return next;
                    });
                  }}
                  onOpenInboxConversation={(phone, message) => {
                    setPendingInboxPhone(phone);
                    setPendingInboxMessage(message || null);
                    // Esta navegación es por teléfono, no por conversation_id — limpiar un
                    // ?conv= viejo para que no dispare la restauración por id y compita.
                    setSearchParams(prev => {
                      const next = new URLSearchParams(prev);
                      next.set("view", "inbox");
                      next.delete("conv");
                      return next;
                    });
                  }}
                />
              )}


              {activeView.startsWith("toggle-") && activeToggle && (
                <div className="max-w-xl">
                  <AgentToggle tableId={activeToggle.nocodb_table_id} name={activeToggle.name} />
                </div>
              )}

              {/* Lo que antes era una pantalla en negro. */}
              {!vistaRenderizable && (
                <div className="flex-1 min-h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-6">
                  <div className="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center">
                    <X className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[15px] font-bold">Esta sección no está disponible para tu cuenta</p>
                    <p className="text-[12.5px] text-muted-foreground/65 max-w-sm">
                      Puede que el enlace sea viejo, o que tu rol no incluya esta parte del portal.
                      Si deberías tener acceso, pedilo a quien administra tu empresa.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setActiveView("home");
                      setSearchParams(prev => {
                        const next = new URLSearchParams(prev);
                        next.set("view", "home");
                        return next;
                      }, { replace: true });
                    }}
                    className="mt-1 text-[12.5px] font-semibold px-4 py-2 rounded-xl bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                  >
                    Volver al inicio
                  </button>
                </div>
              )}

              <OnboardingTour
                run={runTour}
                view={activeView}
                onFinish={handleTourFinish}
                isAdmin={effectiveIsAdmin}
              />
            </div>
            </Suspense>
          </main>
        </div>
      </div>
    </SidebarProvider>
    {/* ── Notificación global (visible en cualquier sección excepto Bandeja) ── */}
    {globalNotif && activeView !== 'inbox' && (
      <div
        className="fixed bottom-6 right-6 z-[9999] w-80 bg-card border border-border/30 rounded-2xl shadow-2xl overflow-hidden cursor-pointer"
        style={{ animation: 'slideInNotif 0.25s ease-out' }}
        onClick={() => {
          openInboxConversation(globalNotif.convId);
          if (globalNotifTimeoutRef.current) clearTimeout(globalNotifTimeoutRef.current);
          setGlobalNotif(null);
        }}
      >
        <div className="flex items-start gap-3 p-4">
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-sm truncate">{globalNotif.clientName}</span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                style={{ backgroundColor: globalNotif.labelColor + '28', color: globalNotif.labelColor }}
              >
                {globalNotif.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{globalNotif.preview || 'Nuevo mensaje'}</p>
          </div>
          <button
            className="text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5"
            onClick={(e) => {
              e.stopPropagation();
              if (globalNotifTimeoutRef.current) clearTimeout(globalNotifTimeoutRef.current);
              setGlobalNotif(null);
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="h-0.5 bg-primary/20">
          <div className="h-full bg-primary/50" style={{ animation: 'notifProgress 5s linear forwards' }} />
        </div>
      </div>
    )}

    <style>{`
      @keyframes slideInNotif {
        from { opacity: 0; transform: translateY(12px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes notifProgress {
        from { width: 100%; }
        to   { width: 0%; }
      }
    `}</style>
    </>
  );
}
