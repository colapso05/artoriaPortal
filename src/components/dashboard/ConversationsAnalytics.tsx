import { motion } from "framer-motion";
import { MessageCircle, BarChart3, TrendingUp, Clock, Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  companyName?: string;
}

const placeholderCards = [
  { icon: MessageCircle, label: "Total Conversaciones", color: "#10b981" },
  { icon: TrendingUp,    label: "Tasa de Respuesta",   color: "#3b82f6" },
  { icon: Clock,         label: "Tiempo Promedio",      color: "#f59e0b" },
  { icon: BarChart3,     label: "Conversaciones / Día", color: "#8b5cf6" },
];

export default function ConversationsAnalytics({ companyName }: Props) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-3xl font-extrabold tracking-tight font-display mb-1">
          Análisis de <span className="text-emerald-500">Conversaciones</span>
        </h2>
        <p className="text-muted-foreground/70 text-sm">
          Estadísticas de conversaciones de <span className="font-semibold text-foreground/80">{companyName}</span>
        </p>
      </motion.div>

      {/* Placeholder KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {placeholderCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
          >
            <Card
              className="border bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden"
              style={{ borderColor: `${card.color}30`, background: `linear-gradient(to bottom right, ${card.color}15, ${card.color}05)` }}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">{card.label}</p>
                    <div className="h-9 w-20 mt-2 rounded-lg bg-muted/30 animate-pulse" />
                  </div>
                  <div
                    className="w-12 h-12 rounded-2xl bg-background/50 flex items-center justify-center shadow-inner opacity-40"
                  >
                    <card.icon className="w-6 h-6" style={{ color: card.color }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* En construcción */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        <Card className="border-border/20 bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden">
          <CardContent className="py-20 flex flex-col items-center justify-center text-center gap-5">
            <div className="w-20 h-20 rounded-3xl bg-amber-500/10 flex items-center justify-center">
              <Construction className="w-10 h-10 text-amber-500" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-2">Sección en Construcción</h3>
              <p className="text-muted-foreground/70 text-sm max-w-md">
                Los gráficos y métricas detalladas de conversaciones estarán disponibles próximamente.
                Esta sección está siendo coordinada con el equipo de backend.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">En desarrollo</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
