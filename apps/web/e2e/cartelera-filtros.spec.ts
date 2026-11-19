import { expect, test } from '@playwright/test';

test.describe('US2 · Filtrar y buscar', () => {
  test('US2-AS1: Gratuitas libres + Circo deja solo circo de acceso libre', async ({ page }) => {
    await page.goto('/cartelera/2026-11-14');
    await page.getByText('Filtros').click();
    await page.getByLabel('Circo').check();
    await page.getByLabel('Entrada libre').check();
    await expect(page.locator('.lista-funciones h3')).toHaveText(['Classics Clowns', 'Cuidado!! Un Payaso Malo Puede Arruinar tu Vida']);
    await expect(page.locator('.conteo')).toContainText('2 funciones');
  });

  test('US2-AS2: "ZOMBÍ" encuentra Zombi Manifiesto', async ({ page }) => {
    await page.goto('/cartelera/2026-11-14');
    await page.getByRole('searchbox', { name: 'Buscar obra o elenco' }).fill('ZOMBÍ');
    await page.getByRole('button', { name: 'Buscar' }).first().click();
    await expect(page.getByRole('heading', { name: 'Zombi Manifiesto' }).first()).toBeVisible();
  });

  test('US2-AS3: sin resultados ofrece quitar el último filtro o limpiar', async ({ page }) => {
    await page.goto('/cartelera/2026-11-14?disciplina=danza');
    await expect(page.getByText('No hay funciones que cumplan todos los filtros.')).toBeVisible();
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(page).toHaveURL(/\/cartelera\/2026-11-14$/);
    await expect(page.locator('.lista-funciones li').first()).toBeVisible();
  });

  test('US2-AS4: el enlace con filtros se comparte y muestra lo mismo', async ({ page, context }) => {
    await page.goto('/cartelera/2026-11-14');
    await page.getByText('Filtros').click();
    await page.getByLabel('Teatro', { exact: true }).check();
    const url = page.url();
    expect(url).toContain('disciplina=teatro');
    const otra = await context.newPage();
    await otra.goto(url);
    await expect(otra.locator('.lista-funciones h3')).toHaveText(['El lugar del otro']);
  });

  test('US2-AS5: el filtro de país solo lista países con funciones', async ({ page }) => {
    await page.goto('/cartelera/2026-11-14');
    await page.getByText('Filtros').click();
    const pais = page.getByRole('group', { name: 'País' });
    await expect(pais.getByLabel('Perú')).toBeVisible();
    await expect(pais.getByLabel('Brasil')).toHaveCount(0);
  });
});
