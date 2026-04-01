import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function SupernovaIntro({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"nodes" | "connect" | "reveal" | "complete">("nodes");

  const nodes = [
    { x: 50, y: 30 },
    { x: 20, y: 50 },
    { x: 80, y: 50 },
    { x: 35, y: 70 },
    { x: 65, y: 70 },
    { x: 50, y: 50 },
  ];

  const connections = [
    [0, 5], [1, 5], [2, 5], [3, 5], [4, 5],
    [0, 1], [0, 2], [1, 3], [2, 4], [3, 4],
  ];

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("connect"), 400),
      setTimeout(() => setPhase("reveal"), 1200),
      setTimeout(() => {
        setPhase("complete");
        onComplete();
      }, 2000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  if (phase === "complete") return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
        style={{ background: "hsl(270 50% 4%)" }}
        initial={{ opacity: 1 }}
        animate={{ opacity: phase === "reveal" ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Subtle grid background */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(280 100% 70% / 0.1) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(280 100% 70% / 0.1) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Neural Network Container */}
        <div className="relative w-80 h-80 md:w-96 md:h-96">
          {/* Connection Lines */}
          <svg className="absolute inset-0 w-full h-full">
            {connections.map(([from, to], i) => (
              <motion.line
                key={i}
                x1={`${nodes[from].x}%`}
                y1={`${nodes[from].y}%`}
                x2={`${nodes[to].x}%`}
                y2={`${nodes[to].y}%`}
                stroke="url(#purpleGradient)"
                strokeWidth="1"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={phase !== "nodes" ? { pathLength: 1, opacity: 0.6 } : {}}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              />
            ))}
            <defs>
              <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(280 100% 70%)" />
                <stop offset="100%" stopColor="hsl(320 100% 60%)" />
              </linearGradient>
            </defs>
          </svg>

          {/* Nodes */}
          {nodes.map((node, i) => (
            <motion.div
              key={i}
              className="absolute"
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                transform: "translate(-50%, -50%)",
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                duration: 0.3,
                delay: i * 0.06,
                type: "spring",
                stiffness: 300,
              }}
            >
              {/* Node glow */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    i === 5
                      ? "radial-gradient(circle, hsl(280 100% 70% / 0.4) 0%, transparent 70%)"
                      : "radial-gradient(circle, hsl(280 100% 70% / 0.2) 0%, transparent 70%)",
                  width: i === 5 ? 60 : 40,
                  height: i === 5 ? 60 : 40,
                  transform: "translate(-50%, -50%)",
                  left: "50%",
                  top: "50%",
                }}
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.5, 0.8, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.1,
                }}
              />
              {/* Node core */}
              <div
                className="rounded-full border"
                style={{
                  width: i === 5 ? 16 : 10,
                  height: i === 5 ? 16 : 10,
                  background:
                    i === 5
                      ? "linear-gradient(135deg, hsl(280 100% 70%), hsl(320 100% 60%))"
                      : "hsl(280 100% 70%)",
                  borderColor: "hsl(280 100% 80% / 0.5)",
                  boxShadow:
                    i === 5
                      ? "0 0 20px hsl(280 100% 70% / 0.8)"
                      : "0 0 10px hsl(280 100% 70% / 0.5)",
                }}
              />
            </motion.div>
          ))}

          {/* Central brand text */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={phase !== "nodes" ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <motion.h1
              className="text-4xl md:text-5xl font-display font-bold gradient-text"
              style={{
                textShadow: "0 0 30px hsl(280 100% 70% / 0.5)",
              }}
            >
              ARTORIA
            </motion.h1>
          </motion.div>
        </div>

        {/* Tagline */}
        <motion.p
          className="absolute bottom-1/3 text-sm md:text-base text-muted-foreground tracking-widest uppercase"
          initial={{ opacity: 0, y: 10 }}
          animate={phase !== "nodes" ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          Inteligencia Artificial
        </motion.p>
      </motion.div>
    </AnimatePresence>
  );
}
