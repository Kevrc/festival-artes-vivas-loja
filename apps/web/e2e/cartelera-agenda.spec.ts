import { expect, test } from '@playwright/test';
import { tarjeta } from './ayuda';

const marcar = async (page: import('@playwright/test').Page, titulo: string) =>
  tarjeta(page, titulo).getByRole('button', { name: /agregar a mi agenda/i }).click();

test.describe('US5 · Mi agenda', () => {
  test('US5-AS1: avisa el cruce de dos funciones', async ({ page }) => {
    await page.goto('/cartelera/2026-11-12');
    await marcar(page, 'El Cura sin cabeza');
    await marcar(page, 'Zombi Manifiesto');
    await page.goto('/mi-agenda');
    await expect(page.locator('.agenda-aviso')).toContainText('se cruzan en horario');
  });

  test('US5-AS2: avisa el traslado ajustado entre sedes', async ({ page }) => {
    await page.goto('/cartelera/2026-11-13');
    await marcar(page, 'El Miche en la plaza');
    await marcar(page, 'Bondi Beach');
    await page.goto('/mi-agenda');
    await expect(page.locator('.agenda-aviso')).toContainText('Solo tienes 10 min');
  });

  test('US5-AS3: sin cuenta, los favoritos se guardan en el dispositivo', async ({ page }) => {
    await page.goto('/cartelera/2026-11-15');
    await page.locator('article.tarjeta').filter({ hasText: '17:00' }).filter({ hasText: 'Cometa' }).getByRole('button', { name: /agregar/i }).click();
    await page.reload();
    await page.goto('/mi-agenda');
    await expect(page.getByRole('heading', { name: 'Cometa' })).toBeVisible();
  });

  test('US5-AS4: una favorita cancelada aparece señalada', async ({ page }) => {
    await page.goto('/cartelera/2026-11-21');
    await marcar(page, 'Monás');
    await page.goto('/mi-agenda');
    await expect(tarjeta(page, 'Monás').getByText('Cancelada')).toBeVisible();
  });
});
