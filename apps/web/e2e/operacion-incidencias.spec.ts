import { expect, test } from '@playwright/test';
import { sinViolacionesAxe } from './ayuda';
import { ingresarPersonal } from './ayuda-identidad';

/** US4 · el jefe de sala del Bolívar registra y atiende una incidencia desde el teléfono, con axe. */
test('el jefe de sala registra y atiende una incidencia en su sede', async ({ page }, info) => {
  test.setTimeout(120_000);
  await ingresarPersonal(page, 'sala.bolivar@fiavl.test', '/sala/incidencias');
  await expect(page.getByRole('heading', { name: 'Incidencias y conteos de sala', level: 1 })).toBeVisible();
  await page.getByLabel('Sede').selectOption({ label: 'Teatro Bolívar' });
  const descripcion = `Retraso de 20 min (${info.project.name} ${Date.now()})`;
  const form = page.getByRole('form', { name: 'Registrar una incidencia' });
  await form.getByLabel('Tipo').selectOption('retraso');
  await form.getByLabel('Qué pasó').fill(descripcion);
  await form.getByRole('button', { name: 'Registrar la incidencia' }).click();
  await expect(page.getByRole('status')).toContainText('Incidencia registrada');
  const ficha = page.locator('li').filter({ hasText: descripcion });
  await expect(ficha).toContainText('Abierta');
  await sinViolacionesAxe(page);
  await ficha.getByRole('button', { name: /^Marcar como atendida/ }).click();
  await expect(ficha).toContainText('Atendida');

  // RN-009: en otra sede la API lo rechaza.
  await page.getByLabel('Sede').selectOption({ label: 'Teatro Nacional Benjamín Carrión Mora' });
  await form.getByLabel('Qué pasó').fill('Fuera de mi sede');
  await form.getByRole('button', { name: 'Registrar la incidencia' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'alcance' })).toBeVisible();
});
