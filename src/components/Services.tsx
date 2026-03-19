import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { MessageSquare, Users, Database, Workflow, ArrowUpRight } from "lucide-react";

const services = [
  {
    icon: MessageSquare,
    title: "Chatbots de Atención al Cliente",
    description: "Responden consultas, resuelven dudas y asisten a tus clientes automáticamente las 24 horas del día.",
  },
  {
    icon: Users,
    title: "Automatización de Ventas",
    description: "Califica leads, hace seguimientos y agenda citas sin intervención humana. Vende mientras duermes.",
  },
  {
    icon: Database,
    title: "Agentes con Base de Conocimiento",
    description: "IAs que responden usando los documentos y datos de tu empresa. Tecnología RAG avanzada.",
  },
  {
    icon: Workflow,
    title: "Flujos de Trabajo Automatizados",
    description: "Procesamiento de documentos, facturas y tareas repetitivas con IA. Libera tiempo para lo importante.",
  },
];

export function Services() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const scrollToContact = () => {
    document.querySelector("#contacto")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="servicios" className="py-24 relative" ref={ref}>
      {/* Subtle background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-secondary/20 to-transparent" />
      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="text-primary font-medium text-sm uppercase tracking-widest">Servicios</span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mt-2">
            Soluciones de IA para tu negocio
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.5,
                delay: index * 0.15,
              }}
              className="group"
            >
              <div
                onClick={scrollToContact}
                className="glass rounded-2xl p-6 h-full transition-all duration-300 cursor-pointer hover:border-primary/30 group-hover:-translate-y-1 flex items-start gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center flex-shrink-0">
                  <service.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-display font-semibold">{service.title}</h3>
                    <ArrowUpRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-muted-foreground text-sm">{service.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Services;
