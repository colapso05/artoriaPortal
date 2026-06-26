import { useRef } from "react";
import { Clock, ClipboardList, TrendingUp } from "lucide-react";

const benefits = [
  {
    Icon: Clock,
    title: "Atención al instante, 24/7",
    description:
      "Tus clientes reciben respuesta a cualquier hora, sin esperar a que abra la oficina ni hacer cola en el teléfono.",
  },
  {
    Icon: ClipboardList,
    title: "Cada caso, ordenado para tu equipo",
    description:
      "El agente recopila los datos de cada consulta y arma el caso, para que tu especialista lo revise y resuelva más rápido.",
  },
  {
    Icon: TrendingUp,
    title: "Crece sin saturar tu soporte",
    description:
      "El agente toma el primer contacto y filtra lo repetitivo. Tu equipo se concentra solo en lo que necesita una persona.",
  },
];

const stats = [
  { value: "24/7", label: "Atención automática" },
  { value: "WhatsApp", label: "El canal que tus clientes ya usan" },
  { value: "1 panel", label: "Todo tu equipo en un solo lugar" },
  { value: "IA + equipo", label: "El agente filtra, tu equipo resuelve" },
];

function BenefitCard({ benefit }: { benefit: (typeof benefits)[0] }) {
  return (
    <div className="relative group">
      <div className="relative glass rounded-2xl p-8 h-full transition-all duration-300 hover:border-primary/30 group-hover:-translate-y-2">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 opacity-90" />
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500/40 to-cyan-400/30 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative w-full h-full flex items-center justify-center">
            <benefit.Icon className="w-7 h-7 text-white" strokeWidth={2} />
          </div>
        </div>
        <h3 className="text-xl font-display font-semibold mb-3 text-center">{benefit.title}</h3>
        <p className="text-muted-foreground text-center leading-relaxed">{benefit.description}</p>
      </div>
    </div>
  );
}

export function Benefits() {
  return (
    <section id="beneficios" className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <span className="text-primary font-medium text-sm uppercase tracking-widest">Por qué Artoria</span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mt-2">
            Pensado para cómo opera un ISP
          </h2>
          <p className="mt-4 text-muted-foreground">
            La mayoría de los mensajes que recibe un proveedor de internet son consultas frecuentes.
            Artoria las atiende y ordena el resto para tu equipo.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {benefits.map((benefit) => (
            <BenefitCard key={benefit.title} benefit={benefit} />
          ))}
        </div>

        <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="glass rounded-2xl p-6 text-center">
              <p className="text-2xl md:text-3xl font-display font-bold gradient-text">{stat.value}</p>
              <p className="mt-1.5 text-xs md:text-sm text-muted-foreground leading-snug">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Benefits;
