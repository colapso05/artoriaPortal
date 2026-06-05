import { test, expect } from '@playwright/test';

/**
 * Smoke tests — verifican que el portal carga correctamente.
 * No requieren autenticación, solo que la app responda.
 */

test.describe('Portal Artoria — Smoke', () => {

  test('página principal carga', async ({ page }) => {
    await page.goto('/');
    // El body debe ser visible
    await expect(page.locator('body')).toBeVisible();
    // La página no debe mostrar error 404 o pantalla en blanco
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('ruta /portal responde sin error 500', async ({ page }) => {
    const response = await page.goto('/portal');
    // Acepta 200 (carga directo) o cualquier redirect — solo no debe ser error de servidor
    expect(response?.status()).not.toBe(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('no hay errores de JS críticos en consola al cargar', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', (err) => {
      errors.push(err.message);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filtra errores conocidos no críticos (e.g. extensiones del navegador)
    const criticalErrors = errors.filter(
      (e) => !e.includes('extension') && !e.includes('favicon')
    );

    expect(criticalErrors).toHaveLength(0);
  });

});
