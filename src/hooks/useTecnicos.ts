import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TecnicoBandeja {
  id: string;
  name: string;
  phone: string | null;
  color: string;
  photo_url?: string | null;
  is_active: boolean;
}

/**
 * Los últimos ocho dígitos del teléfono, que es lo único comparable.
 *
 * En la agenda el número del técnico se guarda como "+56912345678"; en la
 * conversación llega como `wa_id`, y entre medio aparecen espacios, guiones y el
 * prefijo escrito de varias formas. Los últimos ocho dígitos identifican a la
 * persona en Chile sin depender de cómo se escribió el resto, así que un técnico
 * no desaparece de la bandeja porque alguien cargó el número con un formato
 * distinto.
 */
export const claveTelefono = (valor?: string | null): string | null => {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos.length >= 8 ? digitos.slice(-8) : null;
};

const COLUMNAS = "id, name, phone, color, photo_url, is_active";

/**
 * Los técnicos de la empresa, tal como se dieron de alta en la agenda.
 *
 * La agenda es la única fuente: ahí se les pone nombre y número, y de ahí sale
 * tanto quién aparece bajo el filtro de técnicos en la bandeja como el nombre
 * que se muestra en lugar del teléfono. No hay una segunda lista que mantener.
 */
export function useTecnicos(companyId?: string) {
  const [tecnicos, setTecnicos] = useState<TecnicoBandeja[]>([]);

  useEffect(() => {
    if (!companyId) { setTecnicos([]); return; }
    let cancelado = false;

    const cargar = () => {
      (supabase as any)
        .from("technicians")
        .select(COLUMNAS)
        .eq("company_id", companyId)
        .then(({ data }: any) => {
          if (!cancelado) setTecnicos(Array.isArray(data) ? data : []);
        });
    };
    cargar();

    // Dar de alta un técnico en la agenda tiene que reflejarse en la bandeja sin
    // recargar: si no, su chat sigue apareciendo como un número suelto.
    const canal = supabase
      .channel(`tecnicos-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "technicians", filter: `company_id=eq.${companyId}` },
        cargar,
      )
      .subscribe();

    return () => { cancelado = true; supabase.removeChannel(canal); };
  }, [companyId]);

  const porTelefono = useMemo(() => {
    const mapa = new Map<string, TecnicoBandeja>();
    tecnicos.forEach((t) => {
      const clave = claveTelefono(t.phone);
      if (clave) mapa.set(clave, t);
    });
    return mapa;
  }, [tecnicos]);

  /**
   * El técnico detrás de un número, o null si ese número no es de ninguno.
   *
   * Incluye a los inactivos a propósito: su chat y su historial siguen estando,
   * y mostrarlos de golpe como un número sin nombre haría parecer que se
   * perdieron las conversaciones.
   */
  const buscarTecnico = useMemo(
    () => (waId?: string | null): TecnicoBandeja | null => {
      const clave = claveTelefono(waId);
      return clave ? porTelefono.get(clave) ?? null : null;
    },
    [porTelefono],
  );

  return { tecnicos, buscarTecnico };
}
