import { motion } from "framer-motion";

// Animated Clock Icon - hands rotate on hover
export function AnimatedClock({ isHovered }: { isHovered: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="clockGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="clockGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(280, 100%, 70%)" />
          <stop offset="100%" stopColor="hsl(320, 100%, 60%)" />
        </linearGradient>
      </defs>

      {/* Clock circle */}
      <motion.circle
        cx="50"
        cy="50"
        r="42"
        stroke="url(#clockGradient)"
        strokeWidth="3"
        fill="none"
        filter="url(#clockGlow)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />

      {/* Hour markers */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => (
        <motion.circle
          key={angle}
          cx={50 + 35 * Math.sin((angle * Math.PI) / 180)}
          cy={50 - 35 * Math.cos((angle * Math.PI) / 180)}
          r={i % 3 === 0 ? 3 : 1.5}
          fill="hsl(280, 100%, 70%)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 * i, duration: 0.3 }}
        />
      ))}

      {/* Center dot */}
      <motion.circle
        cx="50"
        cy="50"
        r="4"
        fill="url(#clockGradient)"
        animate={{ scale: isHovered ? [1, 1.3, 1] : 1 }}
        transition={{ duration: 0.5, repeat: isHovered ? Infinity : 0 }}
      />

      {/* Hour hand */}
      <motion.line
        x1="50"
        y1="50"
        x2="50"
        y2="28"
        stroke="hsl(280, 100%, 70%)"
        strokeWidth="4"
        strokeLinecap="round"
        style={{ originX: "50px", originY: "50px" }}
        animate={{ rotate: isHovered ? 360 : 0 }}
        transition={{
          duration: 2,
          repeat: isHovered ? Infinity : 0,
          ease: "linear",
        }}
      />

      {/* Minute hand */}
      <motion.line
        x1="50"
        y1="50"
        x2="50"
        y2="18"
        stroke="hsl(320, 100%, 60%)"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ originX: "50px", originY: "50px" }}
        animate={{ rotate: isHovered ? 720 : 0 }}
        transition={{
          duration: 2,
          repeat: isHovered ? Infinity : 0,
          ease: "linear",
        }}
      />
    </svg>
  );
}

// Animated Lightning Icon - pulses and sparks on hover
export function AnimatedLightning({ isHovered }: { isHovered: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="lightningGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="lightningGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(280, 100%, 70%)" />
          <stop offset="100%" stopColor="hsl(320, 100%, 60%)" />
        </linearGradient>
      </defs>

      {/* Main lightning bolt */}
      <motion.path
        d="M55 10 L35 45 L50 45 L30 90 L70 40 L52 40 L70 10 Z"
        fill="url(#lightningGradient)"
        filter="url(#lightningGlow)"
        animate={{
          scale: isHovered ? [1, 1.1, 1] : 1,
          opacity: isHovered ? [1, 0.8, 1] : 1,
        }}
        transition={{
          duration: 0.3,
          repeat: isHovered ? Infinity : 0,
          repeatType: "reverse",
        }}
      />

      {/* Spark particles */}
      {isHovered && (
        <>
          {[
            { x: 25, y: 30, delay: 0 },
            { x: 75, y: 25, delay: 0.1 },
            { x: 20, y: 60, delay: 0.2 },
            { x: 80, y: 55, delay: 0.15 },
            { x: 35, y: 80, delay: 0.25 },
            { x: 70, y: 75, delay: 0.1 },
          ].map((spark, i) => (
            <motion.circle
              key={i}
              cx={spark.x}
              cy={spark.y}
              r="2"
              fill="hsl(280, 100%, 70%)"
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1.5, 0],
                x: [0, (Math.random() - 0.5) * 20],
                y: [0, (Math.random() - 0.5) * 20],
              }}
              transition={{
                duration: 0.6,
                delay: spark.delay,
                repeat: Infinity,
                repeatDelay: 0.3,
              }}
            />
          ))}
        </>
      )}

      {/* Electric arcs */}
      {isHovered && (
        <>
          <motion.path
            d="M25 50 Q30 45 28 40"
            stroke="hsl(280, 100%, 70%)"
            strokeWidth="1.5"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: [0, 1, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 0.4, repeat: Infinity, repeatDelay: 0.5 }}
          />
          <motion.path
            d="M75 45 Q72 50 78 55"
            stroke="hsl(320, 100%, 60%)"
            strokeWidth="1.5"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: [0, 1, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 0.4, delay: 0.2, repeat: Infinity, repeatDelay: 0.5 }}
          />
        </>
      )}
    </svg>
  );
}

// Animated Chart Icon - bars grow and coins fall on hover
export function AnimatedSavings({ isHovered }: { isHovered: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="savingsGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="savingsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(280, 100%, 70%)" />
          <stop offset="100%" stopColor="hsl(320, 100%, 60%)" />
        </linearGradient>
      </defs>

      {/* Trend arrow going down (costs reducing) */}
      <motion.path
        d="M15 25 L45 50 L60 35 L85 60"
        stroke="url(#savingsGradient)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter="url(#savingsGlow)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />

      {/* Arrow head */}
      <motion.path
        d="M78 52 L85 60 L77 67"
        stroke="url(#savingsGradient)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      />

      {/* Coins/savings indicators */}
      {[
        { cx: 25, cy: 75, r: 10, delay: 0 },
        { cx: 50, cy: 80, r: 8, delay: 0.1 },
        { cx: 72, cy: 82, r: 9, delay: 0.2 },
      ].map((coin, i) => (
        <motion.g key={i}>
          <motion.circle
            cx={coin.cx}
            cy={coin.cy}
            r={coin.r}
            fill="url(#savingsGradient)"
            filter="url(#savingsGlow)"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              y: isHovered ? [0, -5, 0] : 0,
            }}
            transition={{
              scale: { delay: 0.5 + coin.delay, duration: 0.3 },
              opacity: { delay: 0.5 + coin.delay, duration: 0.3 },
              y: {
                duration: 0.5,
                delay: coin.delay,
                repeat: isHovered ? Infinity : 0,
                repeatDelay: 0.2,
              },
            }}
          />
          <motion.text
            x={coin.cx}
            y={coin.cy + 4}
            textAnchor="middle"
            fill="hsl(270, 50%, 4%)"
            fontSize={coin.r * 1.2}
            fontWeight="bold"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 + coin.delay }}
          >
            $
          </motion.text>
        </motion.g>
      ))}

      {/* Flying coins on hover */}
      {isHovered && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.circle
              key={`fly-${i}`}
              cx={30 + i * 20}
              cy={90}
              r="5"
              fill="hsl(280, 100%, 70%)"
              initial={{ y: 0, opacity: 1 }}
              animate={{
                y: -40 - i * 10,
                opacity: 0,
                x: (Math.random() - 0.5) * 30,
              }}
              transition={{
                duration: 0.8,
                delay: i * 0.15,
                repeat: Infinity,
                repeatDelay: 0.5,
              }}
            />
          ))}
        </>
      )}
    </svg>
  );
}
