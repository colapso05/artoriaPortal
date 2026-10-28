import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { SupernovaIntro } from "@/components/SupernovaIntro";
import { ScrollBackground } from "@/components/ScrollBackground";
import { Hero } from "@/components/Hero";
import { Benefits } from "@/components/Benefits";
import { Services } from "@/components/Services";
import { Process } from "@/components/Process";
import { ContactForm } from "@/components/ContactForm";
import { Footer } from "@/components/Footer";

const Index = () => {
  // La intro se muestra solo una vez por sesión — evita esperar 2s en cada visita/navegación.
  const [showIntro, setShowIntro] = useState(() => {
    try { return sessionStorage.getItem("artoria_intro_seen") !== "1"; } catch { return true; }
  });

  const finishIntro = () => {
    try { sessionStorage.setItem("artoria_intro_seen", "1"); } catch { /* noop */ }
    setShowIntro(false);
  };

  return (
    <>
      {showIntro && <SupernovaIntro onComplete={finishIntro} />}
      <div className="dark landing-theme">
        <ScrollBackground />
        <div className={`relative min-h-screen text-foreground transition-opacity duration-500 ${showIntro ? 'opacity-0' : 'opacity-100'}`}>
          <Navbar />
          <main>
            <Hero />
            <Benefits />
            <Services />
            <Process />
            <ContactForm />
          </main>
          <Footer />
        </div>
      </div>
    </>
  );
};

export default Index;
