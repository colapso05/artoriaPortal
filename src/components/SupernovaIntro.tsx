import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogoMark } from "@/components/Logo";

const BLUE = "#0ea5e9";
const CYAN = "#22d3ee";

export function SupernovaIntro({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const t = setTimeout(onComplete, 2200);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
        style={{ background: "radial-gradient(ellipse at center, #0a1424 0%, #050a14 70%)" }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Pulsos de señal — ondas concéntricas que emanan del centro (vibe ISP/fibra) */}
        {[0, 0.45, 0.9].map((delay, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border"
            style={{ borderColor: CYAN }}
            initial={{ width: 40, height: 40, opacity: 0 }}
            animate={{
              width: [40, 520],
              height: [40, 520],
              opacity: [0.5, 0],
              borderWidth: [2, 0.5],
            }}
            transition={{ duration: 1.8, delay, ease: "easeOut", repeat: Infinity }}
          />
        ))}

        {/* Núcleo brillante detrás del logo */}
        <motion.div
          className="absolute rounded-full"
          style={{ width: 180, height: 180, background: BLUE, filter: "blur(70px)" }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.55, 0.4], scale: [0.6, 1.1, 1] }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />

        {/* Logo */}
        <motion.div
          className="relative flex flex-col items-center"
          initial={{ opacity: 0, scale: 0.85, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mb-3"
          >
            <LogoMark size={64} glow idSuffix="-intro" />
          </motion.div>
          <h1
            className="text-5xl md:text-6xl font-display font-bold tracking-tight"
            style={{
              background: `linear-gradient(110deg, ${BLUE} 0%, ${CYAN} 60%, #67e8f9 100%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: `0 0 40px ${BLUE}55`,
            }}
          >
            ARTORIA
          </h1>

          {/* Línea que se dibuja del centro hacia los lados */}
          <motion.div
            className="mt-3 h-[2px] rounded-full"
            style={{ background: `linear-gradient(90deg, transparent, ${BLUE}, ${CYAN}, transparent)`, transformOrigin: "center" }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1, width: 220 }}
            transition={{ duration: 0.7, delay: 0.6, ease: "easeOut" }}
          />

          {/* Tagline */}
          <motion.p
            className="mt-4 text-[11px] md:text-xs uppercase tracking-[0.35em] text-cyan-200/70"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.85 }}
          >
            Conectividad inteligente
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
