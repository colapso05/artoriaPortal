import { useMemo } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Hourglass, Loader2 } from "lucide-react";

export interface EsperaFila {
  conversation_id: string;
  wa_id: string | null;
  profile_name: string | null;
  derivacion_at: string;
  horas_esperando: number;
  topic: string | null;
  summary: string | null;
  /** El estado de su ticket abierto, si ya se verificó. */
  ticket_estado?: string;
}

/** Horas a algo legible. Pasadas 48 h, "509 horas" no se lee: son 21 días. */
function espera(horas: number): string {
  const h = Number(horas) || 0;
  if (h < 1) return "menos de 1 h";
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} días`;
}

const MAX_A_LA_VISTA = 5;

/**
 * Los clientes que pidieron hablar con una persona, tienen un ticket abierto y todavía
 * no reciben respuesta.
 *
 * Solo cuentan los que tienen ticket: es lo que garantiza que alguien los tiene
 * asignados y que aparecen en el Centro de Tickets. Un cliente derivado que nunca
 * llegó a tener ticket no se muestra acá.
 *
 * Es el "uno de cada diez espera dos horas" de la tarjeta de arriba, pero con
 * nombre y apellido: quiénes son, cuánto llevan esperando y de qué se trata, el que
 * más espera primero. Tocar uno abre su conversación.
 *
 * El número de teléfono va primero y el nombre de WhatsApp debajo, igual que en la
 * bandeja: el nombre lo escribe el cliente y puede ser cualquier cosa.
 */
export default function ClientesEsperando({
  filas, onAbrir, onVerTodos,
}: {
  /** null = todavía verificando los tickets; "error" = no se pudo verificar. */
  filas: EsperaFila[] | null | "error";
  onAbrir: (conversationId: string) => void;
  onVerTodos: () => void;
}) {
  const ordenadas = useMemo(
    () => (Array.isArray(filas)
      ? [...filas].sort((a, b) => (Number(b.horas_esperando) || 0) - (Number(a.horas_esperando) || 0))
      : []),
    [filas],
  );
  // El número sale de la lista que se muestra y no de un contador aparte: son los
  // mismos clientes, y si los dos números pueden diferir, alguien los va a comparar.
  const cuantos = ordenadas.length;

  return (
    <div className="rounded-2xl border border-border/25 bg-card/40 p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-0.5">
        <Hourglass className="w-4 h-4 text-amber-500" />
        <h3 className="text-[13px] font-bold flex-1">Clientes esperando a una persona</h3>
        {cuantos > 0 && (
          <span className="text-[11px] font-black tabular-nums px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500">{cuantos}</span>
        )}
      </div>
      <p className="text-[10.5px] text-muted-foreground/50 mb-3">
        Tienen un ticket abierto y nadie del equipo les contestó. El que más espera va primero.
      </p>

      {filas === null ? (
        <div className="flex-1 flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary/40" /></div>
      ) : filas === "error" ? (
        // No se pudo verificar los tickets: se dice, en vez de mostrar una lista sin filtrar.
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6 text-center">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <p className="text-[12px] text-muted-foreground/70">No se pudieron verificar los tickets. Intenta recargar.</p>
        </div>
      ) : ordenadas.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-500/70" />
          <p className="text-[12.5px] text-muted-foreground/70">Ningún ticket abierto está esperando respuesta.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-1.5">
            {ordenadas.slice(0, MAX_A_LA_VISTA).map(f => {
              const h = Number(f.horas_esperando) || 0;
              return (
                <li key={f.conversation_id}>
                  <button
                    onClick={() => onAbrir(f.conversation_id)}
                    className="w-full text-left rounded-xl border border-border/20 bg-background/40 px-3 py-2 hover:bg-muted/30 transition-colors flex items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-bold tabular-nums truncate flex items-center gap-1.5">
                        <span className="truncate">{f.wa_id || f.profile_name || "Sin número"}</span>
                        {f.ticket_estado && (
                          <span className="text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-px rounded bg-muted/60 text-muted-foreground/70 flex-shrink-0">
                            {f.ticket_estado}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground/60 truncate">
                        {[f.topic && f.topic.replace(/_/g, " "), f.summary].filter(Boolean).join(" · ") || "Sin resumen"}
                      </p>
                    </div>
                    {/* La espera pintada como gravedad: es el orden en que hay que atender. */}
                    <span className={`text-[11px] font-black tabular-nums flex-shrink-0 px-1.5 py-0.5 rounded ${
                      h >= 168 ? "bg-red-500/15 text-red-500"
                        : h >= 48 ? "bg-amber-500/15 text-amber-500"
                        : "bg-muted/50 text-muted-foreground/70"}`}>
                      {espera(h)}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 flex-shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
          {cuantos > MAX_A_LA_VISTA && (
            <button onClick={onVerTodos}
              className="mt-2 text-[11.5px] font-semibold text-muted-foreground/60 hover:text-foreground py-1 transition-colors">
              Ver los {cuantos}
            </button>
          )}
        </>
      )}
    </div>
  );
}
