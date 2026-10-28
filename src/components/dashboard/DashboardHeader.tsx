import { Button } from "@/components/ui/button";
import { LogOut, ChevronDown, Settings } from "lucide-react";
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
import { motion } from "framer-motion";
import CampanaNotificaciones from "@/components/dashboard/CampanaNotificaciones";
import { useNovedades, CHANGELOG_VERSION } from "@/hooks/useNovedades";

interface DashboardHeaderProps {
  email: string;
  userId?: string;
  /** Abre la conversación de una notificación de caso. */
  onAbrirConversacion?: (conversationId: string) => void;
  /** Lleva a Configuración, donde se vuelve a vincular el canal sin costo. */
  onAbrirVinculacion?: () => void;
  displayName?: string;
  onLogout: () => void;
  onSettings?: () => void;
  simulatedCompanyName?: string;
  simulatedUserName?: string;
  simulatedUserRole?: string | null;
  onStopSimulation?: () => void;
  onAgendaClick?: () => void;
  onContextoTemporalClick?: () => void; // navega a Configuración + inicia tour
}

export default function DashboardHeader({
  email, userId, onAbrirConversacion, onAbrirVinculacion, displayName, onLogout, onSettings,
  simulatedCompanyName, simulatedUserName, simulatedUserRole,
  onStopSimulation, onAgendaClick, onContextoTemporalClick,
}: DashboardHeaderProps) {
  const { novedades, vistas, marcarVistas } = useNovedades({ onContextoTemporal: onContextoTemporalClick });

  const initials = (displayName || email)
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0].toUpperCase())
    .join("");

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
                variant="ghost" size="sm"
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

          {/* ── Campana: avisos de casos + novedades del portal ── */}
          <CampanaNotificaciones
            userId={userId}
            onAbrirConversacion={onAbrirConversacion}
            onAbrirVinculacion={onAbrirVinculacion}
            novedades={novedades}
            versionNovedades={CHANGELOG_VERSION}
            novedadesVistas={vistas}
            onVerNovedades={marcarVistas}
          />

          <div className="h-5 w-px bg-border/30 mx-1 hidden sm:block" />

          {/* Menú de usuario */}
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
              {/*
               * DropdownMenuItem y no <button>.
               *
               * Radix cierra el menú cuando se elige un item suyo; un <button> común
               * adentro del panel no dispara nada, así que el menú quedaba abierto
               * encima de la pantalla a la que uno acababa de entrar.
               */}
              <DropdownMenuItem
                onSelect={onSettings}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-muted-foreground focus:text-foreground focus:bg-secondary/40 cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                Configuración
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onLogout}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
              >
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
