import { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";

interface Props {
  title: string;
  updated: string;
  intro?: string;
  children: ReactNode;
}

export default function LegalLayout({ title, updated, intro, children }: Props) {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  return (
    <div className="dark">
      <div className="min-h-screen bg-background text-foreground">
        {/* Top bar */}
        <header className="sticky top-0 z-50 glass border-b border-border/40">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <button onClick={() => navigate("/")} className="flex items-center gap-2 group">
              <ArrowLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-2xl font-display font-bold gradient-text">ARTORIA</span>
            </button>
            <nav className="hidden sm:flex items-center gap-5 text-sm">
              <Link to="/privacidad" className="text-muted-foreground hover:text-primary transition-colors">Privacidad</Link>
              <Link to="/terminos" className="text-muted-foreground hover:text-primary transition-colors">Términos</Link>
              <Link to="/cookies" className="text-muted-foreground hover:text-primary transition-colors">Cookies</Link>
            </nav>
          </div>
        </header>

        {/* Content */}
        <main className="container mx-auto px-4 py-12 md:py-16 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
            </div>
            <p className="text-xs text-muted-foreground/60 mb-8 ml-[52px]">
              Última actualización: {updated}
            </p>

            {intro && (
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-8">
                {intro}
              </p>
            )}

            <div className="legal-content space-y-8">
              {children}
            </div>
          </motion.div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border/40 py-8 mt-8">
          <div className="container mx-auto px-4 max-w-3xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>© {currentYear} ARTORIA. Todos los derechos reservados.</p>
            <div className="flex gap-5">
              <Link to="/privacidad" className="hover:text-primary transition-colors">Privacidad</Link>
              <Link to="/terminos" className="hover:text-primary transition-colors">Términos</Link>
              <Link to="/cookies" className="hover:text-primary transition-colors">Cookies</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* Helper para secciones consistentes */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="text-sm md:text-[15px] text-muted-foreground leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  );
}
