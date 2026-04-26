import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Bot, Sparkles, ArrowRight } from "lucide-react";

export function Hero() {
  const scrollToContact = () => {
    const element = document.querySelector("#contacto");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
      {/* Morphing blob backgrounds */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl"
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-accent/10 blur-3xl"
          animate={{
            x: [0, -50, 0],
            y: [0, -30, 0],
            scale: [1, 1.3, 1],
          }}
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
            {/* Badge */}



            {/* Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold leading-tight"
            >
              Automatiza tu negocio con{" "}
              <span className="gradient-text">Inteligencia Artificial</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-6 text-lg text-muted-foreground max-w-xl"
            >
              Agentes de IA que trabajan 24/7: chatbots, automatización de ventas,
              y flujos de trabajo inteligentes para tu empresa.
            </motion.p>

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
                <Bot className="w-5 h-5 mr-2" />
                Solicita tu Agente
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() =>
                  document.querySelector("#servicios")?.scrollIntoView({ behavior: "smooth" })
                }
                className="border-border hover:border-primary/50 hover:bg-primary/5"
              >
                Ver Servicios
              </Button>
            </motion.div>
          </motion.div>

          {/* Right: Video animación espada — blended */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, delay: 0.3 }}
            className="relative flex justify-center items-center"
          >
            {/* Glow ambiental que emana desde el centro — capas múltiples */}
            <div className="absolute inset-0 m-auto w-64 h-64 rounded-full bg-primary/25 blur-[80px] pointer-events-none" />
            <div className="absolute inset-0 m-auto w-40 h-40 rounded-full bg-violet-500/20 blur-[50px] pointer-events-none" />
            <div className="absolute inset-0 m-auto w-24 h-24 rounded-full bg-primary/30 blur-[30px] pointer-events-none animate-pulse" />

            {/* Video sin caja — blend mode hace el negro transparente */}
            <div className="relative w-full max-w-[420px] lg:w-[620px] xl:w-[680px]">
              <video
                src="/animacion_espada.mp4"
                autoPlay
                loop
                muted
                playsInline
                disablePictureInPicture
                className="w-full h-auto"
                style={{
                  mixBlendMode: "screen",
                  filter: "contrast(1.6) brightness(1.0) saturate(1.4)",
                  maskImage: "radial-gradient(ellipse 60% 70% at 50% 48%, black 20%, rgba(0,0,0,0.8) 45%, transparent 72%)",
                  WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 50% 48%, black 20%, rgba(0,0,0,0.8) 45%, transparent 72%)",
                }}
              />
              {/* Capa transparente encima — bloquea controles nativos del navegador */}
              <div className="absolute inset-0" style={{ zIndex: 1 }} />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
