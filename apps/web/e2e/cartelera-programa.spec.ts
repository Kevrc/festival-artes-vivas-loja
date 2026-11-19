import { expect, test } from '@playwright/test';

test.describe('US6 · Programa de mano', () => {
  test('US6-AS1: el programa filtrado contiene solo lo filtrado y la fecha de generación', async ({ page }) => {
    await page.goto('/programa?fecha=2026-11-15&disciplina=danza');
    await expect(page.getByText(/Generado el/)).toBeVisible();
    await expect(page.locator('.lista-funciones h3')).toHaveText(['Cometa', 'Cometa']);
  });

  test('US6-AS2: la ficha ofrece el archivo de calendario', async ({ page, request }) => {
    await page.goto('/cartelera/2026-11-15');
    await page.getByRole('link', { name: 'Cometa' }).first().click();
    const enlace = page.getByRole('link', { name: 'Añadir a mi calendario' }).first();
    const ics = await (await request.get((await enlace.getAttribute('href'))!)).text();
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20261115T220000Z');
  });
});
