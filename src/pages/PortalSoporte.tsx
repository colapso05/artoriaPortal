import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ChatArto } from "@/components/soporte/ChatArto";
import { LogoMarca } from "@/components/soporte/LogoMarca";
import { MARCA } from "@/lib/soporte/marca";
import { resolverSesion, type SesionSoporte } from "@/lib/soporte/api";

/**
 * /soporte — chat de atención al cliente.
 *
 * Reemplaza la conversación de WhatsApp: el cliente recibe por WhatsApp un solo
 * mensaje con el link (artoria.cl/soporte?t=...) y el resto del intercambio ocurre
 * acá, sin costo por mensaje.
 *
 * El parámetro `t` es el token que el backend generó al mandar ese link, y es lo
 * que permite saber qué cliente está escribiendo sin pedirle que se identifique.
 */
export default function PortalSoporte() {
  const [sesion, setSesion] = useState<SesionSoporte | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("t") ?? params.get("token");

    // El token identifica al cliente: se saca de la barra de direcciones para que
    // no quede en capturas de pantalla ni se comparta por accidente.
    if (token) window.history.replaceState({}, "", window.location.pathname);

    let cancelado = false;
    resolverSesion(token)
      .then(s => { if (!cancelado) setSesion(s); })
      .finally(() => { if (!cancelado) setCargando(false); });

    return () => { cancelado = true; };
  }, []);

  // Pantalla completa oscura: sin scroll del documento ni barra del sistema clara.
  useEffect(() => {
    document.title = `Soporte · ${MARCA.nombre}`;

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previo = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", "#151A2B");

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      if (meta && previo !== null) meta.setAttribute("content", previo);
      document.body.style.overflow = overflowPrevio;
    };
  }, []);

  if (cargando) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3"
        style={{ height: "100dvh", background: "var(--sop-fondo)", color: "var(--sop-texto-2)" }}
      >
        <LogoMarca tam={64} />
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return <ChatArto sesion={sesion} />;
}
