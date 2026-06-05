import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ── Cargar credenciales desde .env.test ──────────────────────────────────────
function loadEnvTest() {
  const envPath = path.join(process.cwd(), '.env.test');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env: Record<string, string> = {};
  for (const line of lines) {
    const [key, ...val] = line.split('=');
    if (key && !key.startsWith('#') && val.length) {
      env[key.trim()] = val.join('=').trim();
    }
  }
  return env;
}

const env = loadEnvTest();
const ADMIN_EMAIL    = env.TEST_ADMIN_EMAIL    || process.env.TEST_ADMIN_EMAIL    || '';
const ADMIN_PASSWORD = env.TEST_ADMIN_PASSWORD || process.env.TEST_ADMIN_PASSWORD || '';

// Nombre de la empresa a simular (debe existir en AdminUserManager)
const COMPANY_TO_SIMULATE = env.TEST_COMPANY_NAME || process.env.TEST_COMPANY_NAME || 'Dropp';

// ── Helper: login como admin_isp ──────────────────────────────────────────────
async function login(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput  = page.locator('input[type="password"]').first();

  await expect(emailInput).toBeVisible({ timeout: 10_000 });
  await emailInput.fill(ADMIN_EMAIL);
  await passInput.fill(ADMIN_PASSWORD);
  await page.keyboard.press('Enter');

  await page.waitForURL(/dashboard|portal/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  console.log('✅ Login OK como admin_isp');
}

// ── Helper: simular empresa y navegar a Facturación ───────────────────────────
async function simulateAndGoToBilling(page: Page) {
  // 1. Navegar a la vista "Empresas" del sidebar
  const empresasLink = page.locator('button:has-text("Empresas"), [data-view="users"]').first();
  await expect(empresasLink).toBeVisible({ timeout: 8_000 });
  await empresasLink.click();
  await page.waitForLoadState('networkidle');
  console.log('✅ Vista Empresas abierta');

  // 2. Buscar la empresa y hacer clic en "Simular esta empresa"
  //    El botón puede estar directo en la lista o dentro del panel de detalles
  const companyCard = page.locator(`text=${COMPANY_TO_SIMULATE}`).first();
  await expect(companyCard).toBeVisible({ timeout: 10_000 });
  await companyCard.click();

  // Esperar a que aparezca el botón de simulación
  const simulateBtn = page.locator('button:has-text("Simular esta empresa")').first();
  await expect(simulateBtn).toBeVisible({ timeout: 5_000 });
  await simulateBtn.click();

  // 3. La simulación resetea a "home" — esperar que el admin banner desaparezca o que
  //    la vista cambie (el sidebar ahora mostrará "Facturación" en menú de empresa)
  await page.waitForLoadState('networkidle');
  console.log(`✅ Simulando empresa: ${COMPANY_TO_SIMULATE}`);

  // 4. Navegar a Facturación desde el sidebar
  //    (aparece porque effectiveIsAdmin=false y effectiveCompanyRole='administrador')
  const billingLink = page.locator('button:has-text("Facturación")').first();
  await expect(billingLink).toBeVisible({ timeout: 8_000 });
  await billingLink.click();
  await page.waitForLoadState('networkidle');
  console.log('✅ Vista Facturación abierta (modo simulación)');
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Facturación — Mercado Pago (vía simulación admin_isp)', () => {

  test.beforeEach(async ({ page }) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      test.skip(true, 'Credenciales no configuradas en .env.test (TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD)');
    }
  });

  // ── TEST 1: La boleta aparece en el portal ──────────────────────────────────
  test('muestra la boleta pendiente de junio 2026', async ({ page }) => {
    await login(page);
    await simulateAndGoToBilling(page);

    // Debe aparecer el monto $65.000 y el badge "Pendiente de pago"
    await expect(
      page.locator('text=$65.000').or(page.locator('text=65.000'))
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=/pendiente/i').first()).toBeVisible();

    console.log('✅ Boleta de junio 2026 visible con estado pendiente');
  });

  // ── TEST 2: El botón de MP existe ────────────────────────────────────────────
  test('botón "Pagar con Mercado Pago" está visible y tiene color MP', async ({ page }) => {
    await login(page);
    await simulateAndGoToBilling(page);

    const btn = page.locator('button:has-text("Pagar con Mercado Pago"), button:has-text("Mercado Pago")').first();
    await expect(btn).toBeVisible({ timeout: 10_000 });

    // Verificar que tiene el color azul de MP (#009ee3)
    const bgColor = await btn.evaluate(el => getComputedStyle(el).backgroundColor);
    console.log(`Color del botón MP: ${bgColor}`);
    // rgb(0, 158, 227) corresponde a #009ee3
    expect(bgColor).toMatch(/rgb\(0,\s*158,\s*227\)|#009ee3/i);

    console.log('✅ Botón MP visible con color correcto');
  });

  // ── TEST 3: Click en MP llama la edge function y redirige ───────────────────
  test('clic en MP llama billing-mp-create-preference y redirige a mercadopago.com', async ({ page }) => {
    await login(page);
    await simulateAndGoToBilling(page);

    // Interceptar llamada a la edge function
    let efCalled = false;
    let efStatus = 0;
    page.on('response', res => {
      if (res.url().includes('billing-mp-create-preference')) {
        efCalled = true;
        efStatus = res.status();
        console.log(`Edge function billing-mp-create-preference → HTTP ${res.status()}`);
      }
    });

    const btn = page.locator('button:has-text("Pagar con Mercado Pago"), button:has-text("Mercado Pago")').first();
    await expect(btn).toBeVisible({ timeout: 10_000 });

    // Esperar la respuesta de la edge function y el click simultáneamente
    const [response] = await Promise.all([
      page.waitForResponse(
        res => res.url().includes('billing-mp-create-preference'),
        { timeout: 20_000 }
      ),
      btn.click(),
    ]);

    expect(efCalled).toBe(true);
    expect(efStatus).toBe(200);

    // Verificar que se redirigió a mercadopago.com
    await page.waitForURL(/mercadopago\.com/, { timeout: 20_000 });
    expect(page.url()).toContain('mercadopago.com');

    console.log(`✅ Redirigido a: ${page.url()}`);
    console.log('✅ Edge function respondió HTTP 200');
  });

  // ── TEST 4: Retorno exitoso desde MP muestra toast ──────────────────────────
  test('retorno ?billing=success muestra toast de pago procesado', async ({ page }) => {
    await login(page);

    // Simular retorno desde MP con pago exitoso
    // El portal usa /?billing=success al regresar desde MP (back_url configurada)
    await page.goto('/?billing=success');
    await page.waitForLoadState('networkidle');

    const toast = page.locator(
      'text=/pago procesado/i, text=/pago.*exitoso/i, [role="status"]'
    ).first();
    await expect(toast).toBeVisible({ timeout: 8_000 });

    console.log('✅ Toast de pago exitoso visible al retornar con billing=success');
  });

  // ── TEST 5: Retorno con failure muestra toast de error ──────────────────────
  test('retorno ?billing=failure muestra toast de error', async ({ page }) => {
    await login(page);
    await page.goto('/?billing=failure');
    await page.waitForLoadState('networkidle');

    const toast = page.locator(
      'text=/no completado/i, text=/no pudo procesarse/i, [role="status"]'
    ).first();
    await expect(toast).toBeVisible({ timeout: 8_000 });

    console.log('✅ Toast de error visible al retornar con billing=failure');
  });

  // ── TEST 6: Retorno con pending muestra toast de procesando ─────────────────
  test('retorno ?billing=pending muestra toast de pago en proceso', async ({ page }) => {
    await login(page);
    await page.goto('/?billing=pending');
    await page.waitForLoadState('networkidle');

    const toast = page.locator(
      'text=/en proceso/i, text=/procesado/i, [role="status"]'
    ).first();
    await expect(toast).toBeVisible({ timeout: 8_000 });

    console.log('✅ Toast de pendiente visible al retornar con billing=pending');
  });

});
