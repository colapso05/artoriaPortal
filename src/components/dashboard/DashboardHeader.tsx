import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Bell, ChevronDown, Settings, Sparkles, Bug, Map, Zap, LayoutDashboard, CreditCard, ClipboardList, MessageCircle, Calendar } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { motion, AnimatePresence } from "framer-motion";

const CHANGELOG_VERSION = "v2026-04-28";
const SEEN_KEY = `changelog_seen_${CHANGELOG_VERSION}`;

const changelog = [
  {
    icon: Calendar,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    title: "¡Nueva Agenda Inteligente y Jornadas!",
    desc: "Administra a tus técnicos visualmente, revisa su disponibilidad al instante y asigna citas haciendo clic directamente en la grilla del calendario. También agregamos la lista de 'En espera' para técnicos ocupados.",
  },
  {
    icon: MessageCircle,
    color: "text-primary",
    bg: "bg-primary/10",
    title: "Bandeja rediseñada — Panel derecho",
    desc: "El panel derecho ahora tiene pestañas Cliente y Acciones. La info del cliente, categoría, estado IA y motivo del caso están unificados en un solo bloque. El estado del ticket siempre visible sin necesidad de desplegarlo.",
  },
  {
    icon: Zap,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    title: "Mejora de rendimiento — Carga más rápida",
    desc: "El portal ahora carga un 58% más rápido. Los módulos se descargan solo cuando los necesitas, reduciendo la carga inicial de 2.1 MB a 900 KB.",
  },
  {
    icon: Bug,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    title: "Correcciones en Bandeja",
    desc: "Se corrigió el nombre del remitente en mensajes enviados desde vista simulada (ahora aparece el nombre real del operador). Se eliminó el lag al abrir conversaciones causado por llamadas fallidas al sistema de tickets.",
  },
  {
    icon: Settings,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    title: "Ancho del menú lateral configurable",
    desc: "Ahora puedes ajustar el ancho del menú lateral desde Configuración. El cambio se guarda en tu cuenta y se mantiene en todos tus dispositivos.",
  },
  {
    icon: LayoutDashboard,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    title: "Tipos de cliente diferenciados",
    desc: "El ticket ahora distingue entre Cliente existente y Cliente nuevo. Cada tipo muestra sus propios campos: el cliente nuevo incluye correo, plan a contratar y número de TV.",
  },
];

interface DashboardHeaderProps {
  email: string;
  displayName?: string;
  onLogout: () => void;
  onSettings?: () => void;
  simulatedCompanyName?: string;
  simulatedUserName?: string;
  simulatedUserRole?: string | null;
  onStopSimulation?: () => void;
  onAgendaClick?: () => void;
}

export default function DashboardHeader({ email, displayName, onLogout, onSettings, simulatedCompanyName, simulatedUserName, simulatedUserRole, onStopSimulation, onAgendaClick }: DashboardHeaderProps) {
  const [notifSeen, setNotifSeen] = useState(() => !!localStorage.getItem(SEEN_KEY));
  const [notifOpen, setNotifOpen] = useState(false);

  const initials = (displayName || email)
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0].toUpperCase())
    .join("");

  const handleBellOpen = (open: boolean) => {
    setNotifOpen(open);
    if (open && !notifSeen) {
      setNotifSeen(true);
      localStorage.setItem(SEEN_KEY, "true");
    }
  };

  return (
    <header className="h-16 border-b border-border/20 bg-gradient-to-r from-card/80 via-card/60 to-card/80 backdrop-blur-2xl sticky top-0 z-30">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="text-muted-foreground/70 hover:text-foreground transition-colors" />
          <div className="hidden md:block h-5 w-px bg-border/30" />
          <motion.h1
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="hidden md:block text-sm font-semibold text-foreground/70 tracking-wide"
          >
            Panel de Control
          </motion.h1>

          {simulatedCompanyName && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-2 ml-4 px-3 py-1.5 rounded-full border ${simulatedUserName ? "bg-violet-500/10 border-violet-500/20" : "bg-amber-500/10 border-amber-500/20"}`}
            >
              <span className={`text-xs font-semibold flex items-center gap-1.5 ${simulatedUserName ? "text-violet-500" : "text-amber-500"}`}>
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${simulatedUserName ? "bg-violet-500" : "bg-amber-500"}`} />
                {simulatedUserName
                  ? `Simulando: ${simulatedUserName} (${simulatedUserRole ?? "usuario"}) — ${simulatedCompanyName}`
                  : `Simulando: ${simulatedCompanyName}`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 px-2 text-[10px] uppercase font-bold ml-2 ${simulatedUserName ? "text-violet-500 hover:text-violet-600 hover:bg-violet-500/20" : "text-amber-500 hover:text-amber-600 hover:bg-amber-500/20"}`}
                onClick={onStopSimulation}
              >
                Salir
              </Button>
            </motion.div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />

          {/* Notification bell */}
          <DropdownMenu open={notifOpen} onOpenChange={handleBellOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground/60 hover:text-foreground relative group"
              >
                <Bell className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <AnimatePresence>
                  {!notifSeen && (
                    <motion.span
                      key="badge"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shadow-md"
                    >
                      <span className="text-[9px] font-black text-white leading-none">1</span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-96 bg-card/98 backdrop-blur-xl border-border/30 shadow-2xl rounded-2xl p-0 overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-border/15 bg-gradient-to-r from-primary/5 to-violet-500/5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <p className="text-sm font-bold tracking-tight">Novedades y mejoras</p>
                </div>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Últimas actualizaciones de la plataforma</p>
              </div>

              {/* Changelog items */}
              <div className="divide-y divide-border/10 max-h-[420px] overflow-y-auto">
                {changelog.map((item, i) => {
                  const isAgenda = item.title.includes("Agenda");
                  return (
                    <div 
                      key={i} 
                      className={`px-5 py-3.5 flex gap-3 transition-colors ${isAgenda ? 'cursor-pointer hover:bg-violet-500/5' : 'hover:bg-secondary/20'}`}
                      onClick={() => {
                        if (isAgenda && onAgendaClick) {
                          onAgendaClick();
                          setNotifOpen(false);
                        }
                      }}
                    >
                      <div className={`w-8 h-8 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <item.icon className={`w-4 h-4 ${item.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold leading-snug">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border/15 bg-muted/10">
                <p className="text-[10px] text-muted-foreground/40 text-center">
                  Actualización {CHANGELOG_VERSION} · Plataforma Artoria
                </p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-5 w-px bg-border/30 mx-1 hidden sm:block" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-10 gap-2.5 px-2.5 hover:bg-secondary/40 rounded-xl transition-all duration-200">
                <Avatar className="h-8 w-8 ring-2 ring-primary/20 ring-offset-1 ring-offset-background">
                  <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start">
                  <span className="text-sm font-medium text-foreground/90 max-w-[120px] truncate leading-tight">
                    {displayName || email.split("@")[0]}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 leading-tight">Online</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 bg-card/95 backdrop-blur-xl border-border/30 shadow-2xl rounded-xl p-1.5">
              <div className="px-3 py-3">
                <p className="text-sm font-semibold">{displayName || email.split("@")[0]}</p>
                <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{email}</p>
              </div>
              <DropdownMenuSeparator className="bg-border/20" />
              <DropdownMenuItem onClick={onSettings} className="cursor-pointer rounded-lg h-9 gap-2.5 text-sm text-muted-foreground hover:text-foreground">
                <Settings className="w-4 h-4" />
                Configuración
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive cursor-pointer rounded-lg h-9 gap-2.5 text-sm">
                <LogOut className="w-4 h-4" />
                Cerrar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
