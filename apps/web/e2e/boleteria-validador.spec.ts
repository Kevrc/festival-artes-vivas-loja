import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { sinViolacionesAxe } from './ayuda';
import { activarSesionDev, abrirDbE2e, limpiarFuncionE2e, sembrarFuncionE2e } from './ayuda-boleteria';

test.describe('US2 · Validación en puerta y modo sin conexión (T033)', () => {
  test('US2-AS1, AS2, AS5: descarga paquete, valida offline código corto (verde/ámbar/rojo) y sincroniza', async ({
    page,
    context,
  }) => {
    const db = abrirDbE2e();
    // Ventana abierta para FIAVL_AHORA=2026-11-14T12:00:00-05:00
    const fnId = await sembrarFuncionE2e(db, {
      obraTitulo: 'Obra Puerta Offline',
      inicio: '2026-11-14T12:30:00-05:00',
      fin: '2026-11-14T14:00:00-05:00',
      aforoHabilitado: 10,
      tipoAcceso: 'gratuita_reserva',
      precioCentavos: 0,
    });

    const cuentaId = randomUUID();
    await activarSesionDev(page, { cuentaId, rol: 'asistente', correo: 'puerta@fiavl.ec' });

    try {
      // 1. Emitir una reserva para obtener código corto real
      await page.goto(`/entradas/${fnId}`);
      await page.getByRole('button', { name: 'Confirmar reserva gratuita' }).click();
      await expect(page).toHaveURL(/\/mis-entradas/);
      const codigoTexto = (await page.locator('.codigo-corto code').first().innerText()).trim();

      // 2. Cambiar a validador, descargar paquete y navegar a puerta
      await activarSesionDev(page, {
        cuentaId: randomUUID(),
        rol: 'validador',
        correo: 'val@fiavl.ec',
      });
      await page.goto('/validador');
      await page.getByLabel('ID de función (UUID)').fill(fnId);
      await page.getByRole('button', { name: 'Descargar paquete sin conexión' }).click();
      await expect(page.getByText(/Paquete descargado y guardado sin conexión \(1 entradas\)/)).toBeVisible();

      await page.getByRole('link', { name: 'Ir a puerta de validación' }).click();
      await expect(page).toHaveURL(new RegExp(`/validador/${fnId}$`));

      // 3. Desconectar red real en Playwright y validar offline
      await context.setOffline(true);
      await expect(page.getByTestId('modo-red')).toContainText('Sin conexión');

      await page.getByLabel('Código corto o contenido QR').fill(codigoTexto);
      await page.getByRole('button', { name: 'Validar entrada' }).click();
      await expect(page.getByTestId('resultado-semaforo')).toHaveAttribute('data-semaforo', 'verde');
      await expect(page.getByTestId('resultado-semaforo')).toContainText('ACCESO PERMITIDO');
      await expect(page.getByTestId('cola-pendiente')).toHaveText('1');

      // Segunda lectura inmediata en mismo dispositivo -> ámbar
      await page.getByLabel('Código corto o contenido QR').fill(codigoTexto);
      await page.getByRole('button', { name: 'Validar entrada' }).click();
      await expect(page.getByTestId('resultado-semaforo')).toHaveAttribute('data-semaforo', 'ambar');
      await expect(page.getByTestId('resultado-semaforo')).toContainText('LECTURA RECIENTE');

      // Código inexistente -> rojo
      await page.getByLabel('Código corto o contenido QR').fill('XXXX-9999');
      await page.getByRole('button', { name: 'Validar entrada' }).click();
      await expect(page.getByTestId('resultado-semaforo')).toHaveAttribute('data-semaforo', 'rojo');
      await expect(page.getByTestId('resultado-semaforo')).toContainText('ACCESO DENEGADO');

      // 4. Reconectar y sincronizar ingresos con el servidor
      await context.setOffline(false);
      await sinViolacionesAxe(page);
      await page.getByRole('button', { name: /Sincronizar ingresos/ }).click();
      await expect(page.getByTestId('cola-pendiente')).toHaveText('0');
      await expect(page.getByText(/Sincronización completa: 1 aplicado/)).toBeVisible();
    } finally {
      await context.setOffline(false);
      await limpiarFuncionE2e(db, fnId);
      await db.$disconnect();
    }
  });
});
