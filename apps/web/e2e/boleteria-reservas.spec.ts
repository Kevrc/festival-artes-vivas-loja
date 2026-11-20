import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { idDe } from './ayuda';
import { activarSesionDev, abrirDbE2e, limpiarFuncionE2e, sembrarFuncionE2e } from './ayuda-boleteria';

test.describe('US3 · Reservas gratuitas, restringidas y entrada libre (T039)', () => {
  test('US3-AS2: función de ingreso libre muestra "Entrada libre" sin reserva', async ({ page }) => {
    await page.goto(`/entradas/${idDe('funcion:clowns')}`);
    await expect(page.getByText(/Entrada libre:/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Confirmar reserva/ })).toHaveCount(0);
  });

  test('US3-AS1 y cancelación: reserva gratuita, emite QR y cancela devolviendo lugar', async ({ page }) => {
    const db = abrirDbE2e();
    const fnId = await sembrarFuncionE2e(db, {
      obraTitulo: 'Obra Gratuita E2E',
      inicio: '2026-11-15T17:00:00-05:00',
      fin: '2026-11-15T18:15:00-05:00',
      aforoHabilitado: 5,
      tipoAcceso: 'gratuita_reserva',
      precioCentavos: 0,
    });
    const cuentaId = randomUUID();
    await activarSesionDev(page, { cuentaId, rol: 'asistente', correo: 'reserva@fiavl.ec' });

    try {
      await page.goto(`/entradas/${fnId}`);
      await page.getByLabel(/Cantidad de lugares/).selectOption('2');
      await page.getByRole('button', { name: 'Confirmar reserva gratuita' }).click();
      await expect(page).toHaveURL(/\/mis-entradas/);
      await expect(page.locator('.boleto-qr')).toHaveCount(2);

      await page.getByRole('button', { name: 'Cancelar reserva' }).click();
      await expect(page.getByText('Estado: cancelado')).toBeVisible();

      await page.goto(`/entradas/${fnId}`);
      await expect(page.getByText('5 lugares disponibles')).toBeVisible();
    } finally {
      await limpiarFuncionE2e(db, fnId);
      await db.$disconnect();
    }
  });

  test('US3-AS3: función restringida solo estudiantes exige acreditación estudiantil', async ({ page }) => {
    await page.goto(`/entradas/${idDe('funcion:taller')}`);
    await expect(page.getByText('Solo estudiantes acreditados')).toBeVisible();

    await page.getByRole('button', { name: 'Entrar como estudiante acreditado' }).click();
    await expect(page.getByText('estudiante acreditado')).toBeVisible();
  });
});
