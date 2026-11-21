import { type APIRequestContext, expect, test } from '@playwright/test';
import { idDe, sinViolacionesAxe } from './ayuda';

const API = process.env.API_URL ?? 'http://localhost:4000';
const PROGRAMADOR = { 'x-cuenta-dev': '00000000-0000-4000-8000-0000000000e2', 'x-roles-dev': 'programador' };

/** Deja el día sin borradores de "El Cura sin cabeza" (restos de una ejecución interrumpida). */
async function limpiarBorradores(request: APIRequestContext, dia: string) {
  const r = await request.get(`${API}/api/operacion/ediciones/${idDe('edicion-2026')}/grilla?fecha=${dia}`, { headers: PROGRAMADOR });
  const grilla = (await r.json()) as { funciones: { id: string; obraTitulo: string; estado: string; version: number }[] };
  for (const f of grilla.funciones.filter((x) => x.estado === 'borrador' && x.obraTitulo === 'El Cura sin cabeza')) {
    await request.delete(`${API}/api/operacion/funciones/${f.id}`, { headers: { ...PROGRAMADOR, 'If-Match': `"${f.version}"` } });
  }
}

/**
 * T043 · US1 — grilla de programación: crear, ver el conflicto y corregir, con axe.
 * Usa la semilla de la edición 2026 (prisma/seed/operacion.ts). Cada proyecto de Playwright usa un
 * día distinto para no chocar entre sí cuando corren en paralelo.
 */
const CASOS = {
  // Bondi Beach: 20:00–21:15 en el Teatro Bolívar; con 30 min de montaje la sede queda libre a las 21:45.
  escritorio: { dia: '2026-11-13', hora: '21:30', libre: '21:45', choca: 'Bondi Beach' },
  // El hazmerreír (segunda función): 19:00–20:10; libre a las 20:40.
  movil: { dia: '2026-11-18', hora: '20:30', libre: '20:40', choca: 'El hazmerreír' },
} as const;

test.describe('US1 · Programar funciones en la grilla', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('fiavl.sesion_dev_operacion', JSON.stringify({ cuentaId: '00000000-0000-4000-8000-0000000000e2', rol: 'programador' }));
    });
  });

  test('US1-AS1, US1-AS2: el cruce se muestra con la función que choca y se corrige con la hora libre', async ({ page, request }, info) => {
    const caso = CASOS[info.project.name as keyof typeof CASOS] ?? CASOS.escritorio;
    await limpiarBorradores(request, caso.dia);
    await page.goto('/programacion');
    await expect(page.getByRole('heading', { name: 'Programación', level: 1 })).toBeVisible();

    await page.getByLabel('Día', { exact: true }).selectOption(caso.dia);
    await expect(page.getByRole('button', { name: new RegExp(caso.choca) }).filter({ visible: true }).first()).toBeVisible();

    const formulario = page.getByRole('form', { name: 'Nueva función' });
    await formulario.getByLabel('Obra').selectOption({ label: 'El Cura sin cabeza · Cano Artes Escénicas (90 min)' });
    await formulario.getByLabel('Sede').selectOption({ label: 'Teatro Bolívar' });
    await formulario.getByLabel('Hora de inicio').fill(caso.hora);
    await formulario.getByLabel('Aforo habilitado').fill('300');
    await formulario.getByRole('button', { name: 'Crear en borrador' }).click();

    // El conflicto se anuncia con texto (no solo color) y enfoca el resumen.
    const alerta = page.getByRole('alert').filter({ hasText: 'No se guardó' });
    await expect(alerta).toContainText('No se guardó');
    await expect(alerta).toContainText('Cruce de sede');
    await expect(alerta.getByRole('link', { name: caso.choca })).toBeVisible();
    await expect(alerta).toBeFocused();
    await expect(page.getByText('⚠ En conflicto:').filter({ visible: true }).first()).toBeVisible();
    await sinViolacionesAxe(page);

    // Corregir con la hora en que la sede queda libre.
    await alerta.getByRole('button', { name: `Usar ${caso.libre}` }).click();
    await expect(formulario.getByLabel('Hora de inicio')).toHaveValue(caso.libre);
    await formulario.getByRole('button', { name: 'Crear en borrador' }).click();

    const estado = page.getByRole('status').filter({ hasText: 'Guardada en borrador' });
    await expect(estado).toContainText(`El Cura sin cabeza, ${caso.libre}`);
    await expect(page.getByRole('button', { name: new RegExp(`${caso.libre}.*El Cura sin cabeza \\(borrador\\)`) }).first()).toBeVisible();
    await sinViolacionesAxe(page);

    // Limpieza: el borrador se elimina y la sede vuelve a quedar libre.
    await page.getByRole('button', { name: 'Eliminar borrador' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Borrador eliminado' })).toBeVisible();
    await expect(page.getByRole('button', { name: /El Cura sin cabeza \(borrador\)/ })).toHaveCount(0);
  });

  test('US1-AS5: la obra de convocatoria aparece en el buscador con su ficha técnica', async ({ page }) => {
    await page.goto('/programacion/obras');
    await page.getByLabel('Origen').selectOption('invitado');
    await expect(page.getByText(/obras encontradas/)).toBeVisible();
    await page.getByLabel('Buscar por título o elenco').fill('Cometa');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('heading', { name: 'Cometa', level: 2 })).toBeVisible();
    await expect(page.getByText('Ficha técnica', { exact: true })).toBeVisible();
    await sinViolacionesAxe(page);
  });
});
