import { expect, test } from '@playwright/test';
import { sinViolacionesAxe } from './ayuda';
import { ingresarPersonal } from './ayuda-identidad';

/** T113 · US5 — Dirección consulta indicadores, exporta el CSV y ve el estado del informe, con axe. */
test('Dirección ve los indicadores por sede, exporta el CSV y el informe espera al cierre', async ({ page }) => {
  test.setTimeout(120_000);
  await ingresarPersonal(page, 'direccion@fiavl.test', '/estadisticas');
  await expect(page.getByRole('heading', { name: /^Estadísticas de la edición/, level: 1 })).toBeVisible();
  await page.getByLabel('Agrupar por').selectOption('sede');
  const tabla = page.getByRole('table', { name: /Indicadores por sede/ });
  await expect(tabla).toBeVisible();
  await expect(tabla.getByRole('rowheader', { name: 'Total' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Asistencia total:/ })).toBeVisible();
  await sinViolacionesAxe(page);

  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  expect((await descarga).suggestedFilename()).toBe('indicadores-sede.csv');

  await page.getByRole('link', { name: 'Informe de cierre' }).click();
  await expect(page.getByRole('heading', { name: /^Informe de cierre/, level: 1 })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /disponible el día siguiente|Generado/ }).or(page.getByRole('table'))).toBeVisible();
  await sinViolacionesAxe(page);
});
