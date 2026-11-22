import { expect, test } from '@playwright/test';
import { sinViolacionesAxe } from './ayuda';
import { enlaceDeMailpit, escribirCodigo, hayMailpit, ingresarPersonal } from './ayuda-identidad';
import { API } from './ayuda-operacion';

/**
 * T087 · US9 — el administrador crea un validador del Teatro Bolívar; en su primer ingreso debe
 * configurar el segundo factor; fuera de su rol recibe 403. Con axe. Sin Mailpit (CI) el validador
 * nuevo no puede elegir contraseña: esa parte se omite con una anotación (la cubre
 * apps/api/test/identidad/personal.int.test.ts) y el 403 se comprueba con el validador de la semilla.
 */
const CLAVE = 'Validar-en-el-Bolivar-26';

test.describe('US9 · Cuentas del personal', () => {
  test('crear un validador, primer ingreso con TOTP y 403 fuera de su rol', async ({ page, browser, request }, info) => {
    test.setTimeout(150_000);
    const correo = `e2e.validador.${info.project.name}.${Date.now()}@fiavl.test`;
    const nombre = `Validador E2E ${info.project.name} ${Date.now() % 100_000}`;

    // El administrador entra con contraseña y segundo factor.
    await ingresarPersonal(page, 'admin@fiavl.test', '/admin/personal');
    await expect(page.getByRole('heading', { name: 'Personal del festival', level: 1 })).toBeVisible();
    await sinViolacionesAxe(page);

    const crear = page.getByRole('form', { name: 'Crear una cuenta del personal' });
    await crear.getByLabel('Nombre').fill(nombre);
    await crear.getByLabel('Correo').fill(correo);
    await crear.getByLabel('Rol').selectOption({ label: 'Validación de entradas' });
    // Caso borde: sin sede no se guarda (el campo es obligatorio para este rol).
    await expect(crear.getByLabel('Sede')).toBeVisible();
    await crear.getByLabel('Sede').selectOption({ label: 'Teatro Bolívar' });
    await crear.getByRole('button', { name: 'Crear la cuenta' }).click();
    await expect(page.getByRole('status')).toContainText(`Cuenta de ${nombre} creada`);
    const ficha = page.locator('article').filter({ has: page.getByRole('heading', { name: nombre, level: 3 }) });
    await expect(ficha).toContainText('Validación de entradas · Teatro Bolívar');
    await expect(ficha).toContainText('Pendiente');
    await sinViolacionesAxe(page);

    const validador = await browser.newContext();
    const pagina = await validador.newPage();
    if (await hayMailpit(request)) {
      // El titular elige su contraseña con el enlace del correo e ingresa por primera vez.
      const enlace = await enlaceDeMailpit(request, correo, '/cuenta/recuperar/nueva');
      await pagina.goto(`${enlace.pathname}${enlace.search}`);
      await pagina.getByLabel('Contraseña nueva', { exact: true }).fill(CLAVE);
      await pagina.getByRole('button', { name: 'Guardar la contraseña' }).click();
      await expect(pagina.getByRole('heading', { name: 'Contraseña cambiada' })).toBeVisible();

      await pagina.goto('/cuenta/ingresar');
      await pagina.getByLabel('Correo electrónico').fill(correo);
      await pagina.getByLabel('Contraseña').fill(CLAVE);
      await pagina.getByRole('button', { name: 'Ingresar' }).click();
      // US9-AS3: antes de continuar debe configurar el segundo factor.
      await expect(pagina).toHaveURL(/\/cuenta\/segundo-factor/);
      await expect(pagina.getByRole('heading', { name: 'Configura tu segundo factor', level: 1 })).toBeVisible();
      await expect(pagina.getByRole('img', { name: /Código QR/ })).toBeVisible();
      const clave = (await pagina.locator('code').textContent()) ?? '';
      expect(clave).toMatch(/^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/);
      await sinViolacionesAxe(pagina);
      // Mientras tanto, nada más funciona.
      const restringida = await pagina.request.get(`${API}/api/identidad/yo/sesiones`);
      expect(restringida.status()).toBe(403);
      // Una cuenta creada por el administrador acepta la política de privacidad en su primer ingreso (US11-AS4).
      await escribirCodigo(pagina, clave, /\/cuenta\/politica/);
      await expect(pagina.getByRole('heading', { name: 'Actualizamos la política de privacidad', level: 1 })).toBeVisible();
      await sinViolacionesAxe(pagina);
      await pagina.getByLabel(/Leí y acepto la política de privacidad/).check();
      await pagina.getByRole('button', { name: 'Aceptar y continuar' }).click();
      await expect(pagina).toHaveURL(/\/mi-cuenta$/);
      await expect(pagina.getByRole('heading', { name: 'Mi cuenta', level: 1 })).toBeVisible();
    } else {
      info.annotations.push({ type: 'omitido', description: 'Sin Mailpit: el validador nuevo no elige contraseña; se usa el de la semilla (lo cubre la integración).' });
      await ingresarPersonal(pagina, 'validador.bolivar@fiavl.test', '/mi-cuenta');
    }

    // US9-AS2 / SC-007: un validador no programa funciones ni administra el personal.
    expect((await pagina.request.get(`${API}/api/operacion/ediciones`)).status()).toBe(403);
    expect((await pagina.request.get(`${API}/api/identidad/personal`)).status()).toBe(403);
    await pagina.goto('/admin/personal');
    await expect(pagina.getByText('Tu cuenta no tiene el rol de administración.')).toBeVisible();
    await validador.close();
  });
});
