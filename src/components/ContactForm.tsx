import { useState } from "react";
import { motion } from "framer-motion";
import { Send, CheckCircle, Loader2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const PLATFORMS = [
  "MikroWisp",
  "WispHub",
  "SmartOLT",
  "Mikrotik",
  "Splynx",
  "ISPCube",
  "UISP (Ubiquiti)",
  "Visualtik",
  "Otra",
  "Aún no uso ninguna",
];

export function ContactForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    whatsapp: "",
    platform: "",
    message: "",
  });
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("contact-webhook", {
        body: {
          nombre: formData.name,
          empresa: formData.company,
          email: formData.email,
          whatsapp: `+56 ${formData.whatsapp}`.trim(),
          plataforma: formData.platform || "No especificada",
          mensaje: formData.message || "Sin mensaje adicional",
          fecha: new Date().toISOString(),
        },
      });
      if (error) throw error;
      setIsSubmitted(true);
      toast({ title: "¡Solicitud enviada!", description: "Nos pondremos en contacto contigo pronto." });
    } catch (error) {
      console.error("Error sending form:", error);
      toast({ title: "Error al enviar", description: "Hubo un problema al enviar tu solicitud. Intenta nuevamente.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isSubmitted) {
    return (
      <section id="contacto" className="py-24 relative">
        <div className="container mx-auto px-4 max-w-2xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass rounded-2xl p-12 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.2 }}
            >
              <CheckCircle className="w-16 h-16 text-primary mx-auto mb-6" />
            </motion.div>
            <h3 className="text-2xl font-display font-bold mb-4">¡Gracias por escribirnos!</h3>
            <p className="text-muted-foreground">
              Recibimos tus datos. Un miembro del equipo de Artoria te contactará a la brevedad.
            </p>
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section id="contacto" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-secondary/10 to-transparent" />
      <div className="container mx-auto px-4 max-w-2xl relative z-10">
        <div className="text-center mb-10">
          <span className="text-primary font-medium text-sm uppercase tracking-widest">Contacto</span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mt-2">Hablemos de tu ISP</h2>
          <p className="mt-4 text-muted-foreground">Déjanos tus datos y te contactamos.</p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-sm text-muted-foreground">Tu nombre *</Label>
              <Input
                required
                placeholder="Ej: Juan Pérez"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="bg-background/50 border-border focus:border-primary"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-sm text-muted-foreground">Nombre de tu ISP *</Label>
              <Input
                required
                placeholder="Ej: RedFibra Internet"
                value={formData.company}
                onChange={(e) => handleInputChange("company", e.target.value)}
                className="bg-background/50 border-border focus:border-primary"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-sm text-muted-foreground flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Teléfono / WhatsApp *
              </Label>
              <div className="flex">
                <span className="flex items-center px-3 rounded-l-md border border-r-0 border-border bg-muted/40 text-sm text-muted-foreground select-none">
                  +56
                </span>
                <Input
                  required
                  type="tel"
                  inputMode="numeric"
                  placeholder="9 1234 5678"
                  value={formData.whatsapp}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d\s]/g, "");
                    handleInputChange("whatsapp", digits);
                  }}
                  pattern="[\d\s]{7,12}"
                  title="Ingresa solo números (ej: 9 1234 5678)"
                  className="bg-background/50 border-border focus:border-primary rounded-l-none"
                />
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block text-sm text-muted-foreground flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email *
              </Label>
              <Input
                type="email"
                placeholder="tucorreo@email.com"
                required
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                className="bg-background/50 border-border focus:border-primary"
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm text-muted-foreground">
              ¿Qué plataforma de gestión usas?
            </Label>
            <Input
              list="platform-options"
              placeholder="Ej: MikroWisp, WispHub, SmartOLT…"
              value={formData.platform}
              onChange={(e) => handleInputChange("platform", e.target.value)}
              className="bg-background/50 border-border focus:border-primary"
            />
            <datalist id="platform-options">
              {PLATFORMS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <p className="mt-1.5 text-xs text-muted-foreground/60">
              Nos ayuda a saber cómo integrar Artoria con tu operación actual.
            </p>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm text-muted-foreground">
              ¿Qué te gustaría automatizar? (opcional)
            </Label>
            <Textarea
              rows={4}
              placeholder="Cuéntanos cuántos clientes tienes, cómo atiendes hoy o qué te gustaría resolver."
              value={formData.message}
              onChange={(e) => handleInputChange("message", e.target.value)}
              className="bg-background/50 border-border focus:border-primary resize-none"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 glow-box"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-5 h-5 mr-2" />
                Quiero que me contacten
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground/60">
            También puedes escribirnos directo a{" "}
            <a href="mailto:soporte@artoria.cl" className="text-primary hover:underline">soporte@artoria.cl</a>{" "}
            o al WhatsApp <span className="text-foreground/80">+56 9 4084 2508</span>.
          </p>
        </form>
      </div>
    </section>
  );
}

export default ContactForm;
