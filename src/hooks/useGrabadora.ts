import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Grabadora de notas de voz para el chat de soporte.
 *
 * Devuelve el audio como `File` para poder mandarlo por el mismo camino que
 * cualquier otro adjunto. El formato lo elige el navegador: Chrome y Android
 * graban en webm/opus y Safari en mp4, así que se toma el primero soportado en
 * vez de imponer uno.
 */

const FORMATOS = [
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
];

function formatoSoportado() {
  if (typeof MediaRecorder === "undefined") return null;
  return FORMATOS.find(f => MediaRecorder.isTypeSupported?.(f.mime)) ?? { mime: "", ext: "webm" };
}

export interface Grabadora {
  /** false en navegadores sin MediaRecorder o sin permiso de micrófono. */
  soportada: boolean;
  grabando: boolean;
  segundos: number;
  /** Pide el micrófono y empieza. Lanza si el usuario niega el permiso. */
  iniciar: () => Promise<void>;
  /** Corta y devuelve el audio grabado. */
  detener: () => Promise<File | null>;
  /** Corta y descarta lo grabado. */
  cancelar: () => void;
}

export function useGrabadora(): Grabadora {
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const trozosRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const descartarRef = useRef(false);
  const relojRef = useRef<number>();

  const soltarMicrofono = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    window.clearInterval(relojRef.current);
    setGrabando(false);
  }, []);

  // Si la pantalla se cierra a mitad de grabación, el micrófono no puede quedar abierto.
  useEffect(() => soltarMicrofono, [soltarMicrofono]);

  const iniciar = useCallback(async () => {
    const formato = formatoSoportado();
    if (!formato) throw new Error("Este navegador no permite grabar audio.");

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, formato.mime ? { mimeType: formato.mime } : undefined);

    trozosRef.current = [];
    descartarRef.current = false;
    recorder.ondataavailable = e => { if (e.data.size > 0) trozosRef.current.push(e.data); };
    recorder.start();

    streamRef.current = stream;
    recorderRef.current = recorder;
    setSegundos(0);
    setGrabando(true);
    relojRef.current = window.setInterval(() => setSegundos(s => s + 1), 1000);
  }, []);

  const detener = useCallback(() => {
    return new Promise<File | null>(resolve => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        soltarMicrofono();
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const trozos = trozosRef.current;
        const formato = formatoSoportado();
        const mime = recorder.mimeType || formato?.mime || "audio/webm";
        const ext = formato?.ext ?? "webm";
        soltarMicrofono();

        if (descartarRef.current || trozos.length === 0) {
          resolve(null);
          return;
        }
        const blob = new Blob(trozos, { type: mime });
        resolve(new File([blob], `audio-${Date.now()}.${ext}`, { type: mime }));
      };

      recorder.stop();
    });
  }, [soltarMicrofono]);

  const cancelar = useCallback(() => {
    descartarRef.current = true;
    void detener();
  }, [detener]);

  return {
    soportada: formatoSoportado() !== null,
    grabando,
    segundos,
    iniciar,
    detener,
    cancelar,
  };
}
