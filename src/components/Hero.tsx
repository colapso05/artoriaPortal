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

          {/* Right: Solar System */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex justify-center"
          >
            <div className="relative w-[340px] h-[340px] lg:w-[480px] lg:h-[480px]">
              {/* Orbit rings */}
              <div
                className="absolute rounded-full border border-primary/15"
                style={{ width: "58%", height: "58%", top: "21%", left: "21%" }}
              />
              <div
                className="absolute rounded-full border border-primary/10"
                style={{ width: "78%", height: "78%", top: "11%", left: "11%" }}
              />
              <div
                className="absolute rounded-full border border-primary/8"
                style={{ width: "98%", height: "98%", top: "1%", left: "1%" }}
              />

              {/* Central orb glow */}
              <motion.div
                className="absolute inset-0 m-auto w-40 h-40 lg:w-48 lg:h-48 rounded-full bg-gradient-to-br from-primary/40 to-accent/20 blur-2xl"
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              {/* Central orb */}
              <motion.div
                className="absolute inset-0 m-auto w-28 h-28 lg:w-36 lg:h-36 rounded-full bg-gradient-to-br from-primary via-primary/80 to-accent"
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* Orbiting elements */}
              {[0, 1, 2].map((i) => {
                const radii = [110, 150, 190];
                const sizes = [18, 14, 12];
                const durations = [12, 18, 24];
                return (
                  <div
                    key={i}
                    className="absolute animate-orbit"
                    style={{
                      width: 0,
                      height: 0,
                      top: "50%",
                      left: "50%",
                      animationDuration: `${durations[i]}s`,
                      animationDelay: `${i * -4}s`,
                      ["--orbit-radius" as string]: `${radii[i]}px`,
                    }}
                  >
                    <div
                      className="rounded-full bg-primary/80"
                      style={{
                        width: `${sizes[i]}px`,
                        height: `${sizes[i]}px`,
                        marginTop: `-${sizes[i] / 2}px`,
                        marginLeft: `-${sizes[i] / 2}px`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
