/**
 * PasswordStrengthBar — componente reutilizable
 * Reglas:
 *  - Primera letra mayúscula
 *  - Al menos un número
 *  - Solo caracteres permitidos: letras, números, @  -  .  _
 *  - Mínimo 8 caracteres
 * Fuerza:
 *  - Débil   : < 8 chars O falta requisito básico
 *  - Media   : 8+ chars + mayúscula + número
 *  - Fuerte  : media + símbolo permitido + 12+ chars
 */

interface Rule {
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: Rule[] = [
  { label: "Primera letra mayúscula",        test: pw => /^[A-Z]/.test(pw) },
  { label: "Al menos 8 caracteres",          test: pw => pw.length >= 8 },
  { label: "Al menos un número",             test: pw => /[0-9]/.test(pw) },
  { label: "Solo letras, números, @ - . _",  test: pw => /^[A-Za-z0-9@\-._]*$/.test(pw) },
];

export function calcStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  const allBasic = PASSWORD_RULES.every(r => r.test(pw));
  if (!allBasic) return 1;                           // Débil
  const hasSymbol = /[@\-._]/.test(pw);
  const isLong    = pw.length >= 12;
  if (hasSymbol && isLong) return 3;                 // Fuerte
  if (pw.length >= 8) return 2;                      // Media
  return 1;
}

export function isPasswordValid(pw: string): boolean {
  return PASSWORD_RULES.every(r => r.test(pw)) && pw.length >= 8;
}

interface Props {
  password: string;
}

const LEVELS = [
  { label: "",              color: "bg-transparent",  text: "" },
  { label: "Poco segura",   color: "bg-red-500",      text: "text-red-400" },
  { label: "Segura",        color: "bg-amber-400",    text: "text-amber-400" },
  { label: "Muy segura",    color: "bg-emerald-500",  text: "text-emerald-400" },
];

export default function PasswordStrengthBar({ password }: Props) {
  const strength = calcStrength(password);
  const level    = LEVELS[strength];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      {/* Barra */}
      <div className="flex gap-1 h-1.5">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className={`flex-1 rounded-full transition-all duration-300 ${
              strength >= i ? level.color : "bg-secondary/60"
            }`}
          />
        ))}
      </div>

      {/* Etiqueta de nivel */}
      {strength > 0 && (
        <p className={`text-[11px] font-semibold ${level.text}`}>{level.label}</p>
      )}

      {/* Checklist de requisitos */}
      <ul className="space-y-0.5">
        {PASSWORD_RULES.map(rule => {
          const ok = rule.test(password);
          return (
            <li key={rule.label} className={`flex items-center gap-1.5 text-[11px] transition-colors ${ok ? "text-emerald-400" : "text-muted-foreground/60"}`}>
              <span className="text-[10px]">{ok ? "✓" : "○"}</span>
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
