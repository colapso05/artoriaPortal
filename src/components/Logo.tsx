import { motion } from "framer-motion";

/**
 * Isotipo de Artoria — una "A" angular formada por dos trazos ascendentes que
 * convergen en un nodo brillante (evoca una señal / punto de conexión). La barra
 * transversal es una línea de "señal". Gradiente azul→cyan (marca "fibra").
 *
 * Reutilizable: navbar, footer, portal, intro, favicon.
 */

export function LogoMark({
  size = 32,
  className = "",
  glow = false,
  idSuffix = "",
}: {
  size?: number;
  className?: string;
  glow?: boolean;
  idSuffix?: string;
}) {
  const gid = `artoriaGrad${idSuffix}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      style={glow ? { filter: "drop-shadow(0 0 8px rgba(14,165,233,0.55))" } : undefined}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0ea5e9" />
          <stop offset="0.55" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#67e8f9" />
        </linearGradient>
      </defs>

      {/* Trazo izquierdo de la A */}
      <path d="M9 40 L24 9" stroke={`url(#${gid})`} strokeWidth="4" strokeLinecap="round" />
      {/* Trazo derecho de la A */}
      <path d="M24 9 L39 40" stroke={`url(#${gid})`} strokeWidth="4" strokeLinecap="round" />
      {/* Barra de señal (crossbar) */}
      <path d="M16.5 30 L31.5 30" stroke={`url(#${gid})`} strokeWidth="3.4" strokeLinecap="round" />

      {/* Nodo de conexión en el vértice */}
      <circle cx="24" cy="9" r="5" fill="#67e8f9" />
      <circle cx="24" cy="9" r="2.4" fill="#ecfeff" />
    </svg>
  );
}

export function Logo({
  size = 32,
  withWordmark = true,
  className = "",
  glow = false,
  idSuffix = "",
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
  glow?: boolean;
  idSuffix?: string;
}) {
  return (
    <motion.span
      className={`inline-flex items-center gap-2 ${className}`}
      whileHover={{ scale: 1.04 }}
    >
      <LogoMark size={size} glow={glow} idSuffix={idSuffix} />
      {withWordmark && (
        <span
          className="font-display font-bold gradient-text tracking-tight"
          style={{ fontSize: size * 0.66 }}
        >
          ARTORIA
        </span>
      )}
    </motion.span>
  );
}

export default Logo;
