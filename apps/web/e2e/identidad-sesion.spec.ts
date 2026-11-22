import { type APIRequestContext, expect, test } from '@playwright/test';
import { sinViolacionesAxe } from './ayuda';
import { enlaceDeMailpit, hayMailpit } from './ayuda-identidad';
import { API } from './ayuda-operacion';

/**
 * T078 · US8 — entrar, cerrar la sesión de otro dispositivo y recuperar la contraseña con el enlace
 * de Mailpit, con axe. Sin Mailpit (CI) la recuperación se omite con una anotación; la cubre
 * apps/api/test/identidad/sesion.int.test.ts.
 */
const CLAVE = 'Teatro-en-Loja-2026';

/** Cuenta nueva creada por la API (una cuenta pendiente de verificación ya puede ingresar). */
async function crearCuenta(request: APIRequestContext, correo: string) {
  const r = await request.post(`${API}/api/identidad/registro`, {
    data: { nombre: 'Ana E2E', correo, contrasena: CLAVE, aceptaPolitica: true, versionPolitica: 1 },
  });
  expect(r.status()).toBe(202);
}

test.describe('US8 · Inicio de sesión y recuperación', () => {
  test('US8-AS1, AS4: ingresar, ver mis sesiones y cerrar la de otro dispositivo', async ({ page, browser, request }, info) => {
    const correo = `e2e.sesion.${info.project.name}.${Date.now()}@fiavl.test`;
    await crearCuenta(request, correo);

    // FR-016: un fallo da un mensaje neutro y enfocado.
    await page.goto('/cuenta/ingresar');
    await sinViolacionesAxe(page);
    const formulario = page.getByRole('form', { name: 'Ingresar' });
    await formulario.getByLabel('Correo electrónico').fill(correo);
    await formulario.getByLabel('Contraseña').fill('clave-equivocada-123');
    await formulario.getByRole('button', { name: 'Ingresar' }).click();
    const alerta = page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos' });
    await expect(alerta).toBeVisible();
    await expect(alerta).toBeFocused();

    await formulario.getByLabel('Contraseña').fill(CLAVE);
    await formulario.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta$/);
    await expect(page.getByRole('heading', { name: 'Mi cuenta', level: 1 })).toBeVisible();
    await expect(page.getByText(correo)).toBeVisible();
    await sinViolacionesAxe(page);

    // Otro dispositivo: un contexto de navegador aparte con su propia cookie.
    const otro = await browser.newContext();
    const otraPagina = await otro.newPage();
    await otraPagina.goto('/cuenta/ingresar');
    await otraPagina.getByLabel('Correo electrónico').fill(correo);
    await otraPagina.getByLabel('Contraseña').fill(CLAVE);
    await otraPagina.getByRole('button', { name: 'Ingresar' }).click();
    await expect(otraPagina).toHaveURL(/\/mi-cuenta$/);

    await page.goto('/mi-cuenta/sesiones');
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(2);
    await expect(page.getByRole('heading', { name: /\(este dispositivo\)/ })).toHaveCount(1);
    await sinViolacionesAxe(page);
    await page.getByRole('button', { name: /^Cerrar esta sesión/ }).click();
    await expect(page.getByRole('status')).toContainText('ya no tiene acceso');
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(1);

    // US8-AS4: el otro dispositivo pierde el acceso de inmediato.
    await otraPagina.goto('/mi-cuenta');
    await expect(otraPagina.getByText('Necesitas ingresar para ver tu cuenta')).toBeVisible();
    await otro.close();

    // Cerrar sesión en este dispositivo.
    await page.goto('/mi-cuenta');
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/cuenta\/ingresar$/);
  });

  test('US8-AS3: recuperar la contraseña con el enlace del correo, una sola vez', async ({ page, request }, info) => {
    test.setTimeout(90_000);
    const correo = `e2e.recuperar.${info.project.name}.${Date.now()}@fiavl.test`;
    await crearCuenta(request, correo);

    await page.goto('/cuenta/recuperar');
    await page.getByLabel('Correo electrónico').fill(correo);
    await page.getByRole('button', { name: 'Enviar el enlace' }).click();
    await expect(page.getByRole('status')).toContainText('1 hora');
    await sinViolacionesAxe(page);

    if (!(await hayMailpit(request))) {
      info.annotations.push({ type: 'omitido', description: 'Sin Mailpit: no se abre el enlace del correo (lo cubre la integración).' });
      return;
    }
    const enlace = await enlaceDeMailpit(request, correo, '/cuenta/recuperar/nueva');
    await page.goto(`${enlace.pathname}${enlace.search}`);
    await expect(page).toHaveURL(/\/cuenta\/recuperar\/nueva$/); // el token sale de la barra de direcciones
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('Nueva-clave-del-festival');
    await page.getByRole('button', { name: 'Guardar la contraseña' }).click();
    await expect(page.getByRole('heading', { name: 'Contraseña cambiada' })).toBeVisible();
    await sinViolacionesAxe(page);

    // El mismo enlace ya no sirve.
    await page.goto(`${enlace.pathname}${enlace.search}`);
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('Otra-clave-del-festival');
    await page.getByRole('button', { name: 'Guardar la contraseña' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'ya se usó' })).toBeVisible();

    await page.goto('/cuenta/ingresar');
    await page.getByLabel('Correo electrónico').fill(correo);
    await page.getByLabel('Contraseña').fill('Nueva-clave-del-festival');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/mi-cuenta$/);
  });
});
