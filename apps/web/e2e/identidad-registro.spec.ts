import { type APIRequestContext, expect, test } from '@playwright/test';
import { sinViolacionesAxe } from './ayuda';

/**
 * T069a · US7 — registro y verificación de correo en menos de 2 minutos (SC-006), con axe.
 * El enlace se lee de la API de Mailpit (pnpm db:up). Sin Mailpit (job de CI: la API corre con
 * NODE_ENV=test y el correo va a memoria) ese paso se omite con una anotación; lo cubre
 * apps/api/test/identidad/registro.int.test.ts.
 */
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

async function hayMailpit(request: APIRequestContext): Promise<boolean> {
  try {
    return (await request.get(`${MAILPIT}/api/v1/info`, { timeout: 2_000 })).ok();
  } catch {
    return false;
  }
}

/** Enlace de verificación del último correo enviado a `para`, esperando hasta 30 s. */
async function enlaceDeMailpit(request: APIRequestContext, para: string): Promise<string> {
  let enlace = '';
  await expect(async () => {
    const lista = await (await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${para}"`)}`)).json();
    const id = lista.messages?.[0]?.ID as string | undefined;
    expect(id).toBeTruthy();
    const mensaje = await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
    enlace = (mensaje.Text as string).match(/https?:\/\/\S+\/cuenta\/verificar\?token=[A-Za-z0-9_-]+/)?.[0] ?? '';
    expect(enlace).not.toBe('');
  }).toPass({ timeout: 30_000, intervals: [1_000] });
  return enlace;
}

test.describe('US7 · Registro y verificación de correo', () => {
  test('US7-AS1, AS2, AS4, AS5: errores asociados, registro y verificación por enlace en menos de 2 min', async ({ page, request }, info) => {
    test.setTimeout(120_000);
    const inicio = Date.now();
    const correo = `e2e.${info.project.name}.${Date.now()}@fiavl.test`;

    await page.goto('/cuenta/registro');
    await expect(page.getByRole('heading', { name: 'Crear una cuenta', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /política de privacidad \(versión 1\)/ })).toBeVisible();
    await sinViolacionesAxe(page);

    // US7-AS5 y validación en el cliente: el resumen recibe el foco y enlaza a cada campo.
    const formulario = page.getByRole('form', { name: 'Crear una cuenta' });
    await formulario.getByRole('button', { name: 'Crear la cuenta' }).click();
    const resumen = page.getByRole('alert').filter({ hasText: 'Revisa estos datos' });
    await expect(resumen).toBeFocused();
    await expect(resumen.getByRole('link', { name: /aceptar la política de privacidad/ })).toBeVisible();
    await expect(formulario.getByLabel('Nombre')).toHaveAttribute('aria-invalid', 'true');
    await sinViolacionesAxe(page);

    await formulario.getByLabel('Nombre').fill('Ana E2E');
    await formulario.getByLabel('Correo electrónico').fill(correo);
    await formulario.getByLabel('Acepto la').check();

    // US7-AS4: una contraseña filtrada la rechaza el servidor con el motivo, asociado al campo.
    await formulario.getByLabel('Contraseña', { exact: true }).fill('1234567890');
    await formulario.getByRole('button', { name: 'Crear la cuenta' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'filtraciones' })).toBeVisible();
    await expect(formulario.getByLabel('Contraseña', { exact: true })).toHaveAttribute('aria-invalid', 'true');

    // US7-AS1: con una contraseña válida, la cuenta queda pendiente y llega el enlace.
    await formulario.getByLabel('Contraseña', { exact: true }).fill('Teatro-en-Loja-2026');
    await expect(page.getByText('✓ Cumple: Al menos 10 caracteres')).toBeVisible();
    await formulario.getByRole('button', { name: 'Crear la cuenta' }).click();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(correo);

    if (!(await hayMailpit(request))) {
      info.annotations.push({ type: 'omitido', description: 'Sin Mailpit: no se abre el enlace del correo (lo cubre la integración).' });
      return;
    }

    // US7-AS2: abrir el enlace verifica la cuenta; usarlo otra vez avisa que ya se usó.
    const enlace = await enlaceDeMailpit(request, correo);
    const ruta = new URL(enlace);
    await page.goto(`${ruta.pathname}${ruta.search}`);
    await expect(page.getByRole('heading', { name: 'Tu correo está verificado', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/cuenta\/verificar$/); // el token sale de la barra de direcciones
    await sinViolacionesAxe(page);
    expect(Date.now() - inicio).toBeLessThan(120_000); // SC-006

    await page.goto(`${ruta.pathname}${ruta.search}`);
    await expect(page.getByRole('heading', { name: 'Este enlace ya se usó', level: 1 })).toBeVisible();
  });

  test('caso borde: un enlace inválido ofrece pedir otro', async ({ page }) => {
    await page.goto('/cuenta/verificar?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    await expect(page.getByRole('heading', { name: 'El enlace venció', level: 1 })).toBeVisible();
    await page.getByLabel('Tu correo').fill('nadie@fiavl.test');
    await page.getByRole('button', { name: 'Enviar un enlace nuevo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Si corresponde' })).toBeVisible();
    await sinViolacionesAxe(page);
  });
});
