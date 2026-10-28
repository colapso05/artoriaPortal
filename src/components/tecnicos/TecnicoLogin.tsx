import { useState } from "react";
import { Loader2, User, Lock, LogIn, ArrowLeft, MessageCircle, ShieldCheck, AtSign, CheckCircle2 } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { CampoTexto, CampoPassword, CampoCelular, CampoCodigo, ErrorAuth } from "./TecnicoAuthCampos";
import {
  loginTecnico, requestOtp, verifyOtp, setupPassword, crearCuenta, usernameDisponible,
  validarCelular, validarPassword, validarUsername, type Tecnico,
} from "@/lib/tecnicos/api";

type Paso =
  | "login"
  | "reg_celular" | "reg_codigo" | "reg_password"
  | "rec_celular" | "rec_codigo" | "rec_password";

/**
 * Autenticación del técnico. Replica los flujos de la app Android:
 *  · Login       → usuario/teléfono + contraseña
 *  · Registro    → celular → código por WhatsApp → usuario + contraseña
 *  · Recuperación→ celular → código por WhatsApp → nueva contraseña
 */
export function TecnicoLogin({ onLogin }: { onLogin: (t: Tecnico) => void }) {
  const [paso, setPaso] = useState<Paso>("login");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  // Login
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");

  // Registro / recuperación
  const [celular, setCelular] = useState("");
  const [codigo, setCodigo] = useState("");
  const [username, setUsername] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [tecnicoVerificado, setTecnicoVerificado] = useState<Tecnico | null>(null);

  const esRegistro = paso.startsWith("reg_");

  const irA = (p: Paso) => { setError(""); setPaso(p); };

  const volverAlLogin = () => {
    setError("");
    setCelular(""); setCodigo(""); setUsername("");
    setNuevaPassword(""); setConfirmPassword("");
    setTecnicoVerificado(null);
    setPaso("login");
  };

  /** Envuelve una acción async con manejo de carga y error. Devuelve true si salió bien. */
  const ejecutar = async (accion: () => Promise<void>): Promise<boolean> => {
    if (cargando) return false;
    setError("");
    setCargando(true);
    try {
      await accion();
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Ocurrió un error. Intenta nuevamente.");
      return false;
    } finally {
      setCargando(false);
    }
  };

  // ── Acciones ───────────────────────────────────────────────────────────
  const hacerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await ejecutar(async () => {
      const tech = await loginTecnico(usuario, password);
      onLogin(tech);
    });
    // Limpiar la contraseña si falló, para que el siguiente intento empiece en blanco
    if (!ok) setPassword("");
  };

  const enviarCodigo = (e: React.FormEvent) => {
    e.preventDefault();
    ejecutar(async () => {
      const { ok, phone, error: err } = validarCelular(celular);
      if (!ok) throw new Error(err);
      await requestOtp(phone);
      setCodigo("");
      setPaso(esRegistro ? "reg_codigo" : "rec_codigo");
    });
  };

  const validarCodigo = (e: React.FormEvent) => {
    e.preventDefault();
    ejecutar(async () => {
      if (codigo.length !== 6) throw new Error("El código debe tener 6 dígitos.");
      const { phone } = validarCelular(celular);
      const tech = await verifyOtp(phone, codigo);
      setTecnicoVerificado(tech);
      setUsername(tech.username ?? "");
      setPaso(esRegistro ? "reg_password" : "rec_password");
    });
  };

  const finalizarRegistro = (e: React.FormEvent) => {
    e.preventDefault();
    ejecutar(async () => {
      const errU = validarUsername(username);
      if (errU) throw new Error(errU);
      const errP = validarPassword(nuevaPassword, confirmPassword);
      if (errP) throw new Error(errP);
      if (!tecnicoVerificado) throw new Error("Vuelve a verificar tu número.");

      // Solo comprobar disponibilidad si eligió un usuario distinto al que ya tenía
      if (username !== tecnicoVerificado.username) {
        const libre = await usernameDisponible(username);
        if (!libre) throw new Error("Ese nombre de usuario ya está en uso. Elige otro.");
      }

      await crearCuenta(tecnicoVerificado.id, username, nuevaPassword);
      onLogin({ ...tecnicoVerificado, username });
    });
  };

  const finalizarRecuperacion = (e: React.FormEvent) => {
    e.preventDefault();
    ejecutar(async () => {
      const errP = validarPassword(nuevaPassword, confirmPassword);
      if (errP) throw new Error(errP);
      if (!tecnicoVerificado) throw new Error("Vuelve a verificar tu número.");
      await setupPassword(nuevaPassword);
      onLogin(tecnicoVerificado);
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const titulos: Record<Paso, { titulo: string; sub: string }> = {
    login:        { titulo: "Portal Técnicos", sub: "Ingresa para ver tu agenda" },
    reg_celular:  { titulo: "Crear cuenta", sub: "Te enviaremos un código por WhatsApp" },
    reg_codigo:   { titulo: "Verifica tu número", sub: `Enviamos un código a +56 ${celular}` },
    reg_password: { titulo: "Casi listo", sub: "Elige tu usuario y contraseña" },
    rec_celular:  { titulo: "Recuperar contraseña", sub: "Te enviaremos un código por WhatsApp" },
    rec_codigo:   { titulo: "Verifica tu número", sub: `Enviamos un código a +56 ${celular}` },
    rec_password: { titulo: "Nueva contraseña", sub: "Define tu nueva contraseña de acceso" },
  };
  const { titulo, sub } = titulos[paso];

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-5 py-10 bg-[var(--tec-fondo)]">
      <div className="w-full max-w-sm">
        {/* Volver */}
        {paso !== "login" && (
          <button
            onClick={paso.endsWith("_celular") ? volverAlLogin : () => irA(esRegistro ? "reg_celular" : "rec_celular")}
            disabled={cargando}
            className="flex items-center gap-1.5 text-[13px] text-[var(--tec-texto-2)] mb-4 -ml-1 active:opacity-70 disabled:opacity-40"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
        )}

        {/* Marca */}
        <div className="flex flex-col items-center mb-7">
          <LogoMark size={paso === "login" ? 56 : 44} glow idSuffix="-tec-login" />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-[var(--tec-texto)] text-center">{titulo}</h1>
          <p className="text-[13px] text-[var(--tec-texto-2)] mt-1 text-center">{sub}</p>
        </div>

        {/* ── Login ── */}
        {paso === "login" && (
          <form onSubmit={hacerLogin} className="space-y-4">
            <CampoTexto
              id="tec-usuario"
              label="Usuario o teléfono"
              icon={User}
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={usuario}
              onChange={e => { setUsuario(e.target.value); setError(""); }}
              placeholder="tu.usuario o +56912345678"
              required
            />
            <CampoPassword
              id="tec-password"
              label="Contraseña"
              icon={Lock}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              placeholder="••••••••"
              required
            />

            <ErrorAuth mensaje={error} />

            <BotonPrincipal cargando={cargando} disabled={!usuario.trim() || !password} icon={LogIn}>
              {cargando ? "Ingresando..." : "Ingresar"}
            </BotonPrincipal>

            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => irA("rec_celular")}
                className="text-[13px] text-[var(--tec-texto-2)] hover:text-[var(--tec-acento)] transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
              <div className="h-px bg-[var(--tec-borde)]" />
              <button
                type="button"
                onClick={() => irA("reg_celular")}
                className="text-[13px] font-semibold text-[var(--tec-acento)] active:opacity-70"
              >
                Crear cuenta
              </button>
            </div>
          </form>
        )}

        {/* ── Paso 1: celular (registro o recuperación) ── */}
        {(paso === "reg_celular" || paso === "rec_celular") && (
          <form onSubmit={enviarCodigo} className="space-y-4">
            <CampoCelular value={celular} onChange={v => { setCelular(v); setError(""); }} disabled={cargando} />
            <ErrorAuth mensaje={error} />
            <BotonPrincipal cargando={cargando} disabled={celular.length !== 9} icon={MessageCircle}>
              {cargando ? "Enviando..." : "Enviar código"}
            </BotonPrincipal>
            <p className="text-[11px] text-[var(--tec-texto-4)] text-center leading-relaxed">
              Tu número debe estar registrado por el administrador de tu empresa.
            </p>
          </form>
        )}

        {/* ── Paso 2: código ── */}
        {(paso === "reg_codigo" || paso === "rec_codigo") && (
          <form onSubmit={validarCodigo} className="space-y-4">
            <CampoCodigo value={codigo} onChange={v => { setCodigo(v); setError(""); }} disabled={cargando} />
            <ErrorAuth mensaje={error} />
            <BotonPrincipal cargando={cargando} disabled={codigo.length !== 6} icon={ShieldCheck}>
              {cargando ? "Verificando..." : "Verificar código"}
            </BotonPrincipal>
            <button
              type="button"
              onClick={() => ejecutar(async () => {
                const { phone } = validarCelular(celular);
                await requestOtp(phone);
                setError("");
              })}
              disabled={cargando}
              className="w-full text-[13px] text-[var(--tec-texto-2)] hover:text-[var(--tec-acento)] transition-colors disabled:opacity-40"
            >
              Reenviar código
            </button>
          </form>
        )}

        {/* ── Paso 3a: registro (usuario + contraseña) ── */}
        {paso === "reg_password" && (
          <form onSubmit={finalizarRegistro} className="space-y-4">
            <CampoTexto
              id="tec-username"
              label="Nombre de usuario"
              icon={AtSign}
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={username}
              onChange={e => { setUsername(e.target.value.toLowerCase().replace(/\s/g, "")); setError(""); }}
              placeholder="juan.perez"
              hint="Con esto iniciarás sesión. Entre 4 y 20 caracteres."
              required
            />
            <CampoPassword
              id="tec-nueva-password"
              label="Contraseña"
              value={nuevaPassword}
              onChange={e => { setNuevaPassword(e.target.value); setError(""); }}
              placeholder="••••••••"
              hint="Mínimo 8 caracteres, con letras y números."
              required
            />
            <CampoPassword
              id="tec-confirm-password"
              label="Repetir contraseña"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError(""); }}
              placeholder="••••••••"
              required
            />
            <ErrorAuth mensaje={error} />
            <BotonPrincipal
              cargando={cargando}
              disabled={!username || !nuevaPassword || !confirmPassword}
              icon={CheckCircle2}
            >
              {cargando ? "Creando cuenta..." : "Crear cuenta"}
            </BotonPrincipal>
          </form>
        )}

        {/* ── Paso 3b: recuperación (nueva contraseña) ── */}
        {paso === "rec_password" && (
          <form onSubmit={finalizarRecuperacion} className="space-y-4">
            <CampoPassword
              id="tec-nueva-password"
              label="Nueva contraseña"
              value={nuevaPassword}
              onChange={e => { setNuevaPassword(e.target.value); setError(""); }}
              placeholder="••••••••"
              hint="Mínimo 8 caracteres, con letras y números."
              required
            />
            <CampoPassword
              id="tec-confirm-password"
              label="Repetir contraseña"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError(""); }}
              placeholder="••••••••"
              required
            />
            <ErrorAuth mensaje={error} />
            <BotonPrincipal cargando={cargando} disabled={!nuevaPassword || !confirmPassword} icon={CheckCircle2}>
              {cargando ? "Guardando..." : "Guardar contraseña"}
            </BotonPrincipal>
          </form>
        )}
      </div>
    </div>
  );
}

function BotonPrincipal({
  cargando, disabled, icon: Icon, children,
}: {
  cargando: boolean;
  disabled: boolean;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={cargando || disabled}
      className="w-full h-12 rounded-xl bg-[var(--tec-acento)] text-[var(--tec-sobre-acento)] font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-[0_0_24px_-6px_var(--tec-acento-glow)]"
    >
      {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}

export default TecnicoLogin;
