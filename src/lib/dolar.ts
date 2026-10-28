import { useEffect, useState } from "react";

/**
 * El dólar observado, para mostrar cuánto son dólares en pesos.
 *
 * El saldo de mensajes está en dólares y la gente piensa en pesos. La cifra viene
 * de mindicador.cl, que publica el dólar observado del Banco Central.
 *
 * Es una referencia, no el tipo de cambio con el que se hace una carga: eso se dice
 * en pantalla, porque un número con decimales parece una promesa.
 */

export interface DolarObservado {
  /** Pesos por dólar. */
  valor: number;
  /** Día al que corresponde, "AAAA-MM-DD". */
  fecha: string;
}

const URL_DOLAR = "https://mindicador.cl/api/dolar";
const VIGENCIA_MS = 60 * 60 * 1000;
const TIEMPO_MAXIMO_MS = 6000;

let guardado: { en: number; dato: DolarObservado } | null = null;

export async function dolarObservado(): Promise<DolarObservado | null> {
  if (guardado && Date.now() - guardado.en < VIGENCIA_MS) return guardado.dato;

  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), TIEMPO_MAXIMO_MS);
  try {
    const r = await fetch(URL_DOLAR, { signal: corte.signal });
    if (!r.ok) return null;
    const json = await r.json();
    const ultimo = json?.serie?.[0];
    const valor = Number(ultimo?.valor);
    // Un valor que no sea un número razonable no se usa: convertir con un cero o un
    // NaN mostraría "US$ Infinity" delante de un cliente.
    if (!Number.isFinite(valor) || valor < 100 || valor > 5000) return null;
    const dato = { valor, fecha: String(ultimo.fecha).slice(0, 10) };
    guardado = { en: Date.now(), dato };
    return dato;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

/** null mientras carga o si no se pudo leer: quien lo use tiene que contemplar ambos. */
export function useDolar(): { dolar: DolarObservado | null; cargando: boolean } {
  const [dolar, setDolar] = useState<DolarObservado | null>(guardado?.dato ?? null);
  const [cargando, setCargando] = useState(!guardado);

  useEffect(() => {
    let cancelado = false;
    dolarObservado().then(d => {
      if (cancelado) return;
      setDolar(d);
      setCargando(false);
    });
    return () => { cancelado = true; };
  }, []);

  return { dolar, cargando };
}
