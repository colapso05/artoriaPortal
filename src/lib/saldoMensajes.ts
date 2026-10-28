import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * El saldo de la cuenta de mensajes (YCloud), en dólares.
 *
 * Por debajo del primer umbral la cuenta está por quedarse sin mensajes; por debajo del
 * segundo conviene recargar. Los dos números los leen la tarjeta del inicio y la del panel
 * para que digan lo mismo.
 */
export const UMBRAL_ROJO = 5;
export const UMBRAL_AMARILLO = 10;

export type NivelSaldo = "alto" | "medio" | "bajo";

export const nivelDelSaldo = (monto: number): NivelSaldo =>
  monto <= UMBRAL_ROJO ? "bajo" : monto <= UMBRAL_AMARILLO ? "medio" : "alto";

export interface Saldo { amount: number; currency: string }

/** El saldo, que se vuelve a pedir cada 10 minutos. `null` = todavía no se pudo leer. */
export function useSaldoYcloud(companyId: string | null): { saldo: Saldo | null; cargando: boolean } {
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelado = false;
    const cargar = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-ycloud-balance", { body: { companyId } });
        if (!cancelado && !error && data && typeof data.amount === "number") {
          setSaldo({ amount: data.amount, currency: data.currency || "USD" });
        }
      } catch {
        // Que no se pueda leer el saldo no puede tumbar el panel entero.
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    cargar();
    const t = setInterval(cargar, 10 * 60 * 1000);
    return () => { cancelado = true; clearInterval(t); };
  }, [companyId]);

  return { saldo, cargando };
}
