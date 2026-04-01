import { motion } from "framer-motion";

export function Footer() {
  const currentYear = new Date().getFullYear();

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="py-12 border-t border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2">
            <motion.span
              className="text-2xl font-display font-bold gradient-text"
              whileHover={{ scale: 1.05 }}
            >
              ARTORIA
            </motion.span>
          </a>

          {/* Navigation */}
          <nav className="flex flex-wrap justify-center gap-6">
            <button
              onClick={() => scrollToSection("#beneficios")}
              className="text-muted-foreground hover:text-primary transition-colors text-sm"
            >
              Beneficios
            </button>
            <button
              onClick={() => scrollToSection("#servicios")}
              className="text-muted-foreground hover:text-primary transition-colors text-sm"
            >
              Servicios
            </button>
            <button
              onClick={() => scrollToSection("#proceso")}
              className="text-muted-foreground hover:text-primary transition-colors text-sm"
            >
              Proceso
            </button>
            <button
              onClick={() => scrollToSection("#contacto")}
              className="text-muted-foreground hover:text-primary transition-colors text-sm"
            >
              Contacto
            </button>
          </nav>

          {/* Copyright */}
          <p className="text-muted-foreground text-sm">
            © {currentYear} ARTORIA. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
