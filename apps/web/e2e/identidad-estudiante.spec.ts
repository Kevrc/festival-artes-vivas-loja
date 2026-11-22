import { expect, test } from '@playwright/test';
import { idDe, sinViolacionesAxe } from './ayuda';
import { enlaceDeMailpit, hayMailpit } from './ayuda-identidad';
import { API } from './ayuda-operacion';

/**
 * T126 · US12 — un asistente confirma su correo institucional (dominio utpl.edu.ec de la semilla) y
 * reserva el taller «solo estudiantes» en Boletería con su sesión real, con axe. Sin Mailpit (CI)
 * se comprueba la página y el rechazo de un dominio no institucional; el resto lo cubre
 * apps/api/test/identidad/estudiantes.int.test.ts.
 */
test('acreditarse como estudiante y reservar una función solo para estudiantes', async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const marca = `${info.project.name}.${Date.now()}`;
  const correo = `e2e.estudiante.${marca}@fiavl.test`;
  const clave = 'Estudio-teatro-en-Loja';
  expect((await request.post(`${API}/api/identidad/registro`, { data: { nombre: 'Lucía E2E', correo, contrasena: clave, aceptaPolitica: true, versionPolitica: 1 } })).status()).toBe(202);

  await page.goto('/cuenta/ingresar?volver=/mi-cuenta/estudiante');
  await page.getByLabel('Correo electrónico').fill(correo);
  await page.getByLabel('Contraseña').fill(clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/mi-cuenta\/estudiante$/);
  await expect(page.getByRole('heading', { name: 'Condición de estudiante', level: 1 })).toBeVisible();
  await sinViolacionesAxe(page);

  const form = page.getByRole('form', { name: 'Acreditarme como estudiante' });
  await form.getByLabel('Tu correo institucional').fill('lucia@gmail.com');
  await form.getByRole('button', { name: 'Enviar el enlace' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'institución educativa registrada' })).toBeVisible();

  if (!(await hayMailpit(request))) {
    info.annotations.push({ type: 'omitido', description: 'Sin Mailpit: no se abren los enlaces del correo (lo cubre la integración).' });
    return;
  }
  // Reservar exige el correo verificado (FR-015): primero el enlace de verificación de la cuenta.
  const verificacion = await enlaceDeMailpit(request, correo, '/cuenta/verificar');
  await page.goto(`${verificacion.pathname}${verificacion.search}`);
  await expect(page.getByRole('heading', { name: 'Tu correo está verificado' })).toBeVisible();

  const institucional = `lucia.${marca}@utpl.edu.ec`;
  await page.goto('/mi-cuenta/estudiante');
  await form.getByLabel('Tu correo institucional').fill(institucional);
  await form.getByRole('button', { name: 'Enviar el enlace' }).click();
  await expect(page.getByRole('status')).toContainText('correo institucional');
  const enlace = await enlaceDeMailpit(request, institucional, '/mi-cuenta/estudiante');
  await page.goto(`${enlace.pathname}${enlace.search}`);
  await expect(page.getByRole('status')).toContainText('Universidad Técnica Particular de Loja');
  await expect(page).toHaveURL(/\/mi-cuenta\/estudiante$/);

  await page.goto(`/entradas/${idDe('funcion:taller')}`);
  await expect(page.getByText('Solo estudiantes acreditados')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar reserva gratuita' }).click();
  await expect(page).toHaveURL(/\/mis-entradas/);
  await expect(page.locator('.boleto-qr').first()).toBeVisible();
});
