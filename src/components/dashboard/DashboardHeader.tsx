import { Button } from "@/components/ui/button";
import { LogOut, Bell, ChevronDown, Settings } from "lucide-react";
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

interface DashboardHeaderProps {
  email: string;
  displayName?: string;
  onLogout: () => void;
  simulatedCompanyName?: string;
  onStopSimulation?: () => void;
}

export default function DashboardHeader({ email, displayName, onLogout, simulatedCompanyName, onStopSimulation }: DashboardHeaderProps) {
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
              className="flex items-center gap-2 ml-4 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full"
            >
              <span className="text-xs font-semibold text-amber-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Simulando: {simulatedCompanyName}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] uppercase font-bold text-amber-500 hover:text-amber-600 hover:bg-amber-500/20 ml-2"
                onClick={onStopSimulation}
              >
                Salir
              </Button>
            </motion.div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground/60 hover:text-foreground relative group"
          >
            <Bell className="w-4 h-4 group-hover:scale-110 transition-transform" />
            {/* Notification dot */}
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          </Button>

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
              <DropdownMenuItem className="cursor-pointer rounded-lg h-9 gap-2.5 text-sm text-muted-foreground hover:text-foreground">
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
