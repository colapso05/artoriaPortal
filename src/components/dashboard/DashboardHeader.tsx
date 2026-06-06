import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Bell, ChevronDown, Settings, Sparkles, Zap, MessageCircle, Calendar, Clock, CreditCard } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

// ── Versión actual del changelog ─────────────────────────────────────────────
// Cambiar este string al publicar nuevas novedades — los usuarios que ya
// lo vieron (almacenado en user_metadata de Supabase) volverán a verlo.
const CHANGELOG_VERSION = "v2026-06";

interface ChangelogItem {
  icon: React.ElementType;
  color: string;
  bg: string;
  badge?: string;
  title: string;
  desc: string;
  actionLabel?: string;
  onAction?: () => void;
}

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
  onContextoTemporalClick?: () => void; // navega a Configuración + inicia tour
}

export default function DashboardHeader({
  email, displayName, onLogout, onSettings,
  simulatedCompanyName, simulatedUserName, simulatedUserRole,
  onStopSimulation, onAgendaClick, onContextoTemporalClick,
}: DashboardHeaderProps) {
  const [notifSeen, setNotifSeen] = useState(true); // comienza como "visto" hasta que el async confirme
  const [notifOpen, setNotifOpen] = useState(false);

  // ── Leer estado "visto" desde Supabase user_metadata ─────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const seenVersions: string[] = user?.user_metadata?.seen_changelogs ?? [];
      setNotifSeen(seenVersions.includes(CHANGELOG_VERSION));
    });
  }, []);

  const markAsSeen = async () => {
    if (notifSeen) return;
    setNotifSeen(true);
    const { data: { user } } = await supabase.auth.getUser();
    const seenVersions: string[] = user?.user_metadata?.seen_changelogs ?? [];
    if (!seenVersions.includes(CHANGELOG_VERSION)) {
      await supabase.auth.updateUser({
        data: { seen_changelogs: [...seenVersions, CHANGELOG_VERSION] },
      });
    }
  };

  const handleBellOpen = (open: boolean) => {
    setNotifOpen(open);
    if (open) markAsSeen();
  };

  const initials = (displayName || email)
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0].toUpperCase())
    .join("");

  // ── Changelog items ───────────────────────────────────────────────────────
  const changelog: ChangelogItem[] = [
    {
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      badge: "NUEVO",
      title: "Contexto Temporal del Agente IA",
      desc: "¿Feriado el lunes? ¿Promoción esta semana? Ahora podés darle instrucciones temporales al agente IA que se activan automáticamente y se borran solas al vencer — sin tocar el prompt principal.",
      actionLabel: "Ver cómo funciona →",
      onAction: onContextoTemporalClick,
    },
    {
      icon: CreditCard,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      badge: "NUEVO",
      title: "Facturación con MercadoPago",
      desc: "Podés pagar tus boletas directamente desde el portal con tarjeta de crédito o débito a través de MercadoPago. Sin redireccionamientos — el formulario aparece dentro del portal.",
      actionLabel: "",
    },
    {
      icon: MessageCircle,
      color: "text-primary",
      bg: "bg-primary/10",
      title: "Búsqueda de mensajes en la Bandeja",
      desc: "El buscador ahora encuentra conversaciones por el contenido de sus mensajes, no solo por el nombre. Mientras más específica sea la búsqueda, menos resultados y más precisos.",
    },
    {
      icon: Zap,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      title: "Notificaciones en tiempo real",
      desc: "Si llegó un mensaje nuevo mientras estabas en otra sección del portal, ahora aparece un banner con el nombre del cliente y el mensaje — sin necesidad de estar en la Bandeja.",
    },
    {
      icon: Calendar,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
      title: "Agenda del día en la Bandeja",
      desc: "Cuando no tenés ninguna conversación abierta, la Bandeja ahora muestra la agenda de citas del día y un bloc de notas para el turno — todo en el panel izquierdo.",
    },
  ];

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

          {/* ── Campanita de novedades ── */}
          <DropdownMenu open={notifOpen} onOpenChange={handleBellOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost" size="icon"
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
              className="w-[420px] bg-card/98 backdrop-blur-xl border-border/30 shadow-2xl rounded-2xl p-0 overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-border/15 bg-gradient-to-r from-primary/5 to-amber-500/5">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <p className="text-base font-bold tracking-tight">Novedades del portal</p>
                </div>
                <p className="text-xs text-muted-foreground/60 mt-1">Últimas mejoras y funcionalidades agregadas</p>
              </div>

              {/* Items */}
              <div className="divide-y divide-border/10 max-h-[460px] overflow-y-auto">
                {changelog.map((item, i) => (
                  <div
                    key={i}
                    className={`px-6 py-4 flex gap-4 transition-colors ${item.onAction ? "cursor-pointer hover:bg-amber-500/5" : "hover:bg-secondary/20"}`}
                    onClick={() => {
                      if (item.onAction) {
                        item.onAction();
                        setNotifOpen(false);
                      }
                    }}
                  >
                    <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <item.icon className={`w-5 h-5 ${item.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[14px] font-bold leading-snug">{item.title}</p>
                        {item.badge && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-400 uppercase tracking-widest shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-muted-foreground/70 leading-relaxed">{item.desc}</p>
                      {item.actionLabel && (
                        <p className="text-[11px] font-semibold text-primary mt-1.5">{item.actionLabel}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 border-t border-border/15 bg-muted/10">
                <p className="text-[10px] text-muted-foreground/40 text-center">
                  Actualización {CHANGELOG_VERSION} · Portal Artoria
                </p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

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
              <button
                onClick={onSettings}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
              >
                <Settings className="w-4 h-4" />
                Configuración
              </button>
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Cerrar Sesión
              </button>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
