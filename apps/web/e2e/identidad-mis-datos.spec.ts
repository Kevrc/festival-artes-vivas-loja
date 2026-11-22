import { expect, test } from '@playwright/test';
import { sinViolacionesAxe } from './ayuda';
import { API } from './ayuda-operacion';

/** US11 · descargar mis datos y eliminar la cuenta con la confirmación explicada, con axe. */
test('el titular descarga sus datos y elimina su cuenta', async ({ page, request }, info) => {
  const correo = `e2e.lopdp.${info.project.name}.${Date.now()}@fiavl.test`;
  const clave = 'Mis-datos-del-festival';
  expect((await request.post(`${API}/api/identidad/registro`, { data: { nombre: 'Marta E2E', correo, contrasena: clave, aceptaPolitica: true, versionPolitica: 1 } })).status()).toBe(202);

  await page.goto('/cuenta/ingresar');
  await page.getByLabel('Correo electrónico').fill(correo);
  await page.getByLabel('Contraseña').fill(clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/mi-cuenta$/);

  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar mis datos' }).click();
  expect((await descarga).suggestedFilename()).toBe('mis-datos-fiavl.json');

  await page.getByRole('button', { name: 'Quiero eliminar mi cuenta' }).click();
  const form = page.getByRole('form', { name: 'Eliminar mi cuenta' });
  await expect(form).toContainText('Ya no podrás ingresar');
  await sinViolacionesAxe(page);
  await form.getByLabel('Tu contraseña, para confirmar').fill(clave);
  await form.getByRole('button', { name: 'Eliminar mi cuenta definitivamente' }).click();
  await expect(page).toHaveURL(/\/cartelera/);

  await page.goto('/cuenta/ingresar');
  await page.getByLabel('Correo electrónico').fill(correo);
  await page.getByLabel('Contraseña').fill(clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos' })).toBeVisible();
});
