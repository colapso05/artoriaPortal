import {
  MessageSquare, ClipboardList, UserCheck, Bell, Ticket, Users, ArrowUpRight,
} from "lucide-react";

const features = [
  {
    icon: MessageSquare,
    title: "Agente de atención por WhatsApp",
    description:
      "Responde las consultas frecuentes de tu ISP —planes, horarios, formas de pago, pasos básicos— usando la información que tú configuras para tu empresa.",
    span: "lg:col-span-2",
  },
  {
    icon: ClipboardList,
    title: "Recopila y arma cada caso",
    description:
      "Cuando el cliente reporta un problema, el agente reúne los datos y deja el caso listo para tu especialista.",
    span: "",
  },
  {
    icon: UserCheck,
    title: "Escala a tu equipo",
    description:
      "Deriva la conversación a un especialista del portal cuando hace falta una persona, con todo el contexto a la mano.",
    span: "",
  },
  {
    icon: Bell,
    title: "Avisa a tus clientes",
    description:
      "Notifica a tus clientes cuando hay una incidencia o una novedad importante, para que se enteren a tiempo.",
    span: "lg:col-span-2",
  },
  {
    icon: Ticket,
    title: "Tickets con seguimiento",
    description:
      "Cada caso queda registrado y con su estado, para que nada se pierda y todo tenga trazabilidad.",
    span: "",
  },
  {
    icon: Users,
    title: "Panel multi-agente",
    description:
      "Todo tu equipo atiende desde un solo lugar, con respuestas rápidas guardadas, historial del cliente y traspaso fluido entre operadores.",
    span: "lg:col-span-2",
  },
];

export function Services() {
  const scrollToContact = () => {
    document.querySelector("#contacto")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="plataforma" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-secondary/10 to-transparent" />
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <span className="text-primary font-medium text-sm uppercase tracking-widest">La plataforma</span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mt-2">
            Todo lo que tu ISP necesita en un solo lugar
          </h2>
          <p className="mt-4 text-muted-foreground">
            No es solo un chatbot. Es la plataforma de atención completa para tu proveedor de internet.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature) => (
            <div key={feature.title} className={`group ${feature.span}`}>
              <div
                onClick={scrollToContact}
                className="glass rounded-2xl p-6 h-full transition-all duration-300 cursor-pointer hover:border-primary/30 group-hover:-translate-y-1 flex flex-col"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-display font-semibold flex-1">{feature.title}</h3>
                  <ArrowUpRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Services;
