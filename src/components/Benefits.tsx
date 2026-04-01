import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { AnimatedClock, AnimatedLightning, AnimatedSavings } from "./AnimatedIcons";

const benefits = [
  {
    Icon: AnimatedClock,
    title: "Atención 24/7",
    description: "Tus clientes siempre atendidos, sin importar la hora o el día. Tu negocio nunca duerme.",
  },
  {
    Icon: AnimatedLightning,
    title: "Respuestas Instantáneas",
    description: "Cero tiempos de espera. Tus clientes obtienen respuestas inmediatas a sus consultas.",
  },
  {
    Icon: AnimatedSavings,
    title: "Reduce Costos",
    description: "Ahorra en personal sin sacrificar calidad. Automatiza tareas repetitivas y enfócate en crecer.",
  },
];

function BenefitCard({
  benefit,
  index,
  isInView,
}: {
  benefit: (typeof benefits)[0];
  index: number;
  isInView: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.6,
        delay: index * 0.15,
      }}
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative glass rounded-2xl p-8 h-full transition-all duration-300 hover:border-primary/30 group-hover:-translate-y-2">
        {/* Large animated icon container */}
        <div className="w-32 h-32 mx-auto mb-6 relative">
          {/* Background glow */}
          <motion.div
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10"
            animate={{
              scale: isHovered ? 1.1 : 1,
              opacity: isHovered ? 0.8 : 0.5,
            }}
            transition={{ duration: 0.3 }}
          />
          {/* Icon */}
          <div className="relative z-10 w-full h-full p-4">
            <benefit.Icon isHovered={isHovered} />
          </div>
          {/* Hover glow effect */}
          <motion.div
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0 }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <h3 className="text-xl font-display font-semibold mb-3 text-center">{benefit.title}</h3>
        <p className="text-muted-foreground text-center">{benefit.description}</p>
      </div>
    </motion.div>
  );
}

export function Benefits() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="beneficios" className="py-24 relative overflow-hidden" ref={ref}>
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="text-primary font-medium text-sm uppercase tracking-widest">Beneficios</span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mt-2">
            ¿Por qué elegir un agente de IA?
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {benefits.map((benefit, index) => (
            <BenefitCard key={benefit.title} benefit={benefit} index={index} isInView={isInView} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default Benefits;
