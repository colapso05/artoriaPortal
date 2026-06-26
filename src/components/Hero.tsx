import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { MessageSquare, ArrowRight, Wifi } from "lucide-react";
import { AgentChatPreview } from "@/components/AgentChatPreview";

const platforms = ["MikroWisp", "WispHub", "SmartOLT", "Mikrotik", "Splynx"];

export function Hero() {
  const scrollToContact = () => {
    document.querySelector("#contacto")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
      {/* Morphing blob backgrounds */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl"
          animate={{ x: [0, 50, 0], y: [0, 30, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-accent/10 blur-3xl"
          animate={{ x: [0, -50, 0], y: [0, -30, 0], scale: [1, 1.3, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7 }}
            className="text-left"
          >
            {/* Badge nicho ISP */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/30 bg-primary/10 mb-6"
            >
              <Wifi className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold tracking-wide text-primary">
                Hecho para proveedores de internet (ISP)
              </span>
            </motion.div>

            {/* Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold leading-tight"
            >
              Soporte automático por{" "}
              <span className="gradient-text">WhatsApp para tu ISP</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-6 text-lg text-muted-foreground/90 max-w-xl leading-relaxed"
            >
              Un agente de IA atiende a tus clientes 24/7 por WhatsApp, responde las
              consultas frecuentes con la información de tu empresa y organiza cada
              caso para que tu equipo lo resuelva más rápido. Se integra con la
              plataforma de gestión que ya usas.
            </motion.p>

            {/* Plataformas compatibles */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2"
            >
              <span className="text-xs text-muted-foreground/60 mr-1">Compatible con</span>
              {platforms.map((p) => (
                <span
                  key={p}
                  className="text-xs font-medium px-2.5 py-1 rounded-md border border-border bg-card/40 text-foreground/80"
                >
                  {p}
                </span>
              ))}
              <span className="text-xs text-muted-foreground/60">y más</span>
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-8 flex flex-col sm:flex-row gap-4"
            >
              <Button
                size="lg"
                onClick={scrollToContact}
                className="bg-primary text-primary-foreground hover:bg-primary/90 glow-box"
              >
                <MessageSquare className="w-5 h-5 mr-2" />
                Solicitar información
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() =>
                  document.querySelector("#plataforma")?.scrollIntoView({ behavior: "smooth" })
                }
                className="border-border hover:border-primary/50 hover:bg-primary/5"
              >
                Ver qué hace la plataforma
              </Button>
            </motion.div>
          </motion.div>

          {/* Right: Preview animado del agente en WhatsApp */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex justify-center items-center"
          >
            <AgentChatPreview />
          </motion.div>
        </div>
      </div>

      {/* Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
