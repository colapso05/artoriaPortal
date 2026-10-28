import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const BASE_INPUT =
  "w-full h-12 rounded-xl bg-[var(--tec-superficie-2)] border border-[var(--tec-borde)] text-[15px] text-[var(--tec-texto)] placeholder:text-[var(--tec-texto-4)] outline-none focus:border-[var(--tec-acento)] transition-colors";

/** Campo de texto con ícono a la izquierda. */
export function CampoTexto({
  id, label, icon: Icon, hint, ...props
}: {
  id: string;
  label: string;
  icon: React.ElementType;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-[var(--tec-texto-2)]">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tec-texto-3)]" />
        <input id={id} className={`${BASE_INPUT} pl-10 pr-3`} {...props} />
      </div>
      {hint && <p className="text-[11px] text-[var(--tec-texto-4)]">{hint}</p>}
    </div>
  );
}

/** Campo de contraseña con botón mostrar/ocultar y un ícono opcional a la izquierda. */
export function CampoPassword({
  id, label, hint, icon: Icon, ...props
}: {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ElementType;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-[var(--tec-texto-2)]">{label}</label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tec-texto-3)]" />}
        <input
          id={id}
          type={visible ? "text" : "password"}
          className={`${BASE_INPUT} ${Icon ? "pl-10" : "pl-3"} pr-11`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--tec-texto-3)] hover:text-[var(--tec-texto-2)] transition-colors"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="text-[11px] text-[var(--tec-texto-4)]">{hint}</p>}
    </div>
  );
}

/** Campo de celular con el prefijo +56 fijo. */
export function CampoCelular({
  value, onChange, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="tec-celular" className="text-[13px] font-medium text-[var(--tec-texto-2)]">
        Número de celular
      </label>
      <div className="flex items-center rounded-xl bg-[var(--tec-superficie-2)] border border-[var(--tec-borde)] focus-within:border-[var(--tec-acento)] transition-colors overflow-hidden">
        <span className="pl-3.5 pr-2 text-[15px] text-[var(--tec-texto-2)] font-medium select-none">+56</span>
        <input
          id="tec-celular"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))}
          placeholder="912345678"
          className="flex-1 h-12 bg-transparent text-[15px] text-[var(--tec-texto)] placeholder:text-[var(--tec-texto-4)] outline-none pr-3 disabled:opacity-60"
        />
      </div>
      <p className="text-[11px] text-[var(--tec-texto-4)]">9 dígitos, comenzando con 9</p>
    </div>
  );
}

/** Campo del código de verificación (6 dígitos). */
export function CampoCodigo({
  value, onChange, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="tec-codigo" className="text-[13px] font-medium text-[var(--tec-texto-2)]">
        Código de verificación
      </label>
      <input
        id="tec-codigo"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="000000"
        className="w-full h-14 rounded-xl bg-[var(--tec-superficie-2)] border border-[var(--tec-borde)] text-center text-2xl font-bold tracking-[0.5em] text-[var(--tec-texto)] placeholder:text-[var(--tec-texto-4)] placeholder:tracking-[0.5em] outline-none focus:border-[var(--tec-acento)] transition-colors disabled:opacity-60"
      />
    </div>
  );
}

/** Mensaje de error del formulario. */
export function ErrorAuth({ mensaje }: { mensaje: string }) {
  if (!mensaje) return null;
  return (
    <div className="rounded-xl border border-[var(--tec-error-borde)] bg-[var(--tec-error-suave)] px-4 py-3">
      <p className="text-[13px] text-[var(--tec-error)] leading-snug">{mensaje}</p>
    </div>
  );
}
