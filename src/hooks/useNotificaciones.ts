import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Avisos del operador. Los nombres están en español porque así está el esquema:
 * `creado_en` (no created_at) y `leida` booleano (existe `leida_en` con la fecha,
 * pero la RPC no la expone).
 */
export interface Notificacion {
  id: string;
  /** 'caso_asignado' | 'caso_arrebatado' */
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  conversation_id: string | null;
  leida: boolean;
  creado_en: string;
  /** display_name de quien generó el aviso — viene resuelto, no hay que joinear. */
  creado_por_nombre: string | null;
}

/**
 * Notificaciones del operador. El contador se mantiene solo por Realtime
 * (`public.notificaciones` tiene REPLICA IDENTITY FULL, así que los UPDATE
 * llegan completos y el filtro por `usuario_id` calza), sin polling.
 */
export function useNotificaciones(userId: string | null | undefined) {
  const [noLeidas, setNoLeidas] = useState(0);
  const [lista, setLista] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(false);
  const soloNoLeidasRef = useRef(false);

  const contar = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await (supabase as any).rpc("notificaciones_no_leidas");
    if (!error && typeof data === "number") setNoLeidas(data);
  }, [userId]);

  const listar = useCallback(async (soloNoLeidas = soloNoLeidasRef.current) => {
    if (!userId) return;
    soloNoLeidasRef.current = soloNoLeidas;
    setCargando(true);
    const { data, error } = await (supabase as any).rpc("notificaciones_listar", {
      p_solo_no_leidas: soloNoLeidas,
      p_limite: 30,
    });
    setCargando(false);
    // Sin resultados la RPC devuelve [], nunca null.
    if (!error && Array.isArray(data)) setLista(data as Notificacion[]);
  }, [userId]);

  const marcarLeida = useCallback(async (id: string) => {
    // Optimista: el globito baja al instante y Realtime confirma después.
    setLista(prev => prev.map(n => (n.id === id ? { ...n, leida: true } : n)));
    setNoLeidas(n => Math.max(0, n - 1));
    await (supabase as any).rpc("notificacion_marcar_leida", { p_id: id });
    contar();
  }, [contar]);

  const marcarTodas = useCallback(async () => {
    setLista(prev => prev.map(n => ({ ...n, leida: true })));
    setNoLeidas(0);
    // Sin `p_id` la RPC marca todas.
    await (supabase as any).rpc("notificacion_marcar_leida", {});
    contar();
  }, [contar]);

  useEffect(() => {
    if (!userId) { setNoLeidas(0); setLista([]); return; }
    contar();

    const canal = supabase
      .channel(`notificaciones:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notificaciones", filter: `usuario_id=eq.${userId}` },
        () => { contar(); listar(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [userId, contar, listar]);

  return { noLeidas, lista, cargando, listar, marcarLeida, marcarTodas };
}
