import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, ArrowLeft, Eye, EyeOff, Mail, Lock, CheckCircle2, Loader2, RefreshCw, ShieldAlert, ShieldX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PasswordStrengthBar, { isPasswordValid } from "@/components/ui/PasswordStrengthBar";
import { motion, AnimatePresence } from "framer-motion";

const MAX_ATTEMPTS = 5;

type View = "login" | "forgot" | "code" | "reset";

export default function Portal() {
  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [loginError, setLoginError] = useState<string | null>(null);
  const attemptsRef = useRef(0);

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
    setLoginError(null);
    setLoading(true);

    // Intentar login directamente — Supabase devuelve error si el email no existe
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      attemptsRef.current += 1;
      const attempts = attemptsRef.current;
      setLoginAttempts(attempts);
      const remaining = MAX_ATTEMPTS - attempts;
      if (remaining <= 0) {
        setLoginError("blocked");
      } else {
        setLoginError(`invalid:${remaining}`);
      }
    } else {
      attemptsRef.current = 0;
      setLoginAttempts(0);
      setLoginError(null);
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

  // Código + nueva contraseña en un solo submit — el backend valida el código y cambia la contraseña atómicamente
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError("");
    if (code.trim().length < 6) {
      setCodeError("Ingresa el código completo de 6 dígitos.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }
    if (!isPasswordValid(newPassword)) {
      toast({ title: "La contraseña no cumple los requisitos de seguridad", variant: "destructive" });
      return;
    }
    setResetLoading(true);
    const { data, error } = await supabase.functions.invoke("reset-password-with-code", {
      body: { email: forgotEmail.trim().toLowerCase(), code: code.trim(), newPassword },
    });
    setResetLoading(false);

    if (error || data?.error) {
      const msg = data?.error || error?.message || "Código inválido o expirado";
      setCodeError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
      return;
    }

    setResetDone(true);
    toast({ title: "✅ Contraseña actualizada", description: "Ahora puedes iniciar sesión." });
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
    else if (view === "code" || view === "reset") setView("forgot");
    else navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* Suprimir el ojo nativo del navegador (Edge/IE/Chrome) en campos password */}
      <style>{`
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear { display: none; }
        input::-webkit-credentials-auto-fill-button { display: none !important; }
      `}</style>
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
                  <Input id="email" type="email" value={email} onChange={e => { setEmail(e.target.value); setLoginError(null); }} required className="mt-1" />
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
                {/* Error de login visual */}
                <AnimatePresence mode="wait">
                  {loginError && (
                    <motion.div
                      key={loginError}
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className={`rounded-xl border px-4 py-3.5 flex gap-3 items-start ${
                        loginError === "blocked"
                          ? "bg-red-500/10 border-red-500/30"
                          : "bg-amber-500/10 border-amber-500/30"
                      }`}
                    >
                      {loginError === "blocked" || loginError === "no_account" ? (
                        <ShieldX className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        {loginError === "no_account" ? (
                          <>
                            <p className="text-sm font-bold text-red-500">Correo no registrado</p>
                            <p className="text-xs text-red-400/80 mt-0.5 leading-relaxed">
                              No existe ninguna cuenta asociada a este correo electrónico.
                            </p>
                          </>
                        ) : loginError === "blocked" ? (
                          <>
                            <p className="text-sm font-bold text-red-500">Cuenta bloqueada temporalmente</p>
                            <p className="text-xs text-red-400/80 mt-0.5 leading-relaxed">
                              Superaste el límite de intentos. Por seguridad, usa la opción de recuperación de contraseña.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-bold text-amber-500">Contraseña incorrecta</p>
                            <p className="text-xs text-amber-400/80 mt-0.5">
                              Te{" "}
                              <span className="font-black text-amber-400">
                                {loginError.split(":")[1] === "1"
                                  ? "queda 1 intento"
                                  : `quedan ${loginError.split(":")[1]} intentos`}
                              </span>{" "}
                              antes de bloquear tu cuenta.
                            </p>
                            {/* Barra de intentos */}
                            <div className="flex gap-1 mt-2.5">
                              {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                                <div
                                  key={i}
                                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                                    i < loginAttempts ? "bg-red-500" : "bg-amber-500/20"
                                  }`}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button type="submit" disabled={loading || loginError === "blocked" || loginError === "no_account"} className="w-full glow-box">
                  <LogIn className="w-4 h-4 mr-2" />
                  {loading ? "Ingresando..." : "Ingresar"}
                </Button>
                <button
                  type="button"
                  onClick={() => { setView("forgot"); setForgotEmail(email); setForgotError(""); }}
                  className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {loginError === "blocked" ? (
                    <span className="text-red-400 font-semibold hover:text-red-300">→ Recuperar mi contraseña</span>
                  ) : "¿Olvidé mi contraseña?"}
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

          {/* ── CÓDIGO + NUEVA CONTRASEÑA (fusionado) ── */}
          {(view === "code" || view === "reset") && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-5 h-5 text-primary" />
                <h1 className="text-xl font-display font-bold gradient-text">Restablecer contraseña</h1>
              </div>
              <p className="text-muted-foreground text-sm mb-1">
                Ingresa el código enviado a:
              </p>
              <p className="font-semibold text-sm text-foreground mb-5 truncate">{forgotEmail}</p>

              {resetDone ? (
                <div className="flex flex-col items-center text-center gap-3 py-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                  <p className="font-semibold">¡Contraseña actualizada!</p>
                  <p className="text-sm text-muted-foreground">Redirigiendo al inicio de sesión...</p>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  {/* Campo código */}
                  <div>
                    <Label htmlFor="code">Código de verificación</Label>
                    <Input
                      id="code"
                      type="text"
                      inputMode="text"
                      maxLength={6}
                      value={code}
                      onChange={e => { setCode(e.target.value.toUpperCase().slice(0, 6)); setCodeError(""); }}
                      placeholder="A3B7X2"
                      className="mt-1 text-center text-2xl font-mono tracking-[0.5em] py-5"
                      autoFocus
                    />
                    {codeError && <p className="text-sm text-destructive mt-1.5">⚠ {codeError}</p>}
                    <div className="text-right mt-1">
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendCooldown > 0}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : "Reenviar código"}
                      </button>
                    </div>
                  </div>

                  {/* Nueva contraseña */}
                  <div>
                    <Label htmlFor="new-password">Nueva contraseña</Label>
                    <div className="relative mt-1">
                      <Input
                        id="new-password"
                        type={showNew ? "text" : "password"}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Ej: Segura1_2024"
                        required className="pr-10"
                      />
                      <Button type="button" variant="ghost" size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent text-muted-foreground"
                        onClick={() => setShowNew(v => !v)}>
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                    <PasswordStrengthBar password={newPassword} />
                  </div>

                  {/* Confirmar contraseña */}
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
                    disabled={
                      resetLoading ||
                      code.length < 6 ||
                      !isPasswordValid(newPassword) ||
                      newPassword !== confirmPassword
                    }
                    className="w-full glow-box"
                  >
                    {resetLoading
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verificando y actualizando...</>
                      : <><Lock className="w-4 h-4 mr-2" /> Restablecer contraseña</>}
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
