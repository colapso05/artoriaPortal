import { useCallback, useEffect, useState } from "react";

/**
 * Qué tarjetas fijó cada persona en el inicio.
 *
 * Se guarda en el navegador y por empresa: sirve para probar la idea sin tocar la base.
 * Si la persona entra desde otro computador, ahí no están. Para que la elección viaje
 * entre dispositivos hay que guardarla en el servidor; ver `docs` del prototipo.
 *
 * Todo acceso al almacenamiento va en try/catch: en una ventana privada o con los datos
 * del sitio bloqueados lanza una excepción, y el inicio no puede romperse por eso.
 */
const clave = (empresa: string) => `artoria:pines:v2:${empresa}`;

function leer(empresa: string, porDefecto: string[]): string[] {
  try {
    const crudo = localStorage.getItem(clave(empresa));
    if (crudo === null) return porDefecto;
    const v = JSON.parse(crudo);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function usePines(empresa: string | null, porDefecto: string[] = []) {
  const [pines, setPines] = useState<string[]>(() => (empresa ? leer(empresa, porDefecto) : porDefecto));

  // Al cambiar de empresa (la vista simulada lo hace) se leen los de esa empresa.
  useEffect(() => {
    if (empresa) setPines(leer(empresa, porDefecto));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa]);

  const alternar = useCallback((id: string) => {
    setPines(prev => {
      const sig = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (empresa) { try { localStorage.setItem(clave(empresa), JSON.stringify(sig)); } catch { /* sin almacenamiento */ } }
      return sig;
    });
  }, [empresa]);

  return { pines, alternar, estaFijado: (id: string) => pines.includes(id) };
}
