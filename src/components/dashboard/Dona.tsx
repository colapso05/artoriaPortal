/**
 * Un gráfico de torta (en anillo) con su leyenda al lado.
 *
 * Cada parte lleva su color, su nombre y su cantidad; el porcentaje se calcula acá. Sin
 * partes con valor no se dibuja nada: un anillo vacío diría "0 de todo" cuando lo que falta
 * es el dato.
 */
export interface ParteDona { valor: number; color: string; etiqueta: string; /** Una línea chica bajo el nombre. */ nota?: string }

const nf = (n: number) => Math.round(n).toLocaleString("es-CL");

export default function Dona({
  partes, centro, subcentro, tam = 150, formato = nf,
}: {
  partes: ParteDona[];
  /** Lo grande que va en el hueco, por ejemplo el total. */
  centro?: string;
  subcentro?: string;
  tam?: number;
  formato?: (n: number) => string;
}) {
  const util = partes.filter(p => p.valor > 0);
  const total = util.reduce((a, p) => a + p.valor, 0);
  if (total <= 0) return null;
  const C = 2 * Math.PI * 40;
  let acumulado = 0;

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative flex-shrink-0" style={{ width: tam, height: tam }}>
        <svg width={tam} height={tam} viewBox="0 0 100 100" role="img"
          aria-label={util.map(p => `${p.etiqueta} ${Math.round((p.valor / total) * 100)} por ciento`).join(", ")}>
          <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="14" />
          {util.map(p => {
            const largo = (p.valor / total) * C;
            const el = (
              <circle key={p.etiqueta} cx="50" cy="50" r="40" fill="none" stroke={p.color} strokeWidth="14"
                strokeDasharray={`${Math.max(0, largo - 0.8)} ${C}`} strokeDashoffset={-acumulado} transform="rotate(-90 50 50)" />
            );
            acumulado += largo;
            return el;
          })}
        </svg>
        {centro && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[19px] font-extrabold tabular-nums leading-none">{centro}</span>
            {subcentro && <span className="text-[10.5px] text-muted-foreground mt-1">{subcentro}</span>}
          </div>
        )}
      </div>
      <ul className="space-y-2 min-w-0 flex-1">
        {util.map(p => (
          <li key={p.etiqueta} className="flex items-center gap-2.5 text-[12.5px]">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="flex-1 min-w-0">
              <span className="block text-muted-foreground truncate">{p.etiqueta}</span>
              {p.nota && <span className="block text-[10.5px] text-muted-foreground/75 truncate">{p.nota}</span>}
            </span>
            <span className="font-bold tabular-nums">{formato(p.valor)}</span>
            <span className="text-muted-foreground/70 tabular-nums w-10 text-right">{Math.round((p.valor / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
