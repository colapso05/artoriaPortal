import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, Sparkles, Check, MessageCircle, Inbox, PlugZap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useNotificaciones } from "@/hooks/useNotificaciones";

export interface ItemNovedad {
  icon: React.ElementType;
  color: string;
  bg: string;
  badge?: string;
  title: string;
  desc: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface Props {
  userId?: string | null;
  /**
   * Navega a la conversación de la notificación. Sin esto los avisos se marcan
   * como leídos pero no llevan a ninguna parte.
   */
  onAbrirConversacion?: (conversationId: string) => void;
  /** Lleva a la pantalla de vinculacion. Los avisos de sesion caida no traen chat
   *  al cual ir: sin esto quedarian informando un problema sin salida. */
  onAbrirVinculacion?: () => void;
  novedades: ItemNovedad[];
  versionNovedades: string;
  novedadesVistas: boolean;
  onVerNovedades: () => void;
  /** Más chico, para la barra de la bandeja que tiene menos espacio. */
  compacto?: boolean;
}

const ICONO_TIPO: Record<string, React.ElementType> = {
  caso_asignado: Inbox,
  caso_arrebatado: MessageCircle,
  evolution_caida: PlugZap,
  evolution_version: PlugZap,
};

const iniciales = (nombre: string) =>
  nombre.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join("") || "??";

export default function CampanaNotificaciones({
  userId, onAbrirConversacion, onAbrirVinculacion, novedades, versionNovedades,
  novedadesVistas, onVerNovedades, compacto,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<"avisos" | "novedades">("avisos");
  const { noLeidas, lista, cargando, listar, marcarLeida, marcarTodas } = useNotificaciones(userId);

  const alAbrir = (v: boolean) => {
    setAbierto(v);
    if (v) listar(false);
  };

  const irANovedades = () => {
    setPestana("novedades");
    onVerNovedades();
  };

  const tocarAviso = (id: string, convId: string | null, leida: boolean, tipo: string) => {
    if (!leida) marcarLeida(id);
    // Los dos llevan a la misma pantalla: ahí está el estado, la versión instalada
    // y la explicación de por qué a veces el QR no resuelve nada.
    if ((tipo === "evolution_caida" || tipo === "evolution_version") && onAbrirVinculacion) {
      onAbrirVinculacion();
      setAbierto(false);
      return;
    }
    if (convId && onAbrirConversacion) {
      onAbrirConversacion(convId);
      setAbierto(false);
    }
  };

  // El globito rojo es para avisos reales; el punto suave, solo para el changelog.
  const hayPunto = !novedadesVistas && noLeidas === 0;

  return (
    <DropdownMenu open={abierto} onOpenChange={alAbrir}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost" size="icon"
          className={`${compacto ? "h-8 w-8" : "h-9 w-9"} text-muted-foreground/60 hover:text-foreground relative group`}
          title="Notificaciones"
        >
          <Bell className="w-4 h-4 group-hover:scale-110 transition-transform" />
          <AnimatePresence>
            {noLeidas > 0 && (
              <motion.span
                key="contador"
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 flex items-center justify-center shadow-md"
              >
                <span className="text-[9px] font-black text-white leading-none">
                  {noLeidas > 99 ? "99+" : noLeidas}
                </span>
              </motion.span>
            )}
            {hayPunto && (
              <motion.span
                key="punto"
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-primary shadow-md"
              />
            )}
          </AnimatePresence>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[420px] max-w-[calc(100vw-2rem)] bg-card/98 backdrop-blur-xl border-border/30 shadow-2xl rounded-2xl p-0 overflow-hidden"
      >
        {/* Pestañas */}
        <div className="flex items-center border-b border-border/15 bg-gradient-to-r from-primary/5 to-amber-500/5 px-2">
          <button
            onClick={() => setPestana("avisos")}
            className={`relative px-4 py-3 text-[13px] font-bold tracking-tight transition-colors ${pestana === "avisos" ? "text-foreground" : "text-muted-foreground/60 hover:text-foreground/80"}`}
          >
            Avisos
            {noLeidas > 0 && <span className="ml-1.5 text-[10px] font-black text-red-500">{noLeidas}</span>}
            {pestana === "avisos" && <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-primary rounded-full" />}
          </button>
          <button
            onClick={irANovedades}
            className={`relative px-4 py-3 text-[13px] font-bold tracking-tight transition-colors flex items-center gap-1.5 ${pestana === "novedades" ? "text-foreground" : "text-muted-foreground/60 hover:text-foreground/80"}`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Novedades
            {!novedadesVistas && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
            {pestana === "novedades" && <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-primary rounded-full" />}
          </button>

          {pestana === "avisos" && noLeidas > 0 && (
            <button
              onClick={marcarTodas}
              className="ml-auto mr-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 hover:text-primary transition-colors px-2 py-1"
            >
              <Check className="w-3 h-3" /> Marcar todas
            </button>
          )}
        </div>

        {/* ── Avisos ── */}
        {pestana === "avisos" && (
          <div className="divide-y divide-border/10 max-h-[460px] overflow-y-auto">
            {cargando && lista.length === 0 ? (
              <div className="px-6 py-10 text-center text-[12px] text-muted-foreground/60">Cargando…</div>
            ) : lista.length === 0 ? (
              /* Vacío legítimo: no tener avisos no es un error, así se dice. */
              <div className="px-6 py-10 text-center">
                <Bell className="w-8 h-8 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-[13px] font-semibold text-muted-foreground/70">Sin avisos por ahora</p>
                <p className="text-[11px] text-muted-foreground/50 mt-1">
                  Acá aparecen los casos que te transfieren o te quitan.
                </p>
              </div>
            ) : lista.map(n => {
              const Icono = ICONO_TIPO[n.tipo] ?? Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => tocarAviso(n.id, n.conversation_id, n.leida, n.tipo)}
                  className={`w-full text-left px-5 py-3.5 flex gap-3.5 transition-colors hover:bg-secondary/25 ${n.leida ? "" : "bg-primary/[0.06]"}`}
                >
                  {/* Iniciales de quien lo generó; el icono del tipo va encima como distintivo. */}
                  <div className="relative flex-shrink-0 mt-0.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black ${n.leida ? "bg-muted/40 text-muted-foreground/60" : "bg-primary/15 text-primary"}`}>
                      {n.creado_por_nombre ? iniciales(n.creado_por_nombre) : <Icono className="w-4 h-4" />}
                    </div>
                    {n.creado_por_nombre && (
                      <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-card ${n.leida ? "bg-muted" : "bg-primary"}`}>
                        <Icono className={`w-2.5 h-2.5 ${n.leida ? "text-muted-foreground/70" : "text-primary-foreground"}`} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className={`text-[13px] leading-snug flex-1 ${n.leida ? "font-semibold text-muted-foreground/80" : "font-bold"}`}>
                        {n.titulo}
                      </p>
                      {!n.leida && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                    </div>
                    {n.cuerpo && (
                      <p className="text-[12px] text-muted-foreground/70 leading-relaxed mt-0.5">{n.cuerpo}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/40 mt-1">
                      {formatDistanceToNow(new Date(n.creado_en), { addSuffix: true, locale: es })}
                      {n.tipo === "evolution_caida"
                        ? " · toca para volver a vincular"
                        : n.tipo === "evolution_version"
                          ? " · toca para ver la versión instalada"
                          : n.conversation_id ? " · toca para abrir el chat" : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Novedades (el changelog de siempre) ── */}
        {pestana === "novedades" && (
          <>
            <div className="divide-y divide-border/10 max-h-[460px] overflow-y-auto">
              {novedades.map((item, i) => (
                <div
                  key={i}
                  className={`px-6 py-4 flex gap-4 transition-colors ${item.onAction ? "cursor-pointer hover:bg-amber-500/5" : "hover:bg-secondary/20"}`}
                  onClick={() => { if (item.onAction) { item.onAction(); setAbierto(false); } }}
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
            <div className="px-6 py-3.5 border-t border-border/15 bg-muted/10">
              <p className="text-[10px] text-muted-foreground/40 text-center">
                Actualización {versionNovedades} · Portal Artoria
              </p>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
