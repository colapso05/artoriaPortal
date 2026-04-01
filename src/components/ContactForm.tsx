import { useState, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Send, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const budgetRanges = [
  { value: "starter", label: "$150.000 - $300.000 CLP (Starter)" },
  { value: "professional", label: "$300.000 - $500.000 CLP (Profesional)" },
  { value: "enterprise", label: "$500.000 - $1.000.000 CLP (Empresarial)" },
];

export function ContactForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    whatsapp: "",
    budget: "",
    message: "",
  });
  const { toast } = useToast();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase.functions.invoke("contact-webhook", {
        body: {
          nombre: formData.name,
          empresa: formData.company,
          email: formData.email,
          whatsapp: formData.whatsapp || "No proporcionado",
          presupuesto: budgetRanges.find((r) => r.value === formData.budget)?.label || formData.budget,
          mensaje: formData.message,
          fecha: new Date().toISOString(),
        },
      });

      if (error) throw error;

      setIsSubmitted(true);
      toast({
        title: "¡Solicitud enviada!",
        description: "Nos pondremos en contacto contigo pronto.",
      });
    } catch (error) {
      console.error("Error sending form:", error);
      toast({
        title: "Error al enviar",
        description: "Hubo un problema al enviar tu solicitud. Intenta nuevamente.",
        variant: "destructive",
      });
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
            <h3 className="text-2xl font-display font-bold mb-4">¡Gracias por contactarnos!</h3>
            <p className="text-muted-foreground">
              Hemos recibido tu solicitud. Nos pondremos en contacto contigo en las próximas 24 horas.
            </p>
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section id="contacto" className="py-24 relative" ref={ref}>
      {/* Subtle background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-secondary/20 to-transparent" />

      <div className="container mx-auto px-4 max-w-2xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="text-primary font-medium text-sm uppercase tracking-widest">Contacto</span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mt-2">
            Solicita tu Agente de IA
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block text-sm text-muted-foreground">Nombre *</Label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="bg-background/50 border-border focus:border-primary"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-sm text-muted-foreground">Empresa / Negocio *</Label>
                <Input
                  required
                  value={formData.company}
                  onChange={(e) => handleInputChange("company", e.target.value)}
                  className="bg-background/50 border-border focus:border-primary"
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block text-sm text-muted-foreground">Email *</Label>
                <Input
                  type="email"
                  placeholder="@email.com"
                  required
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="bg-background/50 border-border focus:border-primary"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-sm text-muted-foreground">WhatsApp (opcional)</Label>
                <Input
                  value={formData.whatsapp}
                  onChange={(e) => handleInputChange("whatsapp", e.target.value)}
                  className="bg-background/50 border-border focus:border-primary"
                />
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block text-sm text-muted-foreground">Rango de inversión *</Label>
              <Select required onValueChange={(value) => handleInputChange("budget", value)}>
                <SelectTrigger className="bg-background/50 border-border">
                  <SelectValue placeholder="Selecciona un rango" />
                </SelectTrigger>
                <SelectContent>
                  {budgetRanges.map((range) => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block text-sm text-muted-foreground">Cuéntanos sobre tu proyecto *</Label>
              <Textarea
                required
                rows={4}
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
                  Enviar Solicitud
                </>
              )}
            </Button>
          </form>
        </motion.div>
      </div>
    </section>
  );
}

export default ContactForm;
