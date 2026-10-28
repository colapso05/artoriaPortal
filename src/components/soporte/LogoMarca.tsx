import { useState } from "react";
import { MARCA } from "@/lib/soporte/marca";

/**
 * Foto de perfil del chat: el logo de la empresa.
 *
 * Si el archivo no está o no carga, en vez de un ícono roto se muestra la inicial
 * del nombre — la conversación tiene que verse bien igual.
 */
export function LogoMarca({ tam = 40 }: { tam?: number }) {
  const [falló, setFalló] = useState(false);

  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{ width: tam, height: tam, background: "var(--sop-burbuja-arto)" }}
    >
      {falló ? (
        <span style={{ fontSize: tam * 0.45, fontWeight: 700, color: "var(--sop-texto)" }}>
          {MARCA.nombre.charAt(0)}
        </span>
      ) : (
        <img
          src={MARCA.logo}
          alt={MARCA.nombre}
          width={tam}
          height={tam}
          onError={() => setFalló(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

export default LogoMarca;
