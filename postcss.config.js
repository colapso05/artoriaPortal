import path from "path";
import { fileURLToPath } from "url";

// Tailwind busca su configuración desde el directorio de trabajo del proceso. Al
// quedar el portal dentro de la carpeta Artoria, el servidor de desarrollo arranca
// desde la carpeta padre y no la encontraba: se caía con "The `border-border` class
// does not exist". Apuntarla relativa a este archivo la hace independiente de dónde
// se lance el proceso.
const aqui = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(aqui, "tailwind.config.ts") },
    autoprefixer: {},
  },
};
