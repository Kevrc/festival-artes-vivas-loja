import { expect, test } from '@playwright/test';
import { sinViolacionesAxe } from './ayuda';
import { SEMILLA, ingresarPersonal } from './ayuda-identidad';

/**
 * T091 · las pantallas de Boletería (spec 002) usan la sesión real de Identidad: quien ingresa con
 * su cuenta ve su sesión en lugar del puente de demostración. Cuentas de la semilla (T086).
 */
test.describe('Integración · sesión real en Boletería', () => {
  test('la taquilla del Bolívar entra con contraseña y segundo factor y opera con su sesión', async ({ page }) => {
    test.setTimeout(120_000);
    await ingresarPersonal(page, 'taquilla.bolivar@fiavl.test', '/taquilla');
    const sesion = page.getByRole('complementary', { name: 'Tu sesión' });
    await expect(sesion).toContainText('Taquilla Bolívar');
    await expect(page.getByRole('button', { name: /^Entrar como/ })).toHaveCount(0);
    await sinViolacionesAxe(page);
  });

  test('el público entra a Mis entradas con su cuenta y puede cerrar la sesión', async ({ page }) => {
    await page.goto('/cuenta/ingresar?volver=/mis-entradas');
    const formulario = page.getByRole('form', { name: 'Ingresar' });
    await formulario.getByLabel('Correo electrónico').fill('asistente@fiavl.test');
    await formulario.getByLabel('Contraseña').fill(SEMILLA.contrasena);
    await formulario.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/mis-entradas$/);
    const sesion = page.getByRole('complementary', { name: 'Tu sesión' });
    await expect(sesion).toContainText('Asistente de prueba');
    await sinViolacionesAxe(page);
    await sesion.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('link', { name: 'Ingresar con tu cuenta' })).toBeVisible();
  });
});
