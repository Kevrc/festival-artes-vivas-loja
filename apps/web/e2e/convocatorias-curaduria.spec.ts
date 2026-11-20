import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { sinViolacionesAxe } from './ayuda';

const API = process.env.API_URL ?? 'http://localhost:4000';
const WEB = process.env.WEB_URL ?? 'http://localhost:3100';
/** Cuentas de los curadores sembrados (prisma/seed/convocatorias.ts). */
const CURADOR_1 = '77777777-7777-4777-8777-777777777771';
const CURADOR_2 = '77777777-7777-4777-8777-777777777772';
const CURADOR_CONFLICTO = '77777777-7777-4777-8777-777777777773';
const COORDINACION = '88888888-0000-4000-8000-000000000001';

const cabeceras = (cuenta: string, rol: string) => ({ 'x-cuenta-dev': cuenta, 'x-rol-dev': encodeURIComponent(rol) });
const coordinacion = cabeceras(COORDINACION, 'coordinación de convocatorias');

/** Cada proyecto (móvil/escritorio) usa su propia postulación sembrada para no pisarse en paralelo. */
const numeroDelProyecto = () => (test.info().project.name === 'movil' ? 'EV-2026-0001' : 'EV-2026-0002');

async function sesion(browser: Browser, cuentaCurador?: string): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: WEB, locale: 'es-EC', timezoneId: 'America/Guayaquil' });
  if (cuentaCurador) await contexto.addInitScript((c) => localStorage.setItem('fiavl-curador-cuenta', c), cuentaCurador);
  else await contexto.addInitScript((c) => localStorage.setItem('fiavl-coordinacion-cuenta', c), COORDINACION);
  return contexto.newPage();
}

interface Resumen { numero: string; evaluaciones: Array<{ evaluacionId: string | null; estado: string }> }
/** Deja la postulación sembrada lista para repetir la historia: reabre cualquier evaluación enviada por una corrida previa. */
async function prepararPostulacion(request: APIRequestContext, numero: string) {
  const lista = await (await request.get(`${API}/api/convocatorias/panel/evaluaciones`, { headers: coordinacion })).json() as Resumen[];
  const resumen = lista.find((p) => p.numero === numero);
  expect(resumen, `la postulación sembrada ${numero} debe existir (pnpm db:seed)`).toBeDefined();
  for (const e of resumen!.evaluaciones.filter((x) => x.estado === 'enviada')) {
    const respuesta = await request.post(`${API}/api/convocatorias/panel/evaluaciones/${e.evaluacionId}/reabrir`, {
      headers: coordinacion, data: { motivo: 'Preparar prueba E2E' },
    });
    expect(respuesta.ok()).toBe(true);
  }
}

async function abrirEvaluacion(page: Page, numero: string) {
  await page.goto('/curaduria');
  await expect(page).toHaveTitle(/Curaduría: mis asignaciones/);
  await expect(page.getByRole('heading', { name: 'Mis asignaciones' })).toBeVisible();
  await page.getByRole('link', { name: `Evaluar ${numero}` }).click();
  await expect(page).toHaveTitle(/Curaduría: evaluar postulación/);
  await expect(page.getByRole('heading', { name: new RegExp(numero) })).toBeVisible();
}

async function calificar(page: Page, a: string, b: string, c: string) {
  await page.getByLabel(/Propuesta artística/).fill(a);
  await page.getByLabel(/Calidad técnica/).fill(b);
  await page.getByLabel(/Vinculación/).fill(c);
}

async function enviar(page: Page) {
  await page.getByRole('button', { name: 'Enviar evaluación' }).click();
  await expect(page.getByRole('alertdialog', { name: '¿Enviar la evaluación?' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar envío' }).click();
}

test.describe('US3 · evaluación ponderada y curaduría', () => {
  test.describe.configure({ mode: 'serial' });

  test('US3-AS1/AS2/AS4/AS5/AS6: calificar, ocultar puntajes ajenos, deliberar y reabrir', async ({ browser, request }) => {
    const numero = numeroDelProyecto();
    await prepararPostulacion(request, numero);

    // AS1 — el curador 1 califica 80/70/90 y obtiene 79,00. Antes valida el formulario.
    const uno = await sesion(browser, CURADOR_1);
    await abrirEvaluacion(uno, numero);
    await sinViolacionesAxe(uno);
    await calificar(uno, '', '', ''); // corridas previas pueden dejar un borrador precargado
    await uno.getByRole('button', { name: 'Enviar evaluación' }).click();
    await expect(uno.getByRole('alert').filter({ hasText: 'Revisa la evaluación' })).toContainText('ingresa una calificación');
    await calificar(uno, '101', '70', '90');
    await uno.getByRole('button', { name: 'Enviar evaluación' }).click();
    await expect(uno.getByRole('alert').filter({ hasText: 'Revisa la evaluación' })).toContainText('entero entre 0 y 100');
    await calificar(uno, '80', '70', '90');
    await uno.getByLabel('Observaciones').fill('Propuesta sólida y bien documentada.');
    await uno.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(uno.getByRole('status').filter({ hasText: 'Borrador guardado' })).toBeVisible();
    await uno.getByRole('button', { name: 'Enviar evaluación' }).click();
    await expect(uno.getByRole('alertdialog')).toBeVisible();
    await sinViolacionesAxe(uno);
    await uno.getByRole('button', { name: 'Confirmar envío' }).click();
    const cerrada = uno.getByRole('region', { name: 'Evaluación enviada' });
    await expect(cerrada).toContainText('Mi puntaje: 79,00');
    await expect(cerrada).toContainText('Aún no hay otras evaluaciones enviadas');
    await expect(uno.getByLabel(/Propuesta artística/)).toBeDisabled(); // inmutable para el curador
    await expect(uno.getByRole('button', { name: 'Guardar borrador' })).toHaveCount(0);
    await sinViolacionesAxe(uno);

    // AS4 — el curador 2 no ve el 79,00 antes de enviar (ni en la API).
    const dos = await sesion(browser, CURADOR_2);
    await abrirEvaluacion(dos, numero);
    await expect(dos.getByText('79,00')).toHaveCount(0);
    const asignacionDos = dos.url().split('/').pop()!;
    const propia = await request.get(`${API}/api/convocatorias/curaduria/asignaciones/${asignacionDos}/evaluacion`, { headers: cabeceras(CURADOR_2, 'curador') });
    expect(JSON.stringify(await propia.json())).not.toContain('79.00');

    // AS2 — 85,00 y promedio 82,00. Después de enviar sí ve la otra evaluación, de forma anónima.
    await calificar(dos, '85', '85', '85');
    await enviar(dos);
    await expect(dos.getByRole('region', { name: 'Evaluación enviada' })).toContainText('Mi puntaje: 85,00');
    await expect(dos.getByRole('region', { name: 'Evaluación enviada' })).toContainText('Otras evaluaciones enviadas: 79,00');
    await expect(dos.getByRole('region', { name: 'Evaluación enviada' })).toContainText('Puntaje final de la postulación: 82,00');
    await expect(dos.getByText('Postulación: evaluada')).toBeVisible();

    // Coordinación consulta el agregado.
    const panel = await sesion(browser);
    await panel.goto('/evaluaciones');
    await expect(panel).toHaveTitle(/Evaluaciones de postulaciones/);
    const tarjeta = panel.getByRole('article', { name: new RegExp(numero) });
    await expect(tarjeta).toContainText('Puntaje final: 82,00');
    await expect(tarjeta).toContainText('Estado: evaluada');
    await sinViolacionesAxe(panel);

    // AS6 — reabrir exige motivo; queda auditado en la API. El orden en pantalla no es contractual: se busca la del curador 2.
    const agregado = await (await request.get(`${API}/api/convocatorias/panel/evaluaciones`, { headers: coordinacion })).json() as Array<{ numero: string; evaluaciones: Array<{ curadorCuentaId: string }> }>;
    const posicionDos = agregado.find((x) => x.numero === numero)!.evaluaciones.findIndex((e) => e.curadorCuentaId === CURADOR_2) + 1;
    expect(posicionDos).toBeGreaterThan(0);
    await tarjeta.getByRole('button', { name: `Reabrir evaluación ${posicionDos} de ${numero}` }).click();
    await expect(tarjeta.getByRole('alert')).toContainText('El motivo es obligatorio');
    await tarjeta.getByLabel('Motivo de reapertura').fill('Revisar el criterio de vinculación');
    await tarjeta.getByRole('button', { name: `Reabrir evaluación ${posicionDos} de ${numero}` }).click();
    await expect(panel.getByRole('status').filter({ hasText: 'reabierta' })).toContainText(numero);
    await expect(panel.getByRole('article', { name: new RegExp(numero) })).toContainText('Estado: en evaluación');

    // El curador 2 corrige a 40/40/40: dispersión de 39 puntos (> 25) → requiere deliberación (AS5).
    await dos.reload();
    await expect(dos.getByText('Coordinación reabrió tu evaluación')).toBeVisible();
    await calificar(dos, '40', '40', '40');
    await enviar(dos);
    const resultado = dos.getByRole('region', { name: 'Evaluación enviada' });
    await expect(resultado).toContainText('Mi puntaje: 40,00');
    await expect(resultado).toContainText('Puntaje final de la postulación: 59,50');
    await expect(resultado).toContainText('difieren en más de 25 puntos');
    await expect(dos).toHaveTitle(/Curaduría: evaluar postulación/);
    await sinViolacionesAxe(dos);
    await panel.reload();
    await expect(panel).toHaveTitle(/Evaluaciones de postulaciones/);
    await expect(panel.getByRole('article', { name: new RegExp(numero) })).toContainText('Requiere deliberación');
    await sinViolacionesAxe(panel);

    // La evaluación enviada del curador 1 sigue inmutable también en la API.
    const lista = await (await request.get(`${API}/api/convocatorias/curaduria/asignaciones`, { headers: cabeceras(CURADOR_1, 'curador') })).json() as Array<{ asignacionId: string; postulacion: { numero: string } }>;
    const asignacionUno = lista.find((a) => a.postulacion.numero === numero)!.asignacionId;
    const intento = await request.put(`${API}/api/convocatorias/curaduria/asignaciones/${asignacionUno}/evaluacion`, {
      headers: cabeceras(CURADOR_1, 'curador'), data: { calificaciones: [] },
    });
    expect(intento.status()).toBe(409);
    for (const p of [uno, dos, panel]) await p.context().close();
  });

  test('Q7: la evaluación se completa solo con teclado y el foco llega a la confirmación', async ({ browser, request }) => {
    const numero = numeroDelProyecto();
    await prepararPostulacion(request, numero);
    const page = await sesion(browser, CURADOR_1);
    await page.goto('/curaduria');
    await expect(page).toHaveTitle(/Curaduría: mis asignaciones/);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
    await abrirEvaluacion(page, numero);

    await page.getByLabel(/Propuesta artística/).focus();
    for (const nota of ['90', '90', '90']) {
      await page.keyboard.press('Control+A');
      await page.keyboard.type(nota);
      await page.keyboard.press('Tab');
    }
    await expect(page.getByLabel('Observaciones')).toBeFocused();
    await page.keyboard.type(' Evaluada con teclado.');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Guardar borrador' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Enviar evaluación' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Confirmar envío' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Evaluación enviada' })).toContainText('Mi puntaje: 90,00');
    await page.context().close();
  });

  test('US3-AS3: un curador con conflicto de interés ve la asignación bloqueada y no puede evaluar', async ({ browser, request }) => {
    const page = await sesion(browser, CURADOR_CONFLICTO);
    await page.goto('/curaduria');
    await expect(page).toHaveTitle(/Curaduría: mis asignaciones/);
    const tarjeta = page.getByRole('article', { name: /EV-2026-0003/ });
    await expect(tarjeta).toContainText('Asignación bloqueada: Conflicto de interés');
    await expect(tarjeta.getByRole('link')).toHaveCount(0);
    await sinViolacionesAxe(page);

    const lista = await (await request.get(`${API}/api/convocatorias/curaduria/asignaciones`, { headers: cabeceras(CURADOR_CONFLICTO, 'curador') })).json() as Array<{ asignacionId: string }>;
    const ruta = `${API}/api/convocatorias/curaduria/asignaciones/${lista[0]!.asignacionId}`;
    expect((await request.put(`${ruta}/evaluacion`, { headers: cabeceras(CURADOR_CONFLICTO, 'curador'), data: { calificaciones: [] } })).status()).toBe(403);
    expect((await request.post(`${ruta}/enviar`, { headers: cabeceras(CURADOR_CONFLICTO, 'curador') })).status()).toBe(403);
    // Directo por URL tampoco muestra material.
    await page.goto(`/curaduria/${lista[0]!.asignacionId}`);
    await expect(page.getByText('Asignación bloqueada')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar evaluación' })).toHaveCount(0);
    await page.context().close();
  });

  test('T034: un postulante no accede a la curaduría', async ({ request }) => {
    const postulante = cabeceras('99999999-0000-4000-8000-000000000009', 'postulante');
    expect((await request.get(`${API}/api/convocatorias/curaduria/asignaciones`, { headers: postulante })).status()).toBe(403);
    expect((await request.get(`${API}/api/convocatorias/panel/evaluaciones`, { headers: postulante })).status()).toBe(403);
  });
});
