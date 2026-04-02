import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, ArrowLeft, Eye, EyeOff, Mail, Lock, CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const WEBHOOK_URL = "https://bot.dropptelecom.cl/webhook/artoriaweb";

type View = "login" | "forgot" | "reset";

export default function Portal() {
  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot password
  const [view, setView] = useState<View>("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState("");

  // Reset password (after recovery link)
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    setTimeout(() => {
      document.body.style.setProperty("pointer-events", "auto", "important");
      document.body.removeAttribute("data-scroll-locked");
    }, 100);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard");
    });

    // Detectar cuando el usuario llega desde el link de recuperación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setView("reset");
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      navigate("/dashboard");
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    setForgotLoading(true);

    try {
      // 1. Verificar si existe cuenta con ese correo
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", forgotEmail.trim().toLowerCase())
        .maybeSingle();

      if (!profile) {
        setForgotError("No existe una cuenta asociada a ese correo.");
        setForgotLoading(false);
        return;
      }

      // 2. Disparar reset de contraseña de Supabase (genera link seguro)
      await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/portal`,
      });

      // 3. Notificar al webhook (fire & forget)
      fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "password_reset", email: forgotEmail.trim() }),
      }).catch(() => {});

      setForgotSent(true);
    } catch {
      setForgotError("Ocurrió un error. Inténtalo de nuevo.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "La contraseña debe tener al menos 6 caracteres", variant: "destructive" });
      return;
    }
    setResetLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setResetLoading(false);
    if (error) {
      toast({ title: "Error al actualizar contraseña", description: error.message, variant: "destructive" });
    } else {
      setResetDone(true);
      setTimeout(() => navigate("/dashboard"), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <button
          onClick={() => view === "login" ? navigate("/") : setView("login")}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary mb-8 transition-colors"
        >
          <ArrowLeft size={16} />
          {view === "login" ? "Volver al inicio" : "Volver al inicio de sesión"}
        </button>

        <div className="glass rounded-xl p-8">

          {/* ── LOGIN ── */}
          {view === "login" && (
            <>
              <h1 className="text-2xl font-display font-bold gradient-text mb-2">Portal</h1>
              <p className="text-muted-foreground text-sm mb-6">Ingresa tus credenciales</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative mt-1">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground z-10"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <Button type="submit" disabled={loading} className="w-full glow-box">
                  <LogIn className="w-4 h-4 mr-2" />
                  {loading ? "Ingresando..." : "Ingresar"}
                </Button>

                <button
                  type="button"
                  onClick={() => { setView("forgot"); setForgotEmail(email); setForgotError(""); setForgotSent(false); }}
                  className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors mt-1"
                >
                  ¿Olvidé mi contraseña?
                </button>
              </form>
            </>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {view === "forgot" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-5 h-5 text-primary" />
                <h1 className="text-xl font-display font-bold gradient-text">Recuperar contraseña</h1>
              </div>
              <p className="text-muted-foreground text-sm mb-6">
                Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
              </p>

              {forgotSent ? (
                <div className="flex flex-col items-center text-center gap-3 py-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                  <p className="font-semibold text-foreground">¡Instrucciones enviadas!</p>
                  <p className="text-sm text-muted-foreground">
                    Revisa tu correo o el mensaje que te enviamos con el enlace para restablecer tu contraseña.
                  </p>
                  <Button variant="outline" className="mt-2 w-full" onClick={() => setView("login")}>
                    Volver al inicio de sesión
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <Label htmlFor="forgot-email">Correo electrónico</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => { setForgotEmail(e.target.value); setForgotError(""); }}
                      placeholder="tu@correo.cl"
                      required
                      className="mt-1"
                    />
                    {forgotError && (
                      <p className="text-sm text-destructive mt-1.5 flex items-center gap-1">
                        <span>⚠</span> {forgotError}
                      </p>
                    )}
                  </div>

                  <Button type="submit" disabled={forgotLoading} className="w-full glow-box">
                    {forgotLoading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verificando...</>
                    ) : (
                      <><Mail className="w-4 h-4 mr-2" /> Enviar instrucciones</>
                    )}
                  </Button>
                </form>
              )}
            </>
          )}

          {/* ── RESET PASSWORD ── */}
          {view === "reset" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-5 h-5 text-primary" />
                <h1 className="text-xl font-display font-bold gradient-text">Nueva contraseña</h1>
              </div>
              <p className="text-muted-foreground text-sm mb-6">
                Elige una contraseña segura para tu cuenta.
              </p>

              {resetDone ? (
                <div className="flex flex-col items-center text-center gap-3 py-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                  <p className="font-semibold text-foreground">¡Contraseña actualizada!</p>
                  <p className="text-sm text-muted-foreground">Redirigiendo al dashboard...</p>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <div>
                    <Label htmlFor="new-password">Nueva contraseña</Label>
                    <div className="relative mt-1">
                      <Input
                        id="new-password"
                        type={showNew ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        required
                        className="pr-10"
                      />
                      <Button type="button" variant="ghost" size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent text-muted-foreground"
                        onClick={() => setShowNew(v => !v)}>
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                    <div className="relative mt-1">
                      <Input
                        id="confirm-password"
                        type={showConfirm ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repite tu contraseña"
                        required
                        className="pr-10"
                      />
                      <Button type="button" variant="ghost" size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent text-muted-foreground"
                        onClick={() => setShowConfirm(v => !v)}>
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                    {newPassword && confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-sm text-destructive mt-1.5">⚠ Las contraseñas no coinciden</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={resetLoading || (!!newPassword && !!confirmPassword && newPassword !== confirmPassword)}
                    className="w-full glow-box"
                  >
                    {resetLoading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Actualizando...</>
                    ) : (
                      <><Lock className="w-4 h-4 mr-2" /> Establecer nueva contraseña</>
                    )}
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
