import { createHmac } from 'node:crypto';
import { type APIRequestContext, type Page, expect } from '@playwright/test';

/** Ayudas de las E2E de Identidad (spec 004). */
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/** Cuentas de prueba de prisma/seed/identidad.ts (solo desarrollo y CI). */
export const SEMILLA = { contrasena: 'Festival-de-Loja-2026', secretoTotp: 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU' } as const;

export async function hayMailpit(request: APIRequestContext) {
  try {
    return (await request.get(`${MAILPIT}/api/v1/info`, { timeout: 2_000 })).ok();
  } catch {
    return false;
  }
}

/** Enlace con `?token=` del último correo a `para` cuya ruta es `ruta`. */
export async function enlaceDeMailpit(request: APIRequestContext, para: string, ruta: string) {
  let enlace = '';
  await expect(async () => {
    const lista = await (await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${para}"`)}`)).json();
    for (const m of lista.messages ?? []) {
      const texto = (await (await request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text as string;
      enlace = texto.match(new RegExp(`https?://\\S+${ruta}\\?token=[A-Za-z0-9_-]+`))?.[0] ?? '';
      if (enlace) break;
    }
    expect(enlace).not.toBe('');
  }).toPass({ timeout: 30_000, intervals: [1_000] });
  return new URL(enlace);
}

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function desdeBase32(texto: string): Buffer {
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of texto.replace(/\s/g, '').toUpperCase()) {
    valor = (valor << 5) | ALFABETO.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Lo que haría la aplicación de códigos del teléfono (RFC 6238, 30 s, 6 dígitos). */
export function codigoTotp(claveBase32: string, ahora = Date.now()): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(ahora / 30_000)));
  const h = createHmac('sha1', desdeBase32(claveBase32)).update(contador).digest();
  const d = h[h.length - 1]! & 0x0f;
  return String((h.readUInt32BE(d) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/**
 * Escribe el código en `/cuenta/segundo-factor`. Si otro proyecto de Playwright usó ese mismo paso
 * con la misma cuenta (un código no sirve dos veces), espera al siguiente paso y lo intenta otra vez.
 */
export async function escribirCodigo(page: Page, claveBase32: string, destino: RegExp) {
  for (let intento = 0; intento < 3; intento++) {
    await page.getByLabel('Código de 6 dígitos').fill(codigoTotp(claveBase32));
    await page.getByRole('button', { name: 'Verificar el código' }).click();
    const resultado = await Promise.race([
      page.waitForURL(destino, { timeout: 10_000 }).then(() => 'ok' as const),
      page.getByRole('alert').filter({ hasText: 'ya se usó' }).waitFor({ timeout: 10_000 }).then(() => 'usado' as const),
    ]).catch(() => 'nada' as const);
    if (resultado === 'ok') return;
    await page.waitForTimeout(30_500 - (Date.now() % 30_000));
  }
  await expect(page).toHaveURL(destino);
}

/** Ingreso del personal con su TOTP ya configurado (cuentas de la semilla). */
export async function ingresarPersonal(page: Page, correo: string, volver: string) {
  await page.goto(`/cuenta/ingresar?volver=${encodeURIComponent(volver)}`);
  const formulario = page.getByRole('form', { name: 'Ingresar' });
  await formulario.getByLabel('Correo electrónico').fill(correo);
  await formulario.getByLabel('Contraseña').fill(SEMILLA.contrasena);
  await formulario.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/cuenta\/segundo-factor/);
  await expect(page.getByRole('heading', { name: 'Verifica tu segundo factor', level: 1 })).toBeVisible();
  await escribirCodigo(page, SEMILLA.secretoTotp, new RegExp(`${volver.replace(/\//g, '\\/')}$`));
}
