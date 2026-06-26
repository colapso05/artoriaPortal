import { motion, useScroll, useTransform } from "framer-motion";

export function ScrollBackground() {
  const { scrollYProgress } = useScroll();

  const yBlue = useTransform(scrollYProgress, [0, 1], [0, -320]);
  const yCyan = useTransform(scrollYProgress, [0, 1], [0, 380]);
  const yLines = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const linesOpacity = useTransform(scrollYProgress, [0, 0.3, 1], [0.2, 0.12, 0.04]);

  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
      style={{ background: "radial-gradient(ellipse at 50% 0%, #0e1a2e 0%, #0a1220 45%, #070b14 100%)" }}
    >

      {/* Orbe azul — parallax encima del video */}
      <motion.div
        style={{ y: yBlue }}
        className="absolute -top-32 -left-32 w-[34rem] h-[34rem] rounded-full"
      >
        <motion.div
          className="w-full h-full rounded-full bg-sky-500/15 blur-[120px]"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* Orbe cyan — parallax */}
      <motion.div
        style={{ y: yCyan }}
        className="absolute top-[60%] -right-40 w-[36rem] h-[36rem] rounded-full"
      >
        <motion.div
          className="w-full h-full rounded-full bg-cyan-400/10 blur-[130px]"
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
      </motion.div>

      {/* Líneas de señal */}
      <motion.svg
        style={{ y: yLines, opacity: linesOpacity }}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        viewBox="0 0 1440 900"
        fill="none"
      >
        <defs>
          <linearGradient id="sbLine" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0ea5e9" stopOpacity="0" />
            <stop offset="0.5" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="1" stopColor="#0ea5e9" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[160, 360, 560, 760].map((y, i) => (
          <motion.path
            key={y}
            d={`M0 ${y} C 360 ${y - 60}, 1080 ${y + 60}, 1440 ${y}`}
            stroke="url(#sbLine)"
            strokeWidth="1.2"
            animate={{ pathLength: [0.2, 1, 0.2], opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 8 + i * 2, repeat: Infinity, ease: "easeInOut", delay: i * 1.2 }}
          />
        ))}
      </motion.svg>
    </div>
  );
}

export default ScrollBackground;
