import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { sinViolacionesAxe } from './ayuda';
import { activarSesionDev, abrirDbE2e, limpiarFuncionE2e, sembrarFuncionE2e } from './ayuda-boleteria';

test.describe('US6 · Ocupación en vivo de sala (T058)', () => {
  test('US6-AS1: refleja emitidas, ingresos validados, pendientes y libres en /sala/[funcionId]', async ({
    page,
  }) => {
    const db = abrirDbE2e();
    const fnId = await sembrarFuncionE2e(db, {
      obraTitulo: 'Obra Sala En Vivo E2E',
      inicio: '2026-11-14T12:30:00-05:00',
      fin: '2026-11-14T14:00:00-05:00',
      aforoHabilitado: 10,
      tipoAcceso: 'gratuita_reserva',
      precioCentavos: 0,
    });

    try {
      // Asistente reserva 2 lugares
      await activarSesionDev(page, {
        cuentaId: randomUUID(),
        rol: 'asistente',
        correo: 'sala-asistente@fiavl.ec',
      });
      await page.goto(`/entradas/${fnId}`);
      await page.getByLabel(/Cantidad de lugares/).selectOption('2');
      await page.getByRole('button', { name: 'Confirmar reserva gratuita' }).click();
      await expect(page).toHaveURL(/\/mis-entradas/);
      const primerCodigo = (await page.locator('.codigo-corto code').first().innerText()).trim();

      // Validador registra 1 ingreso en puerta
      await activarSesionDev(page, { cuentaId: randomUUID(), rol: 'validador', correo: 'val-sala@fiavl.ec' });
      await page.goto(`/validador/${fnId}`);
      await page.getByLabel('Código corto o contenido QR').fill(primerCodigo);
      await page.getByRole('button', { name: 'Validar entrada' }).click();
      await expect(page.getByTestId('resultado-semaforo')).toHaveAttribute('data-semaforo', 'verde');

      // Jefe de sala consulta ocupación en vivo
      await activarSesionDev(page, { cuentaId: randomUUID(), rol: 'jefe_sala', correo: 'jefe@fiavl.ec' });
      await page.goto(`/sala/${fnId}`);
      await expect(page.getByTestId('oc-aforo')).toHaveText('10');
      await expect(page.getByTestId('oc-emitidas')).toHaveText('2');
      await expect(page.getByTestId('oc-ingresos')).toHaveText('1');
      await expect(page.getByTestId('oc-pendientes')).toHaveText('1');
      await expect(page.getByTestId('oc-libres')).toHaveText('8');
      await sinViolacionesAxe(page);
    } finally {
      await limpiarFuncionE2e(db, fnId);
      await db.$disconnect();
    }
  });
});
