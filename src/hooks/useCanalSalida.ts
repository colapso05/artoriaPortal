import { useCallback, useEffect, useState } from "react";
import {
  conversacionCanal, evolutionEstado, fijarCanalConversacion,
  MOTIVO_CANAL, type Proveedor, type ProveedorElegible,
} from "@/lib/canalSalida";

/**
 * Canal de salida de la conversación abierta.
 *
 * `habilitado` dice que la empresa tiene el canal contratado; `usable` que además
 * hay una sesión de WhatsApp vinculada ahora mismo. Son cosas distintas: contratado
 * pero caído es el caso normal —Baileys se desconecta solo— y ahí el selector se
 * muestra deshabilitado con el motivo, nunca escondido. Si desapareciera sin
 * explicación, el operador creería que el portal está roto.
 */
export function useCanalSalida(companyId: string | null | undefined, conversationId: string | null | undefined) {
  const [habilitado, setHabilitado] = useState(false);
  const [usable, setUsable] = useState(false);
  /** 'open' | 'connecting' | 'close'. Se guarda aparte de `usable` porque
   *  "conectando" no es lo mismo que "desconectado" y decirlo mal confunde. */
  const [estadoSesion, setEstadoSesion] = useState<string | null>(null);
  const [canal, setCanalLocal] = useState<Proveedor>("ycloud");
  /** false = la conversacion sigue el canal de la empresa (automatico). */
  const [fijado, setFijado] = useState(false);
  const [cambiando, setCambiando] = useState(false);

  const refrescarEstado = useCallback(async () => {
    if (!companyId) { setHabilitado(false); setUsable(false); setEstadoSesion(null); return; }
    // Por RPC y no leyendo `company_config`: esa tabla guarda el token de la instancia.
    const e = await evolutionEstado(companyId);
    setHabilitado(!!e.enabled);
    setUsable(!!e.usable);
    setEstadoSesion(e.state ?? null);
  }, [companyId]);

  useEffect(() => { refrescarEstado(); }, [refrescarEstado]);

  useEffect(() => {
    // Sin el canal contratado todo sale por el oficial: no hace falta preguntar por
    // cada conversación que se abre.
    if (!conversationId || !habilitado) { setCanalLocal("ycloud"); setFijado(false); return; }
    let cancelado = false;
    conversacionCanal(conversationId).then(r => {
      if (cancelado || !r) return;
      setCanalLocal(r.efectivo);
      setFijado(!!r.fijado);
    });
    // La sesión pudo caerse mientras la bandeja llevaba horas abierta. Volver a
    // preguntar al abrir cada chat mantiene el selector honesto sin encuestar en bucle.
    refrescarEstado();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, habilitado]);

  /** Devuelve null si salió bien, o el motivo para mostrárselo al operador. */
  const cambiarCanal = useCallback(async (proveedor: ProveedorElegible): Promise<string | null> => {
    if (!conversationId) return "La conversación ya no está disponible.";
    const anterior = canal;
    // Con "auto" no se sabe de antemano qué canal toca: lo resuelve la cascada en la
    // base y vuelve en `efectivo`, así que ahí no se adelanta nada.
    if (proveedor !== "auto") setCanalLocal(proveedor);
    setCambiando(true);
    const r = await fijarCanalConversacion(conversationId, proveedor);
    setCambiando(false);
    if (r.ok) {
      if (r.efectivo) setCanalLocal(r.efectivo);
      setFijado(proveedor !== "auto");
      return null;
    }
    setCanalLocal(anterior);            // el cambio no quedó guardado: no fingir que sí
    return MOTIVO_CANAL[r.error ?? ""] ?? "No se pudo cambiar el canal.";
  }, [conversationId, canal]);

  /**
   * Por dónde sale realmente el mensaje.
   *
   * Si la conversación quedó marcada en "sin costo" pero la sesión está caída, se
   * usa el oficial igual: dejar de enviar sería peor que cobrar. El selector avisa
   * en pantalla que está pasando esto, así que no es un cobro silencioso.
   */
  const canalEfectivo: Proveedor = usable ? canal : "ycloud";

  return { habilitado, usable, estadoSesion, canal, canalEfectivo, fijado, cambiarCanal, cambiando, refrescarEstado };
}
