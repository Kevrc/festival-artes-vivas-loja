import { expect, test } from '@playwright/test';
import { sinViolacionesAxe } from './ayuda';
import { ingresarPersonal } from './ayuda-identidad';

/**
 * US6 · el administrador ve las ediciones y las sedes con sus parámetros, con axe. No crea
 * ediciones aquí: la base de E2E es compartida y la edición más reciente la usan otras pantallas
 * (la creación y las reglas las cubre apps/api/test/operacion/ediciones-sedes.int.test.ts).
 */
test('el administrador revisa ediciones y sedes', async ({ page }) => {
  test.setTimeout(120_000);
  await ingresarPersonal(page, 'admin@fiavl.test', '/admin/ediciones');
  await expect(page.getByRole('heading', { name: 'Ediciones del festival', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^2026 · Edición/ })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Crear una edición' })).toBeVisible();
  await sinViolacionesAxe(page);
  await page.getByRole('button', { name: /^Cambiar parámetros/ }).first().click();
  await expect(page.getByRole('form', { name: /^Parámetros de la edición/ })).toBeVisible();

  await page.getByRole('link', { name: 'Sedes' }).click();
  await expect(page.getByRole('heading', { name: 'Sedes', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Teatro Bolívar', level: 2 })).toBeVisible();
  await page.getByLabel('Tipo').selectOption('recorrido');
  await expect(page.getByLabel(/Puntos de paso/)).toBeVisible();
  await expect(page.getByLabel('Aforo (opcional)')).toBeVisible();
  await sinViolacionesAxe(page);
});
