import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { idDe } from './ayuda';
import { activarSesionDev, abrirDbE2e, cancelarFuncionE2e, limpiarFuncionE2e, sembrarFuncionE2e } from './ayuda-boleteria';

test.describe('US5 · Cancelación de función, cambio y devolución (T052)', () => {
  test('US5-AS1, AS2: asistente cambia entrada de función cancelada y taquillero devuelve efectivo', async ({
    page,
  }) => {
    const db = abrirDbE2e();
    const obraId = randomUUID();
    const fnCanceladaId = await sembrarFuncionE2e(db, {
      obraId,
      obraTitulo: 'Obra Reprogramada E2E',
      sedeId: idDe('sede:nacional'),
      inicio: '2026-11-16T20:00:00-05:00',
      fin: '2026-11-16T21:30:00-05:00',
      aforoHabilitado: 10,
      precioCentavos: 500,
    });
    const fnAlternaId = await sembrarFuncionE2e(db, {
      obraId,
      obraTitulo: 'Obra Reprogramada E2E',
      sedeId: idDe('sede:nacional'),
      inicio: '2026-11-17T20:00:00-05:00',
      fin: '2026-11-17T21:30:00-05:00',
      aforoHabilitado: 10,
      precioCentavos: 500,
    });

    const asistenteId = randomUUID();
    const taquilleroId = randomUUID();

    try {
      // 1. Asistente compra entrada en línea
      await activarSesionDev(page, { cuentaId: asistenteId, rol: 'asistente', correo: 'cambio@fiavl.ec' });
      await page.goto(`/entradas/${fnCanceladaId}`);
      await page.getByRole('button', { name: /Retener y pagar/ }).click();
      await page.getByRole('button', { name: 'Aprobar pago simulado' }).click();
      await expect(page.getByTestId('estado-pedido')).toHaveText('pagado');

      // 2. Taquillero vende 1 boleto presencial en efectivo
      await activarSesionDev(page, {
        cuentaId: taquilleroId,
        rol: 'taquilla',
        sedeId: idDe('sede:nacional'),
        correo: 'taq-dev@fiavl.ec',
      });
      await page.goto('/taquilla');
      await page.getByLabel('Identificador de sede (UUID)').fill(idDe('sede:nacional'));
      await page.getByLabel('Fondo inicial en efectivo (USD)').fill('20.00');
      await page.getByRole('button', { name: 'Abrir caja' }).click();
      await page.getByLabel('ID de función (UUID)').fill(fnCanceladaId);
      await page.getByRole('button', { name: 'Emitir entradas en taquilla' }).click();
      await expect(page.locator('.codigo-corto code').first()).toBeVisible();
      const codigoTaquilla = (await page.locator('.codigo-corto code').first().innerText()).trim();
      await expect(page.getByTestId('efectivo-esperado')).toHaveText('USD 25,00');

      // 3. Programación cancela la función
      await cancelarFuncionE2e(db, fnCanceladaId);

      // 4. Taquillero registra devolución en efectivo
      await page.getByLabel('Código corto de entrada').fill(codigoTaquilla);
      await page.getByRole('button', { name: 'Registrar devolución en efectivo' }).click();
      await expect(page.getByText(/Devolución en efectivo registrada/)).toBeVisible();
      await expect(page.getByTestId('efectivo-esperado')).toHaveText('USD 20,00');

      // 5. Asistente cambia su entrada en línea a fnAlternaId sin nuevo cobro
      await activarSesionDev(page, { cuentaId: asistenteId, rol: 'asistente', correo: 'cambio@fiavl.ec' });
      await page.goto('/mis-entradas');
      await page.getByPlaceholder('UUID de función alternativa').fill(fnAlternaId);
      await page.getByRole('button', { name: 'Cambiar de función' }).click();
      await expect(page.getByText('Cambio de función aplicado sin nuevo cobro.')).toBeVisible();
      await expect(page.getByText(/martes, 17 de noviembre/)).toBeVisible();
    } finally {
      await limpiarFuncionE2e(db, fnCanceladaId, fnAlternaId);
      await db.$disconnect();
    }
  });
});
