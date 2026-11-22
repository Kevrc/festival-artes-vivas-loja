import { expect, test } from '@playwright/test';
import { sinViolacionesAxe } from './ayuda';
import { SEMILLA } from './ayuda-identidad';

/** US10-AS5 · «Mis notificaciones» con la cuenta de prueba de la semilla, con axe. */
test('el asistente ve su historial de avisos', async ({ page }) => {
  await page.goto('/cuenta/ingresar?volver=/mi-cuenta/notificaciones');
  const formulario = page.getByRole('form', { name: 'Ingresar' });
  await formulario.getByLabel('Correo electrónico').fill('asistente@fiavl.test');
  await formulario.getByLabel('Contraseña').fill(SEMILLA.contrasena);
  await formulario.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/mi-cuenta\/notificaciones$/);
  await expect(page.getByRole('heading', { name: 'Mis notificaciones', level: 1 })).toBeVisible();
  await expect(page.getByText(/Aún no tienes avisos|Enviado|En camino/).first()).toBeVisible();
  await sinViolacionesAxe(page);
});
