import React, { useState } from "react";
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
  HelpCircle, Activity, Bot, MessageCircle, Ticket, MapPin, UserCog, AlertCircle, Zap, CreditCard, ClipboardList, BadgeDollarSign, CalendarDays, Receipt,
  Phone, Mail, Clock, ExternalLink, HeartHandshake, X,
} from "lucide-react";
import { motion } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

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
  isSimulating?: boolean;
  creditsEnabled?: boolean;
  iconSize?: number;
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  administrador: ["team", "inbox", "coverage", "tickets", "schedule"],
  supervisor:    ["inbox", "tickets", "schedule"],
  operador:      ["inbox", "tickets"],
};

const iconMap: Record<string, any> = {
  table: Database,
  folder: FolderKanban,
  default: Database,
};

const menuItemClass = `
  rounded-xl h-10 gap-3 text-sm font-medium transition-all duration-200
  text-sidebar-foreground/70
  data-[active=true]:bg-sidebar-accent data-[active=true]:text-primary data-[active=true]:shadow-[inset_3px_0_0_0_hsl(var(--primary))]
  hover:bg-sidebar-accent/70 hover:text-sidebar-foreground hover:translate-x-0.5
`;

const toggleItemClass = `
  rounded-xl h-10 gap-3 text-sm font-medium transition-all duration-200
  text-sidebar-foreground/70
  data-[active=true]:bg-sidebar-accent data-[active=true]:text-emerald-400 data-[active=true]:shadow-[inset_3px_0_0_0_hsl(150,60%,50%)]
  hover:bg-sidebar-accent/70 hover:text-sidebar-foreground hover:translate-x-0.5
`;

export default function DashboardSidebar({ isAdmin, activeView, onViewChange, toggles = [], companyRole, companyName, isSimulating = false, creditsEnabled = false, iconSize = 24 }: DashboardSidebarProps) {
  const { state, setOpenMobile, isMobile, setOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const [helpOpen, setHelpOpen] = useState(false);

  const hasPermission = (view: string): boolean => {
    if (isAdmin) return true;
    if (!companyRole) return false;
    return (ROLE_PERMISSIONS[companyRole] || []).includes(view);
  };

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.15em] text-sidebar-foreground/40 font-bold px-3 mb-1.5 mt-1">
      {children}
    </SidebarGroupLabel>
  );

  const NavItem = ({ view, icon: Icon, label, className = menuItemClass }: { view: string; icon: any; label: string; className?: string }) => (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => {
          onViewChange(view);
          if (isMobile) setOpenMobile(false);
          if (view === 'inbox') setOpen(false);
        }}
        isActive={activeView === view}
        tooltip={label}
        className={className}
      >
        <Icon
          className="flex-shrink-0 opacity-80 transition-all duration-200"
          style={collapsed ? undefined : { width: 18, height: 18 }}
        />
        <span className="group-data-[state=collapsed]:hidden">{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar z-50" collapsible="icon" style={{ '--sidebar-icon-size': `${iconSize}px` } as React.CSSProperties}>
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border/20">
        <div className="flex items-center gap-3 overflow-hidden">
          <motion.div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
            whileHover={{ scale: 1.08 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <img src="/logo.png" alt="Artoria" className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
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
        {/* Admin section — solo visible cuando NO está simulando */}
        {isAdmin && !isSimulating && (
          <SidebarGroup>
            <SectionLabel>Administración</SectionLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                <NavItem view="home" icon={Home} label="Inicio" />
                <div className="tour-sidebar-empresas"><NavItem view="users" icon={Users} label="Empresas" /></div>
                <NavItem view="reports" icon={AlertCircle} label="Reportes IA" />
                <NavItem view="credit-requests" icon={BadgeDollarSign} label="Solicitudes Créditos" />
                <NavItem view="admin-billing" icon={Receipt} label="Facturación" />
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
                {hasPermission("inbox") && <div className="tour-sidebar-bandeja"><NavItem view="inbox" icon={MessageCircle} label="Bandeja" /></div>}
                {hasPermission("tickets") && <div className="tour-sidebar-tickets"><NavItem view="tickets" icon={Ticket} label="Tickets" /></div>}
                {hasPermission("inbox") && <div className="tour-sidebar-atajos"><NavItem view="shortcuts" icon={Zap} label="Atajos" /></div>}
                {hasPermission("coverage") && <NavItem view="coverage" icon={MapPin} label="Coberturas" />}
                {hasPermission("schedule") && <NavItem view="schedule" icon={CalendarDays} label="Agenda" />}
                {companyRole === "administrador" && creditsEnabled && <NavItem view="credits" icon={CreditCard} label="Créditos" />}
                {companyRole === "administrador" && <NavItem view="billing" icon={Receipt} label="Facturación" />}
                <NavItem view="my-reports" icon={ClipboardList} label="Mis Reportes" />
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
                      onClick={() => { onViewChange(`toggle-${tog.id}`, undefined, tog); if (isMobile) setOpenMobile(false); }}
                      isActive={activeView === `toggle-${tog.id}`}
                      tooltip={tog.name}
                      className={toggleItemClass}
                    >
                      <Bot
                          className="flex-shrink-0 opacity-80 transition-all duration-200"
                          style={collapsed ? undefined : { width: 18, height: 18 }}
                        />
                      <span className="truncate group-data-[state=collapsed]:hidden">{tog.name}</span>
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
                <NavItem view="my-reports" icon={ClipboardList} label="Mis Reportes" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="px-2 pb-4 pt-2 border-t border-sidebar-border/50">
        {/* Necesitas ayuda card */}
        {!collapsed && (
          <div
            className="rounded-xl overflow-hidden mb-2 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, hsl(265,75%,38%), hsl(243,65%,28%))' }}
            onClick={() => setHelpOpen(true)}
          >
            <div className="p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                  <HelpCircle className="w-3.5 h-3.5 text-white" />
                </div>
                <p className="text-[11px] font-bold text-white">¿Necesitas ayuda?</p>
              </div>
              <p className="text-[10px] mb-2.5 pl-8" style={{ color: 'rgba(255,255,255,0.55)' }}>Consulta guías y recursos</p>
              <div className="rounded-lg py-1.5 text-center text-[10px] font-bold text-white transition-colors" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                Ir a ayuda →
              </div>
            </div>
          </div>
        )}
        {/* Ayuda icon (collapsed) */}
        {collapsed && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Ayuda y soporte"
                onClick={() => setHelpOpen(true)}
                className="rounded-xl h-10 gap-3 text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/70 transition-all duration-200"
              >
                <HelpCircle className="flex-shrink-0 transition-all duration-200" style={{ width: 18, height: 18 }} />
                <span className="group-data-[state=collapsed]:hidden">Ayuda</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>

      {/* Panel de soporte Artoria */}
      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent side="left" className="w-[340px] sm:w-[380px] p-0 flex flex-col border-r border-border/20 bg-card">
          <SheetHeader className="px-6 py-5 border-b border-border/10 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <HeartHandshake className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <SheetTitle className="text-base font-bold leading-none">Soporte Artoria</SheetTitle>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">Estamos para ayudarte</p>
                </div>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* Horario */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Clock className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground/90">Horario de atención</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Lunes a Viernes</p>
                <p className="text-xs font-semibold text-emerald-500">9:00 – 19:00 hrs</p>
              </div>
            </div>

            {/* Canales de contacto */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground/50 font-bold uppercase tracking-widest px-1">Contacto directo</p>

              <a
                href="https://wa.me/56940842508?text=Hola%20Artoria%2C%20necesito%20soporte%20con%20el%20portal"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3.5 rounded-xl border border-border/20 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Phone className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">WhatsApp</p>
                  <p className="text-xs text-muted-foreground/60">+56 9 4084 2508</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-emerald-500 transition-colors" />
              </a>

              <a
                href="mailto:soporte@artoria.cl"
                className="flex items-center gap-3 p-3.5 rounded-xl border border-border/20 hover:border-primary/30 hover:bg-primary/5 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Mail className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Correo</p>
                  <p className="text-xs text-muted-foreground/60">soporte@artoria.cl</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
              </a>
            </div>

            {/* Tips rápidos */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground/50 font-bold uppercase tracking-widest px-1">Guía rápida</p>
              <div className="space-y-1.5">
                {[
                  { n: "1", tip: "Gestiona chats en la Bandeja — filtra por etiqueta o cliente" },
                  { n: "2", tip: "Crea tickets desde cualquier conversación con el botón +" },
                  { n: "3", tip: "Configura horarios de atención en la sección Agenda" },
                  { n: "4", tip: "Los reportes del agente IA aparecen en Mis Reportes" },
                ].map(({ n, tip }) => (
                  <div key={n} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-muted/10">
                    <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                    <p className="text-xs text-muted-foreground/70 leading-snug">{tip}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>

          <div className="px-6 py-4 border-t border-border/10 flex-shrink-0">
            <p className="text-[10px] text-center text-muted-foreground/30">Portal Artoria · {new Date().getFullYear()}</p>
          </div>
        </SheetContent>
      </Sheet>
    </Sidebar>
  );
}
