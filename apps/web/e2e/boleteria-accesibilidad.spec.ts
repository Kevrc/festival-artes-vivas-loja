import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { idDe, sinViolacionesAxe } from './ayuda';
import { activarSesionDev } from './ayuda-boleteria';

const RUTAS_BOLETERIA = [
  `/entradas/${idDe('funcion:lugar')}`,
  '/mis-entradas',
  '/taquilla',
  '/validador',
  `/validador/${idDe('funcion:lugar')}`,
  `/sala/${idDe('funcion:lugar')}`,
];

test.describe('Accesibilidad WCAG 2.1 AA y diseño responsivo 320px en Boletería (T062)', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const ruta of RUTAS_BOLETERIA) {
    test(`sin violaciones axe ni desbordamiento horizontal en ${ruta}`, async ({ page }) => {
      await activarSesionDev(page, {
        cuentaId: randomUUID(),
        rol: 'administrador',
        correo: 'a11y@fiavl.ec',
      });
      await page.goto(ruta);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(/Cargando/)).toHaveCount(0);
      await sinViolacionesAxe(page);

      const desbordan = await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .filter(
            (e) =>
              e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 &&
              !e.closest('.saltar'),
          )
          .slice(0, 5)
          .map((e) => `${e.tagName.toLowerCase()}.${e.className} ${Math.round(e.getBoundingClientRect().right)}px`),
      );
      expect(desbordan).toEqual([]);
    });
  }

  test('el primer Tab en /taquilla y /validador enfoca "Saltar al contenido"', async ({ page }) => {
    for (const ruta of ['/taquilla', '/validador']) {
      await page.goto(ruta);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
    }
  });
});
