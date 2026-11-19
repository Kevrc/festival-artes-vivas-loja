import { expect, test } from '@playwright/test';

// Hora de la API: 2026-11-14 12:00 (Ecuador). Ventana: hasta las 13:00.
test.describe('US4 · Qué hay cerca y ahora', () => {
  test('US4-AS1: muestra lo que está en curso y no lo de la noche', async ({ page }) => {
    await page.goto('/ahora');
    await expect(page.getByRole('heading', { name: 'Buddy Bears' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'El lugar del otro' })).toHaveCount(0);
  });

  test('US4-AS2: ordena por cercanía sin enviar la ubicación (FR-014)', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -3.99631, longitude: -79.20161 });
    const enviadas: string[] = [];
    page.on('request', (r) => enviadas.push(`${r.url()} ${r.postData() ?? ''}`));
    await page.goto('/ahora');
    await page.getByRole('button', { name: 'Ordenar por cercanía a mi ubicación' }).click();
    await expect(page.getByText(/min a pie/).first()).toBeVisible();
    await expect(page.locator('.conteo')).toContainText('cercanía a tu ubicación');
    expect(enviadas.filter((u) => u.includes('-3.9963') || u.includes('-79.2016'))).toEqual([]);
  });

  test('US4-AS3: sin ubicación se elige un punto de referencia', async ({ page }) => {
    await page.goto('/ahora');
    await page.getByLabel('o desde').selectOption('Parque Central');
    await expect(page.locator('.conteo')).toContainText('cercanía a Parque Central');
  });
});
