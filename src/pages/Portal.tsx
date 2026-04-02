import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, ArrowLeft, Eye, EyeOff, Mail, Lock, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type View = "login" | "forgot" | "code" | "reset";

export default function Portal() {
  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot
  const [view, setView] = useState<View>("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");

  // Code verification
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  // Resend cooldown
  const [resendCount, setResendCount] = useState(0);   // 0=libre, 1=30s, 2+=60s
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset password
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
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [navigate]);

  const startCooldown = (seconds: number) => {
    setResendCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

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

  const sendCode = async (targetEmail: string): Promise<boolean> => {
    const { data, error } = await supabase.functions.invoke("check-email", {
      body: { email: targetEmail.trim().toLowerCase() },
    });
    if (error || !data?.exists) return false;
    return true;
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    setForgotLoading(true);
    const ok = await sendCode(forgotEmail);
    setForgotLoading(false);
    if (!ok) {
      setForgotError("No existe una cuenta asociada a ese correo.");
      return;
    }
    setCode("");
    setCodeError("");
    setResendCount(0);
    setResendCooldown(0);
    setView("code");
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    const newCount = resendCount + 1;
    setResendCount(newCount);
    await sendCode(forgotEmail);
    toast({ title: "Código reenviado", description: "Revisa el mensaje que te enviamos." });
    // 1er reenvío → 30s, siguientes → 60s
    startCooldown(newCount === 1 ? 30 : 60);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError("");
    if (code.trim().length !== 6) {
      setCodeError("El código debe tener 6 dígitos.");
      return;
    }
    // Solo verificamos localmente que tenga formato — la validación real ocurre al cambiar contraseña
    setView("reset");
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
    const { data, error } = await supabase.functions.invoke("reset-password-with-code", {
      body: { email: forgotEmail.trim().toLowerCase(), code: code.trim(), newPassword },
    });
    setResetLoading(false);

    if (error || data?.error) {
      const msg = data?.error || error?.message || "Código inválido o expirado";
      // Si el código es inválido, volver al paso de código
      toast({ title: "Error", description: msg, variant: "destructive" });
      if (msg.includes("inválido") || msg.includes("expirado")) {
        setCodeError(msg);
        setView("code");
      }
      return;
    }

    setResetDone(true);
    toast({ title: "✅ Contraseña actualizada", description: "Ahora puedes iniciar sesión con tu nueva contraseña." });
    setTimeout(() => {
      setView("login");
      setResetDone(false);
      setForgotEmail("");
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
    }, 2000);
  };

  const goBack = () => {
    if (view === "forgot") setView("login");
    else if (view === "code") setView("forgot");
    else if (view === "reset") setView("code");
    else navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary mb-8 transition-colors"
        >
          <ArrowLeft size={16} />
          {view === "login" ? "Volver al inicio" : "Volver"}
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
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative mt-1">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required className="pr-10"
                    />
                    <Button type="button" variant="ghost" size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent text-muted-foreground z-10"
                      onClick={() => setShowPassword(!showPassword)}>
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
                  onClick={() => { setView("forgot"); setForgotEmail(email); setForgotError(""); }}
                  className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  ¿Olvidé mi contraseña?
                </button>
              </form>
            </>
          )}

          {/* ── FORGOT ── */}
          {view === "forgot" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-5 h-5 text-primary" />
                <h1 className="text-xl font-display font-bold gradient-text">Recuperar contraseña</h1>
              </div>
              <p className="text-muted-foreground text-sm mb-6">
                Ingresa tu correo y te enviaremos un código de verificación.
              </p>
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <Label htmlFor="forgot-email">Correo electrónico</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={e => { setForgotEmail(e.target.value); setForgotError(""); }}
                    placeholder="tu@correo.cl"
                    required className="mt-1"
                  />
                  {forgotError && (
                    <p className="text-sm text-destructive mt-1.5">⚠ {forgotError}</p>
                  )}
                </div>
                <Button type="submit" disabled={forgotLoading} className="w-full glow-box">
                  {forgotLoading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando código...</>
                    : <><Mail className="w-4 h-4 mr-2" /> Enviar código</>}
                </Button>
              </form>
            </>
          )}

          {/* ── CODE ── */}
          {view === "code" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-5 h-5 text-primary" />
                <h1 className="text-xl font-display font-bold gradient-text">Código de verificación</h1>
              </div>
              <p className="text-muted-foreground text-sm mb-1">
                Ingresa el código de 6 dígitos que enviamos a:
              </p>
              <p className="font-semibold text-sm text-foreground mb-6 truncate">{forgotEmail}</p>

              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div>
                  <Label htmlFor="code">Código</Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={e => { setCode(e.target.value.replace(/\D/g, "")); setCodeError(""); }}
                    placeholder="123456"
                    className="mt-1 text-center text-2xl font-mono tracking-[0.5em] py-6"
                    autoFocus
                  />
                  {codeError && <p className="text-sm text-destructive mt-1.5">⚠ {codeError}</p>}
                </div>

                <Button type="submit" disabled={code.length !== 6} className="w-full glow-box">
                  <Lock className="w-4 h-4 mr-2" />
                  Verificar código
                </Button>

                {/* Reenviar */}
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 mx-auto"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {resendCooldown > 0
                      ? `Reenviar en ${resendCooldown}s`
                      : "Reenviar código"}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* ── RESET ── */}
          {view === "reset" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-5 h-5 text-primary" />
                <h1 className="text-xl font-display font-bold gradient-text">Nueva contraseña</h1>
              </div>
              <p className="text-muted-foreground text-sm mb-6">Elige una contraseña segura.</p>

              {resetDone ? (
                <div className="flex flex-col items-center text-center gap-3 py-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                  <p className="font-semibold">¡Contraseña actualizada!</p>
                  <p className="text-sm text-muted-foreground">Redirigiendo al inicio de sesión...</p>
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
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        required className="pr-10"
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
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Repite tu contraseña"
                        required className="pr-10"
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
                    {resetLoading
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Actualizando...</>
                      : <><Lock className="w-4 h-4 mr-2" /> Establecer contraseña</>}
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
