import { useEffect, useState } from "react";
import { Bell, Share, X, Loader2 } from "lucide-react";
import { esIOS, estaInstalada, puedeRecibirPush, permisoConcedido, pedirPermisoPush } from "@/lib/tecnicos/push";

const OCULTO_KEY = "tec_push_banner_oculto";

/**
 * Aviso para activar las notificaciones.
 *
 * En iPhone/iPad, Apple solo permite push si la web fue agregada a la pantalla de
 * inicio y se abre desde ahí — por eso ahí se muestran las instrucciones en vez del
 * botón, que no serviría de nada.
 */
export function TecnicoPushBanner() {
  const [oculto, setOculto] = useState(() => {
    try { return sessionStorage.getItem(OCULTO_KEY) === "1"; } catch { return false; }
  });
  const [concedido, setConcedido] = useState(permisoConcedido());
  const [pidiendo, setPidiendo] = useState(false);
  const [soporta, setSoporta] = useState(false);
  const [necesitaInstalar, setNecesitaInstalar] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    setSoporta("serviceWorker" in navigator && "PushManager" in window);
    setNecesitaInstalar(esIOS() && !estaInstalada());
    setBloqueado(typeof Notification !== "undefined" && Notification.permission === "denied");
  }, []);

  const cerrar = () => {
    setOculto(true);
    try { sessionStorage.setItem(OCULTO_KEY, "1"); } catch { /* noop */ }
  };

  const activar = async () => {
    setPidiendo(true);
    setFallo(false);
    try {
      const ok = await pedirPermisoPush();
      const logrado = ok || permisoConcedido();
      setConcedido(logrado);
      // Ni concedido ni bloqueado: el servicio de notificaciones no respondió.
      if (!logrado && typeof Notification !== "undefined" && Notification.permission === "default") {
        setFallo(true);
      }
      setBloqueado(typeof Notification !== "undefined" && Notification.permission === "denied");
    } finally {
      setPidiendo(false);
    }
  };

  if (oculto || concedido || !soporta) return null;

  // Permiso bloqueado: el navegador ya no vuelve a preguntar, hay que ir a ajustes.
  // Sin esto mostraríamos un botón "Activar" que no haría absolutamente nada.
  if (bloqueado) {
    return (
      <Contenedor onCerrar={cerrar}>
        <p className="text-[13px] font-semibold text-[var(--tec-texto)] leading-tight">
          Notificaciones bloqueadas
        </p>
        <p className="text-[12px] text-[var(--tec-texto-2)] leading-relaxed mt-1">
          Las bloqueaste para este sitio. Para reactivarlas, ábrelas desde los ajustes del
          navegador (el ícono junto a la dirección web) y permite las notificaciones.
        </p>
      </Contenedor>
    );
  }

  // iPhone sin instalar: explicar cómo agregarla a la pantalla de inicio
  if (necesitaInstalar) {
    return (
      <Contenedor onCerrar={cerrar}>
        <p className="text-[13px] font-semibold text-[var(--tec-texto)] leading-tight">
          Instala la app para recibir avisos
        </p>
        <p className="text-[12px] text-[var(--tec-texto-2)] leading-relaxed mt-1">
          Toca <Share className="w-3.5 h-3.5 inline-block mx-0.5 -mt-0.5 text-[var(--tec-acento)]" />
          <strong className="text-[var(--tec-texto-2)]">Compartir</strong> y luego{" "}
          <strong className="text-[var(--tec-texto-2)]">"Agregar a inicio"</strong>. Ábrela desde ahí y podrás
          activar las notificaciones.
        </p>
      </Contenedor>
    );
  }

  if (!puedeRecibirPush()) return null;

  return (
    <Contenedor onCerrar={cerrar}>
      <p className="text-[13px] font-semibold text-[var(--tec-texto)] leading-tight">
        Activa las notificaciones
      </p>
      <p className="text-[12px] text-[var(--tec-texto-2)] leading-relaxed mt-1 mb-2.5">
        Para enterarte al instante cuando te asignen un trabajo, aunque tengas la app cerrada.
      </p>
      {fallo && (
        <p className="text-[12px] text-[var(--tec-aviso)] leading-relaxed mb-2.5">
          No se pudo contactar el servicio de notificaciones. Revisa tu conexión e inténtalo
          de nuevo.
        </p>
      )}
      <button
        onClick={activar}
        disabled={pidiendo}
        className="h-9 px-4 rounded-xl bg-[var(--tec-acento)] text-[var(--tec-sobre-acento)] text-[13px] font-bold inline-flex items-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
      >
        {pidiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
        {pidiendo ? "Activando..." : fallo ? "Reintentar" : "Activar"}
      </button>
    </Contenedor>
  );
}

function Contenedor({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="rounded-2xl border border-[var(--tec-acento-borde)] bg-[var(--tec-acento-tenue)] p-4 mb-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-[var(--tec-acento-suave)] flex items-center justify-center flex-shrink-0">
        <Bell className="w-4 h-4 text-[var(--tec-acento)]" />
      </div>
      <div className="flex-1 min-w-0">{children}</div>
      <button
        onClick={onCerrar}
        className="text-[var(--tec-texto-3)] hover:text-[var(--tec-texto-2)] transition-colors flex-shrink-0"
        aria-label="Ocultar aviso"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default TecnicoPushBanner;
