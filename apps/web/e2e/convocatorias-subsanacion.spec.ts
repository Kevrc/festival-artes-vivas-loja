import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { sinViolacionesAxe } from './ayuda';

const PDF = (nombre: string, extra = '') => ({ name: nombre, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.7\nFIAVL ${extra || nombre}`) });
const API = process.env.API_URL ?? 'http://localhost:4000';

/** Un elenco nuevo (cuenta de desarrollo propia) envía una postulación y devuelve su folio. */
async function enviarPostulacion(page: Page, titulo: string): Promise<{ folio: string; url: string }> {
  await page.goto('/convocatorias');
  await page.getByRole('link', { name: 'Ver bases y postular' }).first().click();
  await page.getByRole('link', { name: 'Iniciar postulación' }).click();
  await page.getByLabel('Nombre del elenco').fill(`Elenco ${titulo}`);
  await page.getByLabel('Persona responsable').fill('Responsable E2E');
  await page.getByLabel('Correo de contacto').fill('subsanacion@example.ec');
  await page.getByLabel('Provincia o país').fill('Loja, Ecuador');
  await page.getByLabel('Integrantes (separados por coma)').fill('Ana, Luis');
  await page.getByLabel('Trayectoria').fill('Trayectoria de prueba del elenco');
  await page.getByLabel('Título de la obra').fill(titulo);
  await page.getByLabel('Disciplina').fill('teatro');
  await page.getByLabel('Duración en minutos').fill('55');
  await page.getByLabel('Público').fill('todo público');
  await page.getByLabel('Número de integrantes en gira').fill('5');
  await page.getByLabel('Sinopsis').fill(`Sinopsis única ${titulo}`);
  await page.getByLabel(/Dossier/).setInputFiles(PDF('dossier.pdf'));
  await page.getByLabel(/Ficha técnica/).setInputFiles(PDF('ficha-tecnica.pdf'));
  await page.getByRole('button', { name: 'Guardar y enviar' }).click();
  const acuse = page.getByRole('heading', { name: /^Postulación PN-/ });
  await expect(acuse).toBeVisible();
  return { folio: (await acuse.textContent())!.replace('Postulación ', ''), url: page.url() };
}

/** La coordinación opera en un contexto aparte: otra sesión de desarrollo, otro localStorage. */
async function abrirPanel(browser: Browser) {
  const contexto = await browser.newContext({ baseURL: process.env.WEB_URL ?? 'http://localhost:3100', locale: 'es-EC', timezoneId: 'America/Guayaquil' });
  const panel = await contexto.newPage();
  await panel.goto('/admisibilidad');
  await expect(panel.getByRole('heading', { name: 'Admisibilidad de postulaciones' })).toBeVisible();
  return { panel, cerrar: () => contexto.close() };
}

/**
 * El aviso a Identidad se publica en el outbox (pg-boss). Solo se comprueba cuando la API corre con la cola
 * activa (NODE_ENV distinto de "test") y se habilita E2E_VERIFICAR_OUTBOX=1 con DATABASE_URL.
 */
async function eventosSubsanacion(postulacionId: string): Promise<number | null> {
  if (process.env.E2E_VERIFICAR_OUTBOX !== '1' || !process.env.DATABASE_URL) return null;
  const { PrismaClient } = await import('../../api/src/generated/prisma/index.js');
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  try {
    const filas = await db.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'identidad.subsanacion-solicitada' AND data->'datos'->>'postulacionId' = $1`,
      postulacionId,
    );
    return filas[0]!.n;
  } finally { await db.$disconnect(); }
}

test.describe('US2 · admisibilidad y subsanación', () => {
  test('US2-AS1/AS2: coordinación pide corrección, el elenco reemplaza el documento, reenvía y es admitida', async ({ page, browser }) => {
    const titulo = `Subsanar ${randomUUID().slice(0, 8)}`;
    const { folio, url } = await enviarPostulacion(page, titulo);
    const postulacionId = url.split('/').pop()!;
    await expect(page.getByText('Estado: enviada')).toBeVisible();

    const { panel, cerrar } = await abrirPanel(browser);
    await expect(panel).toHaveTitle(/FIAVL/);
    await sinViolacionesAxe(panel);
    const tarjeta = panel.getByRole('article', { name: new RegExp(folio) });
    await expect(tarjeta).toBeVisible();

    // Motivo obligatorio: sin detalle no se envía la solicitud.
    await tarjeta.getByRole('button', { name: `Pedir subsanación de ${folio}` }).click();
    await expect(tarjeta.getByRole('alert')).toContainText('Describe qué debe corregir');
    await tarjeta.getByLabel('Detalle de la corrección o motivo').fill('El dossier está ilegible; adjunta una versión nítida.');
    await tarjeta.getByRole('button', { name: `Pedir subsanación de ${folio}` }).click();
    await expect(panel.getByRole('status').filter({ hasText: `Postulación ${folio}` })).toContainText('requiere subsanacion');

    const avisos = await eventosSubsanacion(postulacionId);
    if (avisos === null) test.info().annotations.push({ type: 'outbox', description: 'Omitida: define E2E_VERIFICAR_OUTBOX=1, DATABASE_URL y una API con la cola activa' });
    else expect(avisos).toBe(1);

    // El elenco ve el detalle, el reloj límite y reemplaza el documento.
    await page.reload();
    await expect(page.getByText('Estado: requiere subsanacion')).toBeVisible();
    const correccion = page.getByRole('region', { name: 'Corrección solicitada' });
    await expect(correccion).toContainText('El dossier está ilegible');
    await expect(correccion.getByText(/Fecha límite:/)).toBeVisible();
    await expect(correccion.getByText(/^Tiempo restante:/)).toContainText(/\d+ h \d{2} min/);
    await expect(page).toHaveTitle(/FIAVL/);
    await sinViolacionesAxe(page);

    await correccion.getByLabel(/Reemplazar dossier/).setInputFiles(PDF('dossier-corregido.pdf', 'versión nítida'));
    await expect(page.getByRole('status').filter({ hasText: 'Documento reemplazado' })).toContainText('dossier-corregido.pdf');
    await expect(page.getByRole('button', { name: 'Descargar dossier-corregido.pdf' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Descargar dossier.pdf' })).toHaveCount(0);
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar dossier-corregido.pdf' }).click();
    expect((await descarga).suggestedFilename()).toContain('dossier-corregido.pdf');

    await page.getByRole('button', { name: 'Reenviar corrección' }).click();
    await expect(page.getByText('Estado: enviada')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Corrección reenviada' })).toBeVisible();

    // Coordinación revisa de nuevo y admite.
    await panel.reload();
    const revisada = panel.getByRole('article', { name: new RegExp(folio) });
    await expect(revisada.getByRole('button', { name: 'Descargar dossier-corregido.pdf' + ` (${folio})` })).toBeVisible();
    await revisada.getByRole('button', { name: `Admitir ${folio}`, exact: true }).click();
    await expect(panel.getByRole('status').filter({ hasText: `Postulación ${folio}` })).toContainText('admitida');
    await page.reload();
    await expect(page.getByText('Estado: admitida')).toBeVisible();
    await expect(page.getByText('Tu postulación fue admitida')).toBeVisible();
    await expect(page).toHaveTitle(/FIAVL/);
    await sinViolacionesAxe(page);
    await cerrar();
  });

  test('US2-AS3: la no admisión exige motivo y el elenco lo ve sin poder subsanar', async ({ page, browser }) => {
    const { folio } = await enviarPostulacion(page, `No admitida ${randomUUID().slice(0, 8)}`);
    const { panel, cerrar } = await abrirPanel(browser);
    const tarjeta = panel.getByRole('article', { name: new RegExp(folio) });
    await tarjeta.getByRole('button', { name: `No admitir ${folio}` }).click();
    await expect(tarjeta.getByRole('alert')).toContainText('El motivo es obligatorio');
    await tarjeta.getByLabel('Detalle de la corrección o motivo').fill('La obra no corresponde a la convocatoria.');
    await tarjeta.getByRole('button', { name: `No admitir ${folio}` }).click();
    await expect(panel.getByRole('status').filter({ hasText: `Postulación ${folio}` })).toContainText('no admitida');
    await expect(panel).toHaveTitle(/FIAVL/);
    await sinViolacionesAxe(panel);

    await page.reload();
    await expect(page.getByText('Estado: no admitida')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Postulación no admitida' })).toContainText('La obra no corresponde a la convocatoria.');
    await expect(page.getByRole('button', { name: 'Reenviar corrección' })).toHaveCount(0);
    await expect(page).toHaveTitle(/FIAVL/);
    await sinViolacionesAxe(page);
    await cerrar();
  });

  test('T034: un postulante no puede usar las acciones del panel de coordinación', async ({ request }) => {
    const cabeceras = { 'x-cuenta-dev': randomUUID(), 'x-rol-dev': 'postulante' };
    expect((await request.get(`${API}/api/convocatorias/panel/postulaciones`, { headers: cabeceras })).status()).toBe(403);
    const ruta = `${API}/api/convocatorias/panel/postulaciones/${randomUUID()}/admisibilidad`;
    expect((await request.post(ruta, { headers: cabeceras, data: { decision: 'admitir' } })).status()).toBe(403);
  });
});
