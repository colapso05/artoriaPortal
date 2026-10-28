/**
 * Comprime una foto antes de subirla — mismos parámetros que la app Android
 * (ImageUtils.kt): lado máximo 1024px y JPEG al 75%.
 *
 * Importa en móvil: una foto de cámara pesa 3-8 MB; comprimida queda en ~100-300 KB,
 * lo que hace viable subirla con datos móviles en terreno.
 */
const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.75;

export async function compressImage(file: File): Promise<File> {
  // Si no es una imagen, devolver tal cual (no debería pasar, pero evita romper el flujo)
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = width / height;
      if (ratio > 1) {
        width = MAX_DIMENSION;
        height = Math.round(MAX_DIMENSION / ratio);
      } else {
        height = MAX_DIMENSION;
        width = Math.round(MAX_DIMENSION * ratio);
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // Si el navegador no soporta createImageBitmap o falla la decodificación,
    // se sube el archivo original antes que perder la evidencia del técnico.
    return file;
  }
}
