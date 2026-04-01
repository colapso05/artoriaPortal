import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Search, Code, Rocket } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Search,
    title: "Analizamos",
    description: "Entendemos tu negocio, tus procesos y tus necesidades específicas para diseñar la solución perfecta.",
  },
  {
    number: "02",
    icon: Code,
    title: "Desarrollamos",
    description: "Creamos tu agente de IA personalizado con las mejores tecnologías y adaptado a tu marca.",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Optimizamos",
    description: "Implementamos, monitoreamos y mejoramos continuamente el rendimiento de tu agente.",
  },
];

export function Process() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="proceso" className="py-24 relative overflow-hidden" ref={ref}>
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="text-primary font-medium text-sm uppercase tracking-widest">Proceso</span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mt-2">
            ¿Cómo trabajamos?
          </h2>
        </motion.div>

        <div className="relative">
          {/* Connection line */}
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent -translate-y-1/2" />

          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.5,
                  delay: index * 0.15,
                }}
                className="relative group"
              >
                <div className="glass rounded-2xl p-8 text-center relative z-10 transition-all duration-300 hover:border-primary/30 group-hover:-translate-y-1">
                  {/* Number badge */}
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-display font-bold text-xs">
                    {step.number}
                  </span>
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center mx-auto mb-5 mt-2">
                    <step.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-xl font-display font-semibold mb-3">{step.title}</h3>
                  <p className="text-muted-foreground text-sm">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Process;
