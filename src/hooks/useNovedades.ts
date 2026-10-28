import { useEffect, useState } from "react";
import { Clock, CreditCard, MessageCircle, Zap, Calendar, Hand } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ItemNovedad } from "@/components/dashboard/CampanaNotificaciones";

// ── Versión actual del changelog ─────────────────────────────────────────────
// Cambiar este string al publicar nuevas novedades — los usuarios que ya lo
// vieron (almacenado en user_metadata de Supabase) volverán a verlo.
export const CHANGELOG_VERSION = "v2026-08";

/**
 * Changelog del portal y su estado de "visto".
 *
 * Vive en un hook porque la campana aparece en dos sitios (el encabezado y la
 * bandeja, que no monta el encabezado) y el punto de "hay novedades" tiene que
 * apagarse en los dos a la vez.
 */
export function useNovedades(opciones?: { onContextoTemporal?: () => void }) {
  const [vistas, setVistas] = useState(true); // "visto" hasta que el async diga lo contrario

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const vistos: string[] = user?.user_metadata?.seen_changelogs ?? [];
      setVistas(vistos.includes(CHANGELOG_VERSION));
    });
  }, []);

  const marcarVistas = async () => {
    if (vistas) return;
    setVistas(true);
    const { data: { user } } = await supabase.auth.getUser();
    const vistos: string[] = user?.user_metadata?.seen_changelogs ?? [];
    if (!vistos.includes(CHANGELOG_VERSION)) {
      await supabase.auth.updateUser({ data: { seen_changelogs: [...vistos, CHANGELOG_VERSION] } });
    }
  };

  const novedades: ItemNovedad[] = [
    {
      icon: Hand,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      badge: "NUEVO",
      title: "Casos tomados y avisos en la campana",
      desc: "Cada conversación muestra quién la lleva, con el nombre a la vista. Si respondes un chat sin dueño queda a tu nombre solo. Y si alguien te transfiere o te quita un caso, te llega un aviso acá mismo.",
    },
    {
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      title: "Contexto Temporal del Agente IA",
      desc: "¿Feriado el lunes? ¿Promoción esta semana? Ahora podés darle instrucciones temporales al agente IA que se activan automáticamente y se borran solas al vencer — sin tocar el prompt principal.",
      actionLabel: "Ver cómo funciona →",
      onAction: opciones?.onContextoTemporal,
    },
    {
      icon: CreditCard,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      title: "Facturación con MercadoPago",
      desc: "Podés pagar tus boletas directamente desde el portal con tarjeta de crédito o débito a través de MercadoPago. Sin redireccionamientos — el formulario aparece dentro del portal.",
    },
    {
      icon: MessageCircle,
      color: "text-primary",
      bg: "bg-primary/10",
      title: "Búsqueda de mensajes en la Bandeja",
      desc: "El buscador ahora encuentra conversaciones por el contenido de sus mensajes, no solo por el nombre. Mientras más específica sea la búsqueda, menos resultados y más precisos.",
    },
    {
      icon: Zap,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      title: "Notificaciones en tiempo real",
      desc: "Si llegó un mensaje nuevo mientras estabas en otra sección del portal, ahora aparece un banner con el nombre del cliente y el mensaje — sin necesidad de estar en la Bandeja.",
    },
    {
      icon: Calendar,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
      title: "Agenda del día en la Bandeja",
      desc: "Cuando no tenés ninguna conversación abierta, la Bandeja ahora muestra la agenda de citas del día y un bloc de notas para el turno — todo en el panel izquierdo.",
    },
  ];

  return { novedades, vistas, marcarVistas };
}
