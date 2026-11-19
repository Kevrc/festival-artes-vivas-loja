import { expect, test } from '@playwright/test';
import { idDe, sinViolacionesAxe } from './ayuda';

const RUTAS = ['/cartelera/2026-11-14', '/buscar?q=cometa', '/ahora', '/mi-agenda', '/programa?fecha=2026-11-15', `/obras/${idDe('obra:Cometa')}`, `/sedes/${idDe('sede:nacional')}`];

// FR-013 y SC-005: WCAG 2.1 AA desde 320 px y uso con teclado
test.describe('Accesibilidad de las rutas públicas', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const ruta of RUTAS) {
    test(`sin violaciones y sin scroll horizontal en ${ruta}`, async ({ page }) => {
      await page.goto(ruta);
      // networkidle es frágil con el prefetch de enlaces de Next: basta con que el contenido esté visible
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(/Cargando/)).toHaveCount(0);
      await sinViolacionesAxe(page);
      const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(desborda).toBe(false);
    });
  }

  test('el primer Tab lleva a "Saltar al contenido"', async ({ page }) => {
    await page.goto('/cartelera/2026-11-14');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  });
});
