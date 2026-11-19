import { expect, test } from '@playwright/test';
import { sinViolacionesAxe, tarjeta } from './ayuda';

// La API corre con FIAVL_AHORA=2026-11-14T12:00:00-05:00 y la semilla 2026 (quickstart.md)
test.describe('US1 · Consultar la programación del día', () => {
  test('US1-AS1: funciones del día ordenadas por hora con sus datos', async ({ page }) => {
    await page.goto('/cartelera/2026-11-14');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('14 de noviembre');
    const titulos = await page.locator('.lista-funciones h3').allTextContents();
    expect(titulos.indexOf('Classics Clowns')).toBeLessThan(titulos.indexOf('El lugar del otro'));
    const lugar = tarjeta(page, 'El lugar del otro');
    await expect(lugar).toContainText('La Congregación Teatro (Colombia)');
    await expect(lugar).toContainText('Teatro Nacional Benjamín Carrión Mora');
    await expect(lugar).toContainText('+14 años');
    await expect(lugar).toContainText('Con entrada');
  });

  test('US1-AS2 / AS6: sin cuenta, /cartelera abre el día de hoy', async ({ page }) => {
    await page.goto('/cartelera');
    await expect(page).toHaveURL(/\/cartelera\/2026-11-14$/);
    await expect(page.getByText(/iniciar sesión/i)).toHaveCount(0);
  });

  test('US1-AS3: una función cancelada lo dice y no ofrece entrada', async ({ page }) => {
    await page.goto('/cartelera/2026-11-21');
    const monas = tarjeta(page, 'Monás');
    await expect(monas.getByText('Cancelada')).toBeVisible();
    await expect(monas.getByRole('link', { name: /obtener entrada/i })).toHaveCount(0);
  });

  test('US1-AS4: una función reprogramada muestra el horario anterior', async ({ page }) => {
    await page.goto('/cartelera/2026-11-17');
    const f = tarjeta(page, 'El hazmerreír');
    await expect(f.getByText('Reprogramada')).toBeVisible();
    await expect(f).toContainText('21:00');
    await expect(f).toContainText('Antes:');
    await expect(f).toContainText('19:00');
  });

  test('US1-AS5: una función sin lugares se muestra agotada', async ({ page }) => {
    await page.goto('/cartelera/2026-11-19');
    const f = tarjeta(page, 'La Artista');
    await expect(f.getByTestId('nivel')).toHaveText('Agotado');
    await expect(f.getByRole('link', { name: /obtener entrada/i })).toHaveCount(0);
  });

  test('accesibilidad de la página del día', async ({ page }) => {
    await page.goto('/cartelera/2026-11-14');
    await sinViolacionesAxe(page);
  });
});
