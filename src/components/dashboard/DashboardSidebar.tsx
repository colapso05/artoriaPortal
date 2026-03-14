import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Users, Database, FolderKanban, Home,
  HelpCircle, Sparkles, Activity, Bot, MessageCircle, Ticket, MapPin, UserCog,
} from "lucide-react";
import { motion } from "framer-motion";

interface UserToggle {
  id: string;
  name: string;
  nocodb_table_id: string;
}

interface DashboardSidebarProps {
  isAdmin: boolean;
  activeView: string;
  onViewChange: (view: string, module?: any, toggle?: UserToggle) => void;
  toggles?: UserToggle[];
  companyRole?: string | null;
  companyName?: string;
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  administrador: ["team", "inbox", "coverage", "tickets"],
  supervisor: ["inbox", "tickets"],
  operador: ["inbox", "tickets"],
};

const iconMap: Record<string, any> = {
  table: Database,
  folder: FolderKanban,
  default: Database,
};

const menuItemClass = `
  rounded-xl h-10 gap-3 text-sm font-medium transition-all duration-200
  data-[active=true]:bg-gradient-to-r data-[active=true]:from-primary/20 data-[active=true]:to-primary/5
  data-[active=true]:text-primary data-[active=true]:shadow-[inset_3px_0_0_0_hsl(var(--primary))]
  hover:bg-secondary/60 hover:translate-x-0.5
`;

const toggleItemClass = `
  rounded-xl h-10 gap-3 text-sm font-medium transition-all duration-200
  data-[active=true]:bg-gradient-to-r data-[active=true]:from-emerald-500/20 data-[active=true]:to-emerald-500/5
  data-[active=true]:text-emerald-500 data-[active=true]:shadow-[inset_3px_0_0_0_hsl(150,60%,50%)]
  hover:bg-secondary/60 hover:translate-x-0.5
`;

export default function DashboardSidebar({ isAdmin, activeView, onViewChange, toggles = [], companyRole, companyName }: DashboardSidebarProps) {
  const { state, setOpen, isMobile } = useSidebar();
  const collapsed = state === "collapsed";

  const hasPermission = (view: string): boolean => {
    if (isAdmin) return true;
    if (!companyRole) return false;
    return (ROLE_PERMISSIONS[companyRole] || []).includes(view);
  };

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 font-bold px-3 mb-1.5 mt-1">
      {children}
    </SidebarGroupLabel>
  );

  const NavItem = ({ view, icon: Icon, label, className = menuItemClass }: { view: string; icon: any; label: string; className?: string }) => (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => {
          onViewChange(view);
          if (isMobile) {
            setOpen(false); // only close if it's acting as a real drawer
          } else {
            setOpen(false); // auto-collapse sidebar on desktop when navigating to leave more room
          }
        }}
        isActive={activeView === view}
        tooltip={label}
        className={className}
      >
        <Icon className="w-[18px] h-[18px] flex-shrink-0 opacity-80" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar className="border-r border-border/20 bg-gradient-to-b from-card/60 to-card/40 backdrop-blur-xl z-50" collapsible="icon">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border/20">
        <div className="flex items-center gap-3 overflow-hidden">
          <motion.div
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-primary/80 to-primary/50 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20"
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <Sparkles className="w-4.5 h-4.5 text-primary-foreground" />
          </motion.div>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="min-w-0"
            >
              <h2 className="text-sm font-extrabold tracking-tight gradient-text">ARTORIA</h2>
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-[0.2em] font-semibold">Portal</p>
            </motion.div>
          )}
        </div>
      </div>

      <SidebarContent className="px-2 py-4 space-y-1">
        {/* Admin section */}
        {isAdmin && (
          <SidebarGroup>
            <SectionLabel>Administración</SectionLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                <NavItem view="home" icon={Home} label="Inicio" />
                <NavItem view="users" icon={Users} label="Empresas" />
                <NavItem view="inbox" icon={MessageCircle} label="Bandeja" />
                <NavItem view="tickets" icon={Ticket} label="Tickets" />
                <NavItem view="coverage" icon={MapPin} label="Coberturas" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Company role-based section */}
        {!isAdmin && companyRole && (
          <SidebarGroup>
            <SectionLabel>{companyName || "Mi Empresa"}</SectionLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                <NavItem view="home" icon={Home} label="Inicio" />
                {hasPermission("team") && <NavItem view="team" icon={UserCog} label="Equipo" />}
                {hasPermission("inbox") && <NavItem view="inbox" icon={MessageCircle} label="Bandeja" />}
                {hasPermission("tickets") && <NavItem view="tickets" icon={Ticket} label="Tickets" />}
                {hasPermission("coverage") && <NavItem view="coverage" icon={MapPin} label="Coberturas" />}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}



        {/* Toggles */}
        {toggles.length > 0 && (
          <SidebarGroup>
            <SectionLabel>Agentes</SectionLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {toggles.map(tog => (
                  <SidebarMenuItem key={tog.id}>
                    <SidebarMenuButton
                      onClick={() => onViewChange(`toggle-${tog.id}`, undefined, tog)}
                      isActive={activeView === `toggle-${tog.id}`}
                      tooltip={tog.name}
                      className={toggleItemClass}
                    >
                      <Bot className="w-[18px] h-[18px] flex-shrink-0 opacity-80" />
                      <span className="truncate">{tog.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Fallback for no role */}
        {!isAdmin && !companyRole && (
          <SidebarGroup>
            <SectionLabel>Mi Cuenta</SectionLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                <NavItem view="home" icon={Home} label="Inicio" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="px-2 pb-4 border-t border-border/20 pt-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Ayuda"
              className="rounded-xl h-10 gap-3 text-sm text-muted-foreground/70 hover:text-foreground hover:bg-secondary/50 transition-all duration-200"
            >
              <HelpCircle className="w-[18px] h-[18px] flex-shrink-0" />
              <span>Ayuda</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
