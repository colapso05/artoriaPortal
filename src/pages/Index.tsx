import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { SupernovaIntro } from "@/components/SupernovaIntro";
import { Hero } from "@/components/Hero";
import { Benefits } from "@/components/Benefits";
import { Services } from "@/components/Services";
import { Process } from "@/components/Process";
import { ContactForm } from "@/components/ContactForm";
import { Footer } from "@/components/Footer";

const Index = () => {
  const [showIntro, setShowIntro] = useState(true);

  return (
    <>
      {showIntro && <SupernovaIntro onComplete={() => setShowIntro(false)} />}
      <div className="dark">
        <div className={`min-h-screen bg-background text-foreground transition-opacity duration-500 ${showIntro ? 'opacity-0' : 'opacity-100'}`}>
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
