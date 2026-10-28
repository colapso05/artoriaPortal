import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { componentTagger } from "lovable-tagger";

const BUILD_NUMBER_FILE = path.resolve(__dirname, ".build-number");

// Lee y aumenta el contador de build (persistido en .build-number). Solo se incrementa en
// `vite build` — un `vite dev` no cuenta como nueva versión desplegada.
function nextBuildNumber(shouldIncrement: boolean): number {
  let current = 0;
  try {
    if (existsSync(BUILD_NUMBER_FILE)) current = parseInt(readFileSync(BUILD_NUMBER_FILE, "utf-8").trim(), 10) || 0;
  } catch { /* noop */ }
  const next = shouldIncrement ? current + 1 : current || 1;
  if (shouldIncrement) {
    try { writeFileSync(BUILD_NUMBER_FILE, String(next)); } catch { /* noop */ }
  }
  return next;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const buildNumber = nextBuildNumber(command === "build");
  // Identificador único de esta build para detectar cambios (número de build + timestamp,
  // así aunque alguien olvide versionar .build-number, cada build sigue siendo distinguible).
  const appVersion = `${buildNumber}-${Date.now()}`;

  return {
    server: {
      host: "::",
      port: 8080,
      allowedHosts: true,
      hmr: {
        overlay: false,
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __BUILD_NUMBER__: JSON.stringify(buildNumber),
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      {
        // Escribe dist/version.json con la versión de esta build (para el auto-update del cliente).
        name: "emit-version-json",
        apply: "build",
        closeBundle() {
          const outDir = path.resolve(__dirname, "dist");
          try {
            mkdirSync(outDir, { recursive: true });
            writeFileSync(path.join(outDir, "version.json"), JSON.stringify({ version: appVersion, build: buildNumber }));
          } catch (e) {
            console.warn("[emit-version-json] no se pudo escribir version.json:", e);
          }
        },
      },
    ].filter(Boolean),
    build: {
      sourcemap: false, // no exponer source maps en producción
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
