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
  // Solo las builds marcadas como criticas avisan a los usuarios y fuerzan la recarga.
  // Un deploy normal (pruebas, estilos, features sin urgencia) no molesta a las empresas.
  const criticalUpdate = process.env.VITE_CRITICAL_UPDATE === "1";
  const updateNotes = process.env.VITE_UPDATE_NOTES ?? "";

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
            writeFileSync(
              path.join(outDir, "version.json"),
              JSON.stringify({ version: appVersion, build: buildNumber, critical: criticalUpdate, notes: updateNotes }),
            );
          } catch (e) {
            console.warn("[emit-version-json] no se pudo escribir version.json:", e);
          }
        },
      },
      {
        // Preload de los chunks críticos del inicio: el navegador los empieza a bajar
        // mientras parsea el HTML, en vez de esperar a descubrirlos en el entry.
        // Se resuelven en tiempo de build, así que nunca queda un hash viejo escrito a mano.
        name: "preload-criticos",
        apply: "build",
        transformIndexHtml: {
          order: "post",
          handler(html, ctx) {
            const bundle = (ctx as { bundle?: Record<string, { type: string; name?: string; fileName: string }> }).bundle ?? {};
            const criticos = ["react-vendor"];
            const links: string[] = [];
            for (const item of Object.values(bundle)) {
              if (item.type === "chunk" && item.name && criticos.includes(item.name) && item.fileName.endsWith(".js")) {
                const href = `/${item.fileName}`;
                if (!html.includes(href)) links.push(`    <link rel="modulepreload" crossorigin href="${href}" />`);
              }
            }
            return links.length ? html.replace("</head>", links.join("\n") + "\n  </head>") : html;
          },
        },
      },
    ].filter(Boolean),
    build: {
      sourcemap: false, // no exponer source maps en producción
      manifest: process.env.VITE_MANIFEST === "1", // solo para diagnóstico local
      rollupOptions: {
        output: {
          // Separa las librerías del código propio: se descargan en paralelo y, al no
          // cambiar entre deploys, quedan cacheadas por el navegador. Sin catch-all: lo
          // que no está listado se queda en el chunk que lo importa (así el inicio no
          // arrastra pdf, xlsx ni los gráficos).
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return undefined;
            const p = id.replace(/\\/g, "/");
            if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(p)) return "react-vendor";
            if (/node_modules\/@supabase\//.test(p)) return "supabase";
            if (/node_modules\/(leaflet|leaflet-draw|react-leaflet|@geoman-io)\//.test(p)) return "mapas";
            if (/node_modules\/@sentry\//.test(p)) return "sentry";
            if (/node_modules\/framer-motion\//.test(p)) return "motion";
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
