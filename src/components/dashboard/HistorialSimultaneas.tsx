import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fechaHoraCorta, ultimosMeses, type Mes } from "@/lib/meses";

interface PeakMes {
  mes: Mes;
  peak: number | null;
  momento: string | null;
}

/**
 * El máximo de conversaciones que el agente atendió a la vez, mes a mes.
 *
 * Usa la misma función que el "Peak atendido" de arriba (`peak_concurrencia`),
 * pedida una vez por mes. Dice cuánto fue el máximo y cuándo ocurrió.
 *
 * Todavía no se puede abrir un mes para ver *cuáles* fueron esas conversaciones:
 * la función devuelve el momento del máximo, pero no su lista. Eso hay que pedirlo
 * al backend (ver el mensaje de plantillas y simultáneas).
 */
const MESES_A_LA_VISTA = 4;
const MESES_MAXIMO = 12;

export default function HistorialSimultaneas({ companyId }: { companyId: string }) {
  const [filas, setFilas] = useState<PeakMes[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  // Cada mes es una consulta a la base, así que los doce se piden solo si se pide verlos.
  const [verTodos, setVerTodos] = useState(false);
  const meses = verTodos ? MESES_MAXIMO : MESES_A_LA_VISTA;

  useEffect(() => {
    let cancelado = false;
    setFilas(null);
    setFallo(null);
    const lista = ultimosMeses(meses);
    Promise.all(lista.map(async (mes): Promise<PeakMes & { error?: string }> => {
      const { data, error } = await (supabase as any).rpc("peak_concurrencia", {
        p_company_id: companyId, p_desde: mes.desde, p_hasta: mes.hasta,
      });
      if (error) return { mes, peak: null, momento: null, error: error.message };
      const fila = Array.isArray(data) ? data[0] : data;
      const n = Number(fila?.peak_5min);
      return { mes, peak: Number.isFinite(n) ? n : null, momento: fila?.peak_bucket ?? null };
    })).then(r => {
      if (cancelado) return;
      const falloUno = r.find(x => x.error);
      // Si fallaron todos es un problema real; si falló uno suelto, se muestra con "—".
      if (falloUno && r.every(x => x.error)) setFallo(falloUno.error ?? "error");
      setFilas(r);
    });
    return () => { cancelado = true; };
  }, [companyId, meses]);

  const mayor = Math.max(1, ...(filas?.map(f => f.peak ?? 0) ?? [1]));

  return (
    <div className="rounded-2xl border border-border/25 bg-card/40 p-4">
      <div className="flex items-center gap-2 mb-0.5">
        <Users className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Atención simultánea
        </span>
      </div>
      <p className="text-[10.5px] text-muted-foreground/50 mb-3">
        Máximo de conversaciones atendidas a la vez, por mes
      </p>

      {filas === null ? (
        <div className="flex justify-center py-5"><Loader2 className="w-5 h-5 animate-spin text-primary/40" /></div>
      ) : fallo ? (
        <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-muted-foreground break-words">No se pudo cargar: {fallo}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filas.map(f => (
            <li key={f.mes.clave}>
              <div className="flex items-baseline gap-2">
                <span className="text-[12.5px] font-semibold flex-1 truncate">
                  {f.mes.etiqueta}
                  {f.mes.enCurso && <span className="text-[10px] font-medium text-muted-foreground/45 ml-1.5">en curso</span>}
                </span>
                <span className="text-[15px] font-black tabular-nums">{f.peak ?? "—"}</span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden mt-1">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${((f.peak ?? 0) / mayor) * 100}%` }} />
              </div>
              {f.peak != null && f.peak > 0 && f.momento && (
                <p className="text-[10.5px] text-muted-foreground/50 mt-0.5">
                  Fue el {fechaHoraCorta(f.momento)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {filas !== null && !fallo && (
        <button
          onClick={() => setVerTodos(v => !v)}
          className="w-full text-[11.5px] font-semibold text-muted-foreground/60 hover:text-foreground pt-3 transition-colors"
        >
          {verTodos ? "Ver menos" : `Ver los ${MESES_MAXIMO} meses`}
        </button>
      )}
    </div>
  );
}
