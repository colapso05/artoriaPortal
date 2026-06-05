import { test, expect } from '@playwright/test';

/**
 * Test E2E — Buscador de conversaciones en la Bandeja
 * Verifica que "si tiene conectado" encuentre el chat de Gema Díaz
 * y que la búsqueda filtre la lista correctamente.
 */

const EMAIL    = 'admin@artoria.cl';
const PASSWORD = 'Demisysofia2y1';

test.describe('Buscador de Bandeja', () => {

  test.beforeEach(async ({ page }) => {
    // Login como admin_isp
    await page.goto('/portal');
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();

    // Esperar dashboard
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Saltar tour si aparece
    const tourBtn = page.getByRole('button', { name: 'Saltar tour' });
    if (await tourBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tourBtn.click();
    }

    // Ir a Empresas y simular Dropp
    await page.getByRole('button', { name: 'Empresas' }).click();
    await page.waitForSelector('table', { timeout: 8000 });

    // Abrir menu de Dropp (botón de tres puntos en la fila)
    const droppRow = page.locator('tr', { hasText: 'Dropp' });
    await droppRow.locator('button[aria-haspopup="menu"]').click();
    await page.getByRole('menuitem', { name: /Simular esta empresa/i }).click();

    // Esperar que se active la simulación
    await expect(page.getByText(/Simulando.*Dropp/i)).toBeVisible({ timeout: 8000 });

    // Ir a Bandeja
    await page.getByRole('button', { name: 'Bandeja' }).click();

    // Esperar que carguen conversaciones
    await page.waitForSelector('input[placeholder="Buscar chats..."]', { timeout: 10000 });
    await page.waitForTimeout(2000); // dejar que se carguen las conversaciones
  });

  test('sin filtro muestra múltiples conversaciones', async ({ page }) => {
    const input = page.locator('input[placeholder="Buscar chats..."]');
    await expect(input).toBeVisible();

    // Sin búsqueda debe haber muchas conversaciones
    const viewport = page.locator('[data-radix-scroll-area-viewport]');
    const buttons = viewport.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(10);
  });

  test('"recomendamos verificar" encuentra conversaciones (baseline)', async ({ page }) => {
    const input = page.locator('input[placeholder="Buscar chats..."]');
    const viewport = page.locator('[data-radix-scroll-area-viewport]');

    const totalAntes = await viewport.locator('button').count();

    await input.fill('recomendamos verificar');
    // Esperar debounce (350ms) + RPC (~1s)
    await page.waitForTimeout(1800);

    const totalDespues = await viewport.locator('button').count();
    console.log(`recomendamos verificar: ${totalAntes} → ${totalDespues} resultados`);

    // Debe filtrar fuertemente la lista
    expect(totalDespues).toBeLessThan(totalAntes * 0.2); // menos del 20% del total
    expect(totalDespues).toBeGreaterThan(0);
  });

  test('"si tiene conectado" encuentra a Gema Díaz', async ({ page }) => {
    const input = page.locator('input[placeholder="Buscar chats..."]');
    const viewport = page.locator('[data-radix-scroll-area-viewport]');

    const totalAntes = await viewport.locator('button').count();

    await input.fill('si tiene conectado');
    // Esperar debounce (350ms) + hasta 2 RPC calls (~2s)
    await page.waitForTimeout(2500);

    const totalDespues = await viewport.locator('button').count();
    console.log(`si tiene conectado: ${totalAntes} → ${totalDespues} resultados`);

    // ✅ Gema Díaz debe aparecer en los resultados
    await expect(
      viewport.locator('button', { hasText: 'Gema Díaz' })
    ).toBeVisible({ timeout: 3000 });

    // ✅ La lista debe estar filtrada (no mostrar todo)
    expect(totalDespues).toBeLessThan(totalAntes * 0.5); // menos del 50% del total
  });

  test('limpiar búsqueda restaura la lista completa', async ({ page }) => {
    const input = page.locator('input[placeholder="Buscar chats..."]');
    const viewport = page.locator('[data-radix-scroll-area-viewport]');

    const totalOriginal = await viewport.locator('button').count();

    // Buscar algo
    await input.fill('gema');
    await page.waitForTimeout(1800);
    const totalBuscando = await viewport.locator('button').count();
    expect(totalBuscando).toBeLessThan(totalOriginal);

    // Limpiar
    await input.clear();
    await page.waitForTimeout(1000);
    const totalRestaurado = await viewport.locator('button').count();

    // Debe volver a mostrar la lista completa (±10% por updates en tiempo real)
    expect(totalRestaurado).toBeGreaterThan(totalOriginal * 0.9);
  });

});
