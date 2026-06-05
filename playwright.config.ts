import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',

  /* Corre tests secuencialmente — el portal usa Supabase real (staging) */
  fullyParallel: false,

  /* Reintentar 1 vez en caso de fallo */
  retries: 1,

  /* 1 worker para no saturar el servidor */
  workers: 1,

  /* Reporter HTML — genera reporte visual en playwright-report/ */
  reporter: 'html',

  use: {
    /* URL base del dev server de Vite */
    baseURL: 'http://localhost:8080',

    /* Captura trace en el primer reintento para debugging */
    trace: 'on-first-retry',

    /* Screenshot solo cuando falla */
    screenshot: 'only-on-failure',

    /* Sin video por defecto (activa con 'on' si necesitas grabar) */
    video: 'off',

    /* Viewport estándar de escritorio */
    viewport: { width: 1280, height: 720 },

    /* ── Cambiar a true para ver el navegador en tiempo real ──
       false = más rápido (headless), true = ves el ratón moverse */
    headless: false,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Levanta el dev server automáticamente antes de correr los tests.
     Si ya hay uno corriendo en :8080, lo reutiliza. */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
