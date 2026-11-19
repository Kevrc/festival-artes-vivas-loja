import { expect, test } from '@playwright/test';
import { tarjeta } from './ayuda';

// RNF-003: si la disponibilidad no responde, la cartelera sigue y lo dice
test('sin disponibilidad, la cartelera sigue y muestra "Consultar disponibilidad"', async ({ page }) => {
  await page.route('**/api/cartelera/disponibilidad**', (r) => r.abort());
  await page.goto('/cartelera/2026-11-14');
  await expect(page.locator('.lista-funciones li').first()).toBeVisible();
  await expect(tarjeta(page, 'El lugar del otro').getByTestId('nivel')).toHaveText('Consultar disponibilidad');
});
