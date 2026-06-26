import { Search, Plug, Rocket } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Search,
    title: "Conocemos tu ISP",
    description: "Revisamos cómo atiendes hoy, las consultas más frecuentes de tus clientes y qué plataforma de gestión usas.",
  },
  {
    number: "02",
    icon: Plug,
    title: "Conectamos y configuramos",
    description: "Integramos tu WhatsApp y tu sistema de gestión, y entrenamos al agente con la información de tu empresa.",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Operamos y ajustamos",
    description: "Salimos en vivo y ampliamos la información del agente cuando lo necesites, para que cubra cada vez más consultas.",
  },
];

export function Process() {
  return (
    <section id="proceso" className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <span className="text-primary font-medium text-sm uppercase tracking-widest">Proceso</span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mt-2">
            De tu primer mensaje a estar operando
          </h2>
        </div>

        <div className="relative">
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent -translate-y-1/2" />
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((step) => (
              <div key={step.title} className="relative group">
                <div className="glass rounded-2xl p-8 text-center relative z-10 transition-all duration-300 hover:border-primary/30 group-hover:-translate-y-1">
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-display font-bold text-xs">
                    {step.number}
                  </span>
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center mx-auto mb-5 mt-2">
                    <step.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-xl font-display font-semibold mb-3">{step.title}</h3>
                  <p className="text-muted-foreground text-sm">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Process;
