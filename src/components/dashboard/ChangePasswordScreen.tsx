import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChangePasswordScreenProps {
  userId: string;
  onComplete: () => void;
}

export default function ChangePasswordScreen({ userId, onComplete }: ChangePasswordScreenProps) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass !== confirm) {
      toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }
    if (pass.length < 6) {
      toast({ title: "Error", description: "Mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("profiles").update({ must_change_password: false }).eq("user_id", userId);
      toast({ title: "Contraseña actualizada" });
      onComplete();
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm glass rounded-xl p-8">
        <Lock className="w-8 h-8 text-primary mx-auto mb-4" />
        <h1 className="text-xl font-display font-bold text-center mb-2">Cambiar Contraseña</h1>
        <p className="text-muted-foreground text-sm text-center mb-6">
          Debes configurar una nueva contraseña para continuar.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nueva Contraseña</Label>
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label>Confirmar Contraseña</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="mt-1" />
          </div>
          <Button type="submit" disabled={loading} className="w-full glow-box">
            {loading ? "Guardando..." : "Guardar Contraseña"}
          </Button>
        </form>
      </div>
    </div>
  );
}
