import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Clock, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONFIGS = {
  approved: {
    Icon: CheckCircle2,
    iconColor: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    ringColor: "ring-emerald-500/20",
    title: "¡Pago exitoso!",
    description: "Tu pago fue procesado correctamente. La boleta se actualizará en unos momentos.",
    badge: "Pago aprobado",
    badgeColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
  pending: {
    Icon: Clock,
    iconColor: "text-amber-500",
    bgColor: "bg-amber-500/10",
    ringColor: "ring-amber-500/20",
    title: "Pago en proceso",
    description: "Tu pago está siendo procesado. La boleta se actualizará automáticamente cuando se confirme.",
    badge: "En revisión",
    badgeColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  failure: {
    Icon: XCircle,
    iconColor: "text-red-500",
    bgColor: "bg-red-500/10",
    ringColor: "ring-red-500/20",
    title: "El pago no pudo procesarse",
    description: "Hubo un problema con tu método de pago. Puedes intentarlo de nuevo desde el portal.",
    badge: "Pago fallido",
    badgeColor: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  },
} as const;

type Status = keyof typeof CONFIGS;

export default function BillingReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(10);

  const raw = params.get("status") ?? params.get("billing") ?? "approved";
  const status: Status = raw in CONFIGS ? (raw as Status) : "approved";
  const cfg = CONFIGS[status];
  const { Icon } = cfg;

  // Cuenta regresiva y redirige al dashboard
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          navigate("/dashboard");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        {/* Card principal */}
        <div className="rounded-3xl border border-border/40 bg-card shadow-xl overflow-hidden">

          {/* Banda superior de color */}
          <div className={`h-1.5 w-full ${
            status === "approved" ? "bg-emerald-500" : status === "pending" ? "bg-amber-500" : "bg-red-500"
          }`} />

          <div className="p-8 flex flex-col items-center text-center gap-5">

            {/* Icono animado */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 15 }}
              className={`w-20 h-20 rounded-2xl ${cfg.bgColor} ring-8 ${cfg.ringColor} flex items-center justify-center`}
            >
              <Icon className={`w-10 h-10 ${cfg.iconColor}`} />
            </motion.div>

            {/* Badge */}
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className={`text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border ${cfg.badgeColor}`}
            >
              {cfg.badge}
            </motion.span>

            {/* Texto */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-2"
            >
              <h1 className="text-2xl font-extrabold tracking-tight">{cfg.title}</h1>
              <p className="text-[14px] text-muted-foreground/70 leading-relaxed">
                {cfg.description}
              </p>
            </motion.div>

            {/* Botón de vuelta */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="w-full pt-2"
            >
              <Button
                onClick={() => navigate("/dashboard")}
                className="w-full rounded-xl gap-2 font-bold h-11"
              >
                Volver al portal
                <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>

            {/* Cuenta regresiva */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-[11px] text-muted-foreground/40 flex items-center gap-1.5"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              Redirigiendo automáticamente en {countdown}s…
            </motion.p>

          </div>
        </div>

        {/* Logo */}
        <p className="text-center text-[11px] text-muted-foreground/30 mt-5">
          Portal Artoria · Facturación
        </p>
      </motion.div>
    </div>
  );
}
