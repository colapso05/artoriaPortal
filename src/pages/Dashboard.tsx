import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { OnboardingTour } from "@/components/dashboard/OnboardingTour";
import ChangePasswordScreen from "@/components/dashboard/ChangePasswordScreen";
import AdminUserManager from "@/components/dashboard/AdminUserManager";
import UsageTracker from "@/components/dashboard/UsageTracker";
import AgentToggle from "@/components/dashboard/AgentToggle";
import WhatsAppInbox from "@/components/dashboard/WhatsAppInbox";
import TicketManager from "@/components/dashboard/TicketManager";
import CoverageMap from "@/components/dashboard/CoverageMap";
import CompanyTeamManager from "@/components/dashboard/CompanyTeamManager";
import AdminDashboardHome from "@/components/dashboard/AdminDashboardHome";
import ClientDashboardHome from "@/components/dashboard/ClientDashboardHome";



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
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);

  const [activeToggle, setActiveToggle] = useState<UserToggle | null>(null);
  const [companyRole, setCompanyRole] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [operatorRoles, setOperatorRoles] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState<string>("");
  const [simulatedCompanyId, setSimulatedCompanyId] = useState<string | null>(null);
  const [simulatedCompanyName, setSimulatedCompanyName] = useState<string>("");
  const [runTour, setRunTour] = useState(false);
  const navigate = useNavigate();

  const effectiveIsAdmin = simulatedCompanyId ? false : isAdmin;
  const effectiveCompanyId = simulatedCompanyId || companyId;
  const effectiveCompanyRole = simulatedCompanyId ? "administrador" : companyRole;
  const effectiveCompanyName = simulatedCompanyId ? simulatedCompanyName : companyName;

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

      // Get company name
      const { data: configData } = await supabase
        .from("company_config")
        .select("company_name")
        .eq("id", cd.company_id)
        .single();
      if (configData) setCompanyName(configData.company_name);
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

  const handleViewChange = (view: string, unused_module?: any, toggle?: UserToggle) => {
    setActiveView(view);
    setActiveToggle(toggle || null);
  };

  useEffect(() => {
    if ((activeView === "inbox" || activeView === "team") && !localStorage.getItem(`tour_seen_${activeView}`)) {
      const timer = setTimeout(() => setRunTour(true), 500);
      return () => clearTimeout(timer);
    }
  }, [activeView]);

  const handleTourFinish = () => {
    setRunTour(false);
    localStorage.setItem(`tour_seen_${activeView}`, "true");
  };

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
        />

        <div className="flex-1 flex flex-col min-w-0">
          {activeView !== "inbox" && (
            <DashboardHeader
              email={session.user.email}
              displayName={displayName}
              onLogout={handleLogout}
              simulatedCompanyName={simulatedCompanyName}
              onStopSimulation={() => {
                setSimulatedCompanyId(null);
                setSimulatedCompanyName("");
                setActiveView("users");
              }}
            />
          )}

          <main className={`flex-1 min-h-0 flex flex-col ${activeView === "home" ? "overflow-y-auto" : "overflow-hidden"} ${activeView === "inbox" ? "p-0" : "p-4 md:p-6 lg:p-8"}`}>
            <div className={`flex-1 flex flex-col w-full max-w-none ${activeView === "home" ? "" : "min-h-0"}`}>
              {activeView === "home" && effectiveIsAdmin && <AdminDashboardHome />}
              {activeView === "home" && !effectiveIsAdmin && (
                <ClientDashboardHome 
                  companyId={effectiveCompanyId} 
                  companyName={effectiveCompanyName} 
                  userId={session.user.id} 
                  userName={displayName}
                  userRole={effectiveCompanyRole || undefined}
                  operatorRoles={operatorRoles}
                  onConversationClick={(id) => {
                    setPendingConversationId(id);
                    setActiveView("inbox");
                  }}
                />
              )}
              {activeView === "users" && isAdmin && (
                <AdminUserManager onSimulate={(id, name) => {
                  setSimulatedCompanyId(id);
                  setSimulatedCompanyName(name);
                  setActiveView("home");
                }} />
              )}

              {activeView === "inbox" && (effectiveIsAdmin || hasPermission("inbox")) && (
                <WhatsAppInbox 
                  companyId={effectiveCompanyId || undefined} 
                  userId={session.user.id}
                  userName={displayName}
                  userRole={effectiveCompanyRole || undefined}
                  operatorRoles={operatorRoles}
                  initialConversationId={pendingConversationId || undefined}
                  onConversationOpened={() => setPendingConversationId(null)}
                />
              )}
              {activeView === "tickets" && (effectiveIsAdmin || hasPermission("tickets")) && <TicketManager companyId={effectiveCompanyId || undefined} />}
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


              {activeView.startsWith("toggle-") && activeToggle && (
                <div className="max-w-xl">
                  <AgentToggle tableId={activeToggle.nocodb_table_id} name={activeToggle.name} />
                </div>
              )}

              <OnboardingTour
                run={runTour}
                view={activeView}
                onFinish={handleTourFinish}
              />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
