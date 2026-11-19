import { expect, test } from '@playwright/test';
import { idDe, sinViolacionesAxe } from './ayuda';

test.describe('US3 · Fichas de obra, elenco y sede', () => {
  test('US3-AS1: Cometa lista sus dos funciones con enlace a la sede', async ({ page }) => {
    await page.goto(`/obras/${idDe('obra:Cometa')}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cometa');
    const funciones = page.locator('.lista-funciones article');
    await expect(funciones).toHaveCount(2);
    await expect(funciones.nth(0)).toContainText('17:00');
    await expect(funciones.nth(1)).toContainText('19:30');
    await funciones.nth(0).getByRole('link', { name: 'Centro Cultural Alfredo Mora Reyes' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Centro Cultural Alfredo Mora Reyes');
  });

  test('US3-AS2: la sede declara su accesibilidad o "sin información"', async ({ page }) => {
    await page.goto(`/sedes/${idDe('sede:moraReyes')}`);
    await expect(page.getByText('Espacio para silla de ruedas')).toBeVisible();
    await page.goto(`/sedes/${idDe('sede:cueva')}`);
    await expect(page.getByText('Sin información de accesibilidad')).toBeVisible();
  });

  test('US3-AS3: una obra para mayores de 16 lo destaca', async ({ page }) => {
    await page.goto(`/obras/${idDe('obra:Zombi Manifiesto')}`);
    await expect(page.locator('.destacado')).toHaveText('No apta para menores de 16 años');
    await sinViolacionesAxe(page);
  });

  test('la ficha de elenco enlaza sus obras', async ({ page }) => {
    await page.goto(`/elencos/${idDe('elenco:Los Nadies Circo')}`);
    await expect(page.getByRole('link', { name: 'La Artista' })).toBeVisible();
  });
});
