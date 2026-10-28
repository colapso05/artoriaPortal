import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Operador {
  user_id: string;
  nombre: string;
  iniciales: string;
  rol: string | null;
}

const iniciales = (nombre: string) =>
  nombre.split(/[@.\s_-]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join("") || "??";

/**
 * Operadores de la empresa, para mostrar de quién es un caso y para poblar el
 * selector de transferencia.
 *
 * Si `profiles` no es legible para este usuario la lista igual se devuelve con
 * un nombre provisional: es preferible mostrar "Operador 4f2a" que dejar el
 * caso sin dueño visible, que es justo la confusión que se quiere resolver.
 */
export function useOperadores(companyId: string | null | undefined) {
  const [operadores, setOperadores] = useState<Operador[]>([]);

  useEffect(() => {
    setOperadores([]);
    if (!companyId) return;
    let cancelado = false;

    (async () => {
      const { data: miembros, error } = await (supabase as any)
        .from("company_users")
        .select("user_id, role")
        .eq("company_id", companyId);

      if (error || !miembros?.length || cancelado) return;

      const ids = miembros.map((m: any) => m.user_id).filter(Boolean);
      const { data: perfiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", ids);

      if (cancelado) return;

      const porId = new Map<string, string>(
        (perfiles ?? []).map((p: any) => [p.user_id, p.display_name]).filter(([, n]) => !!n) as [string, string][]
      );

      setOperadores(
        miembros.map((m: any) => {
          const nombre = porId.get(m.user_id) ?? `Operador ${String(m.user_id).slice(0, 4)}`;
          return { user_id: m.user_id, nombre, iniciales: iniciales(nombre), rol: m.role ?? null };
        })
      );
    })();

    return () => { cancelado = true; };
  }, [companyId]);

  return operadores;
}

/** Mapa user_id → operador, para resolver el dueño de un caso sin recorrer la lista. */
export function mapaOperadores(operadores: Operador[]): Record<string, Operador> {
  return Object.fromEntries(operadores.map(o => [o.user_id, o]));
}
