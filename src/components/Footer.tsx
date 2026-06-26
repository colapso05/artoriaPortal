import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

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
            <Logo size={28} idSuffix="-footer" />
          </a>

          {/* Navigation */}
          <nav className="flex flex-wrap justify-center gap-6">
            <button
              onClick={() => scrollToSection("#beneficios")}
              className="text-muted-foreground hover:text-primary transition-colors text-sm"
            >
              Por qué Artoria
            </button>
            <button
              onClick={() => scrollToSection("#plataforma")}
              className="text-muted-foreground hover:text-primary transition-colors text-sm"
            >
              Plataforma
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

        {/* Legal links */}
        <div className="mt-8 pt-6 border-t border-border/30 flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link to="/privacidad" className="text-muted-foreground/70 hover:text-primary transition-colors text-xs">
            Política de Privacidad
          </Link>
          <Link to="/terminos" className="text-muted-foreground/70 hover:text-primary transition-colors text-xs">
            Términos y Condiciones
          </Link>
          <Link to="/cookies" className="text-muted-foreground/70 hover:text-primary transition-colors text-xs">
            Política de Cookies
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
