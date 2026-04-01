import { useState } from "react";
import { Menu, X, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const navLinks = [
  { name: "Beneficios", href: "#beneficios" },
  { name: "Servicios", href: "#servicios" },
  { name: "Proceso", href: "#proceso" },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
    setIsOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2">
            <motion.span
              className="text-2xl font-display font-bold gradient-text"
              whileHover={{ scale: 1.05 }}
            >
              ARTORIA
            </motion.span>
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => scrollToSection(link.href)}
                className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium"
              >
                {link.name}
              </button>
            ))}
            <Button
              onClick={() => navigate("/portal")}
              className="bg-primary text-primary-foreground hover:bg-primary/90 glow-box"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Portal
            </Button>
            <Button
              onClick={() => scrollToSection("#contacto")}
              variant="outline"
              className="border-primary/50 hover:bg-primary/10"
            >
              Solicita tu Agente
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-foreground"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-border/50 overflow-hidden"
            >
              <div className="flex flex-col gap-4 py-4">
                {navLinks.map((link) => (
                  <button
                    key={link.href}
                    onClick={() => scrollToSection(link.href)}
                    className="text-muted-foreground hover:text-primary transition-colors font-medium text-left"
                  >
                    {link.name}
                  </button>
                ))}
                <Button
                  onClick={() => { setIsOpen(false); navigate("/portal"); }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 w-full"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Portal
                </Button>
                <Button
                  onClick={() => scrollToSection("#contacto")}
                  variant="outline"
                  className="border-primary/50 hover:bg-primary/10 w-full"
                >
                  Solicita tu Agente
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}

export default Navbar;
