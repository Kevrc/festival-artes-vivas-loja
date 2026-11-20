import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { sinViolacionesAxe, tarjeta } from './ayuda';
import { activarSesionDev, abrirDbE2e, limpiarFuncionE2e, sembrarFuncionE2e } from './ayuda-boleteria';

test.describe('US1 · Compra en línea de entradas pagadas (T023)', () => {
  test('enlace desde Cartelera abre /entradas/[funcionId]', async ({ page }) => {
    await page.goto('/cartelera/2026-11-14');
    const lugar = tarjeta(page, 'El lugar del otro');
    await lugar.getByRole('link', { name: /Obtener entrada/i }).click();
    await expect(page).toHaveURL(/\/entradas\//);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Obtener entradas');
  });

  test('US1-AS1, AS3, AS4: aprueba compra -> QR en /mis-entradas y rechaza otra liberando cupo', async ({ page }) => {
    const db = abrirDbE2e();
    const fnId = await sembrarFuncionE2e(db, {
      obraTitulo: 'Obra E2E Compra',
      inicio: '2026-11-14T20:00:00-05:00',
      fin: '2026-11-14T21:30:00-05:00',
      aforoHabilitado: 3,
      precioCentavos: 500,
    });
    const cuentaId = randomUUID();
    await activarSesionDev(page, { cuentaId, rol: 'asistente', correo: 'comprador@fiavl.ec' });

    try {
      // Compra 1 aprobada por 2 entradas
      await page.goto(`/entradas/${fnId}`);
      await expect(page.getByText('3 lugares disponibles')).toBeVisible();
      await page.getByLabel(/Cantidad de entradas/).selectOption('2');
      await page.getByRole('button', { name: /Retener y pagar \(USD 10,00\)/ }).click();

      await expect(page).toHaveURL(/\/pedidos\/.*\/retorno/);
      await page.getByRole('button', { name: 'Aprobar pago simulado' }).click();
      await expect(page.getByTestId('estado-pedido')).toHaveText('pagado');
      await expect(page.locator('.boleto-qr')).toHaveCount(2);

      // Visita Mis entradas y valida accesibilidad
      await page.getByRole('link', { name: 'Ir a Mis entradas' }).click();
      await expect(page).toHaveURL(/\/mis-entradas$/);
      await expect(page.getByText('Obra E2E Compra')).toBeVisible();
      await expect(page.locator('.boleto-qr')).toHaveCount(2);
      await sinViolacionesAxe(page);

      // Segunda compra por el último lugar -> rechazo libera ese lugar
      await page.goto(`/entradas/${fnId}`);
      await expect(page.getByText('1 lugares disponibles')).toBeVisible();
      await page.getByRole('button', { name: /Retener y pagar/ }).click();
      await expect(page).toHaveURL(/\/pedidos\/.*\/retorno/);
      await page.getByRole('button', { name: 'Rechazar pago simulado' }).click();
      await expect(page.getByTestId('estado-pedido')).toHaveText('fallido');

      await page.goto(`/entradas/${fnId}`);
      await expect(page.getByText('1 lugares disponibles')).toBeVisible();
    } finally {
      await limpiarFuncionE2e(db, fnId);
      await db.$disconnect();
    }
  });
});
