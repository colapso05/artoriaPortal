import React, { useState, useEffect, useCallback, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
// ── Siempre cargados (layout visible desde el primer render) ──────────────────
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { OnboardingTour } from "@/components/dashboard/OnboardingTour";
import ChangePasswordScreen from "@/components/dashboard/ChangePasswordScreen";
import AgentToggle from "@/components/dashboard/AgentToggle";
import { syncShortcutsCache } from "@/components/dashboard/ShortcutsManager";
// ── Lazy: se cargan solo cuando el usuario navega a esa vista ─────────────────
const AdminUserManager     = React.lazy(() => import("@/components/dashboard/AdminUserManager"));
const WhatsAppInbox        = React.lazy(() => import("@/components/dashboard/WhatsAppInbox"));
const TicketManager        = React.lazy(() => import("@/components/dashboard/TicketManager"));
const CoverageMap          = React.lazy(() => import("@/components/dashboard/CoverageMap"));
const CompanyTeamManager   = React.lazy(() => import("@/components/dashboard/CompanyTeamManager"));
const AdminDashboardHome   = React.lazy(() => import("@/components/dashboard/AdminDashboardHome"));
const ClientDashboardHome  = React.lazy(() => import("@/components/dashboard/ClientDashboardHome"));
const AdminAgentReports    = React.lazy(() => import("@/components/dashboard/AdminAgentReports"));
const ShortcutsManager     = React.lazy(() => import("@/components/dashboard/ShortcutsManager"));
const SettingsPage         = React.lazy(() => import("@/components/dashboard/SettingsPage"));
const CreditsManager       = React.lazy(() => import("@/components/dashboard/CreditsManager"));
const MyReports            = React.lazy(() => import("@/components/dashboard/MyReports"));
const AdminCreditRequests  = React.lazy(() => import("@/components/dashboard/AdminCreditRequests"));
const ConversationsAnalytics = React.lazy(() => import("@/components/dashboard/ConversationsAnalytics"));
const ScheduleManager        = React.lazy(() => import("@/components/dashboard/schedule/ScheduleManager"));

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
  const [activeView, setActiveView] = useState("");
  const [sidebarIconSize, setSidebarIconSize] = useState<number>(24);
  // Guardamos el tamaño del admin para restaurarlo al salir de simulación
  const adminIconSizeRef = React.useRef<number>(24);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);

  const [activeToggle, setActiveToggle] = useState<UserToggle | null>(null);
  const [companyRole, setCompanyRole] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [operatorRoles, setOperatorRoles] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState<string>("");
  const [simulatedCompanyId, setSimulatedCompanyId] = useState<string | null>(null);
  const [simulatedCompanyName, setSimulatedCompanyName] = useState<string>("");
  const [simulatedUserName, setSimulatedUserName] = useState<string>("");
  const [simulatedUserRole, setSimulatedUserRole] = useState<string | null>(null);
  const [simulatedUserOperatorRoles, setSimulatedUserOperatorRoles] = useState<string[]>([]);
  const [creditsEnabled, setCreditsEnabled] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [ticketInitialFilter, setTicketInitialFilter] = useState<string | undefined>();
  const navigate = useNavigate();

  const effectiveIsAdmin = simulatedCompanyId ? false : isAdmin;
  const effectiveCompanyId = simulatedCompanyId || companyId;
  const effectiveCompanyRole = simulatedUserRole ?? (simulatedCompanyId ? "administrador" : companyRole);
  const effectiveCompanyName = simulatedCompanyId ? simulatedCompanyName : companyName;
  const effectiveOperatorRoles = simulatedUserRole ? simulatedUserOperatorRoles : operatorRoles;

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) navigate("/portal");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/portal");
        return;
      }
      setSession(session);
      initializeDashboard(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const initializeDashboard = async (userId: string) => {
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

    // Set default view
    if (admin) {
      setActiveView("home");
    } else {
      setActiveView("home");
    }
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
      setActiveView('inbox');
      if (location.state.conversationId) {
        setPendingConversationId(location.state.conversationId);
      }
    }
  }, [location.state]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/portal");
  };

  // Check if current user has permission for a view
  const hasPermission = (view: string): boolean => {
    if (effectiveIsAdmin) return true;
    if (!effectiveCompanyRole) return false;
    const perms = ROLE_PERMISSIONS[effectiveCompanyRole] || [];
    return perms.includes(view);
  };

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
    <SidebarProvider>
      <div className="h-screen overflow-hidden flex w-full bg-gradient-to-br from-background via-background to-background/95">
        <DashboardSidebar
          isAdmin={effectiveIsAdmin}
          activeView={activeView}
          onViewChange={handleViewChange}
          toggles={toggles}
          companyRole={effectiveCompanyRole}
          companyName={effectiveCompanyName}
          isSimulating={!!simulatedCompanyId}
          creditsEnabled={creditsEnabled}
          iconSize={sidebarIconSize}
        />

        <div className="flex-1 flex flex-col min-w-0">
          {activeView !== "inbox" && (
            <DashboardHeader
              email={session.user.email}
              displayName={displayName}
              onLogout={handleLogout}
              onSettings={() => setActiveView("settings")}
              simulatedCompanyName={simulatedCompanyName}
              simulatedUserName={simulatedUserName}
              simulatedUserRole={simulatedUserRole}
              onStopSimulation={() => {
                setSidebarIconSize(adminIconSizeRef.current); // restaurar preferencia del admin
                setSimulatedCompanyId(null);
                setSimulatedCompanyName("");
                setSimulatedUserName("");
                setSimulatedUserRole(null);
                setSimulatedUserOperatorRoles([]);
                setActiveView("users");
              }}
            />
          )}

          <main className={`flex-1 min-h-0 flex flex-col ${activeView === "home" || activeView === "conversations-analytics" ? "overflow-y-auto" : "overflow-hidden"} ${activeView === "inbox" ? "p-0" : "p-4 md:p-6 lg:p-8"}`}>
            <Suspense fallback={<ViewLoader />}>
            <div className={`flex-1 flex flex-col w-full max-w-none ${activeView === "home" ? "" : "min-h-0"}`}>
              {activeView === "home" && effectiveIsAdmin && <AdminDashboardHome />}
              {activeView === "home" && !effectiveIsAdmin && (
                <ClientDashboardHome
                  companyId={effectiveCompanyId}
                  companyName={effectiveCompanyName}
                  userId={session.user.id}
                  userName={displayName}
                  userRole={effectiveCompanyRole || undefined}
                  operatorRoles={effectiveOperatorRoles}
                  onConversationClick={(id) => {
                    setPendingConversationId(id);
                    setActiveView("inbox");
                  }}
                  onNavigateToTickets={(status) => {
                    setTicketInitialFilter(status);
                    setActiveView("tickets");
                  }}
                  creditsEnabled={creditsEnabled}
                  onNavigateToCredits={() => setActiveView("credits")}
                  onNavigateToConversations={() => setActiveView("conversations-analytics")}
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
                      setPendingConversationId(conversationId);
                      setActiveView("inbox");
                    }}
                  />
                </div>
              )}

              {activeView === "inbox" && (effectiveIsAdmin || hasPermission("inbox")) && (
                <WhatsAppInbox
                  companyId={effectiveCompanyId || undefined}
                  userId={session.user.id}
                  userName={displayName}
                  userRole={effectiveCompanyRole || undefined}
                  operatorRoles={effectiveOperatorRoles}
                  initialConversationId={pendingConversationId || undefined}
                  onConversationOpened={() => setPendingConversationId(null)}
                  isSimulating={!!simulatedCompanyId}
                  simulatedUserName={simulatedUserName || simulatedCompanyName || undefined}
                  onNavigateToSchedule={() => setActiveView("schedule")}
                />
              )}
              {activeView === "tickets" && (effectiveIsAdmin || hasPermission("tickets")) && (
                <TicketManager
                  companyId={effectiveCompanyId || undefined}
                  initialFilter={ticketInitialFilter}
                  onOpenConversation={(conversationId) => {
                    setPendingConversationId(conversationId);
                    setActiveView("inbox");
                  }}
                />
              )}
              {activeView === "coverage" && (effectiveIsAdmin || hasPermission("coverage")) && (
                <div className="flex-1 flex flex-col gap-8 min-h-0">
                  <div className="flex-1 min-h-[500px]">
                    <CoverageMap companyId={effectiveCompanyId || undefined} />
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
                <ConversationsAnalytics companyName={effectiveCompanyName} />
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
              {activeView === "my-reports" && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <MyReports userId={session.user.id} companyId={effectiveCompanyId} />
                </div>
              )}
              {activeView === "settings" && (
                <SettingsPage
                  companyId={effectiveCompanyId}
                  userRole={effectiveCompanyRole}
                  userId={session.user.id}
                  isSimulating={!!simulatedCompanyId}
                />
              )}
              {activeView === "schedule" && effectiveCompanyId && (
                <ScheduleManager
                  companyId={effectiveCompanyId}
                  userId={session.user.id}
                  isAdmin={effectiveIsAdmin || effectiveCompanyRole === "administrador"}
                />
              )}


              {activeView.startsWith("toggle-") && activeToggle && (
                <div className="max-w-xl">
                  <AgentToggle tableId={activeToggle.nocodb_table_id} name={activeToggle.name} />
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
  );
}
