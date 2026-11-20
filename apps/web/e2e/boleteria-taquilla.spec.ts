import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { idDe, sinViolacionesAxe } from './ayuda';
import { activarSesionDev, abrirDbE2e, limpiarFuncionE2e, sembrarFuncionE2e } from './ayuda-boleteria';

test.describe('US4 · Taquilla presencial y arqueo de caja (T045)', () => {
  test('US4-AS1, AS3: abre caja, vende en efectivo sin correo, genera QR imprimible y cierra con diferencia 0', async ({
    page,
  }) => {
    const db = abrirDbE2e();
    const fnId = await sembrarFuncionE2e(db, {
      obraTitulo: 'Obra Taquilla E2E',
      sedeId: idDe('sede:nacional'),
      inicio: '2026-11-14T20:00:00-05:00',
      fin: '2026-11-14T21:30:00-05:00',
      aforoHabilitado: 10,
      precioCentavos: 500,
    });
    const taquilleroId = randomUUID();
    await activarSesionDev(page, {
      cuentaId: taquilleroId,
      rol: 'taquilla',
      sedeId: idDe('sede:nacional'),
      correo: 'taquilla@fiavl.ec',
    });

    try {
      await page.goto('/taquilla');
      await page.getByLabel('Identificador de sede (UUID)').fill(idDe('sede:nacional'));
      await page.getByLabel('Fondo inicial en efectivo (USD)').fill('20.00');
      await page.getByRole('button', { name: 'Abrir caja' }).click();
      await expect(page.getByText('Caja diaria abierta correctamente.')).toBeVisible();

      await page.getByLabel('ID de función (UUID)').fill(fnId);
      await page.getByLabel('Cantidad').fill('2');
      await page.getByLabel('Medio de pago').selectOption('efectivo');
      await page.getByRole('button', { name: 'Emitir entradas en taquilla' }).click();

      await expect(page.getByText('Venta registrada: 2 entrada(s) emitida(s).')).toBeVisible();
      await expect(page.locator('.boleto-qr')).toHaveCount(2);
      await expect(page.getByTestId('efectivo-esperado')).toHaveText('USD 30,00');

      await page.getByLabel('Efectivo contado en caja (USD)').fill('30.00');
      await page.getByRole('button', { name: 'Cerrar caja con arqueo' }).click();
      await expect(page.getByTestId('diferencia-arqueo')).toHaveText('USD 0,00');
      await sinViolacionesAxe(page);
    } finally {
      await limpiarFuncionE2e(db, fnId);
      await db.$disconnect();
    }
  });
});
