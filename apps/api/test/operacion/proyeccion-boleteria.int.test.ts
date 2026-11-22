import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearAppOperacion, sembrarEdicion } from './app';

// T053: la proyección de Boletería en Operación es idempotente (research R5, R7).
let ctx: Awaited<ReturnType<typeof crearAppOperacion>>;
let manejar: (tipo: string, evento: unknown) => Promise<void>;
beforeAll(async () => {
  ctx = await crearAppOperacion();
  const { MANEJADORES_OPERACION } = await import('../../src/modules/operacion/application/puertos');
  const manejadores = ctx.app.get<{ tipo: string; manejar(e: unknown): Promise<void> }[]>(MANEJADORES_OPERACION);
  manejar = (tipo, e) => manejadores.find((m) => m.tipo === tipo)!.manejar(e);
});
afterAll(() => ctx.cerrar());

const sobre = (tipo: string, edicionId: string, datos: Record<string, unknown>) => ({
  id: randomUUID(), tipo, version: 1, ocurridoEn: '2026-11-14T12:00:00-05:00', edicionId, correlacionId: randomUUID(), datos,
});

describe('proyección de Boletería: pedidos, métricas e ingresos', () => {
  it('EntradasEmitidas y PedidoReembolsado suman y restan una sola vez aunque lleguen repetidos', async () => {
    const ids = await sembrarEdicion(ctx.db);
    const funcionId = randomUUID();
    const pedidoId = randomUUID();
    const emitidas = sobre('EntradasEmitidas', ids.edicion, {
      pedidoId, funcionId, sedeId: ids.nacional, canal: 'web', tipo: 'compra', cantidad: 4, importeCentavos: 2000,
      entradas: [{ entradaId: randomUUID(), codigoCorto: 'ABCD1234', tokenQr: 'qr' }],
    });
    await manejar('EntradasEmitidas', emitidas);
    await manejar('EntradasEmitidas', emitidas); // mismo evento
    await manejar('EntradasEmitidas', { ...emitidas, id: randomUUID() }); // otro evento, mismo pedido
    const reserva = sobre('EntradasEmitidas', ids.edicion, {
      pedidoId: randomUUID(), funcionId, sedeId: ids.nacional, canal: 'web', tipo: 'reserva', cantidad: 2, importeCentavos: 0,
      entradas: [{ entradaId: randomUUID(), codigoCorto: 'EFGH5678', tokenQr: 'qr' }],
    });
    await manejar('EntradasEmitidas', reserva);
    expect(await ctx.db.metricaFuncion.findUnique({ where: { funcionId } })).toMatchObject({ entradasEmitidas: 6, entradasReembolsadas: 0, recaudacionCentavos: 2000 });

    const reembolso = sobre('PedidoReembolsado', ids.edicion, { pedidoId, funcionId, sedeId: ids.nacional, importeCentavos: 2000, canal: 'web', motivo: 'funcion_cancelada' });
    await manejar('PedidoReembolsado', reembolso);
    await manejar('PedidoReembolsado', { ...reembolso, id: randomUUID() });
    expect(await ctx.db.metricaFuncion.findUnique({ where: { funcionId } })).toMatchObject({ entradasEmitidas: 6, entradasReembolsadas: 4, recaudacionCentavos: 0 });
    expect(await ctx.db.pedidoRegistrado.findUnique({ where: { pedidoId } })).toMatchObject({ reembolsado: true, cantidad: 4 });
  });

  it('un reembolso de un pedido que nunca emitió entradas (pago tardío sin cupo) no resta nada', async () => {
    const ids = await sembrarEdicion(ctx.db);
    const funcionId = randomUUID();
    await manejar('PedidoReembolsado', sobre('PedidoReembolsado', ids.edicion, {
      pedidoId: randomUUID(), funcionId, sedeId: ids.nacional, importeCentavos: 500, canal: 'web', motivo: 'pago_tardio_sin_cupo',
    }));
    expect(await ctx.db.metricaFuncion.findUnique({ where: { funcionId } })).toBeNull();
  });

  it('IngresoRegistrado cuenta cada ingreso una sola vez (también los diferidos repetidos)', async () => {
    const ids = await sembrarEdicion(ctx.db);
    const funcionId = randomUUID();
    const ingresoId = randomUUID();
    const ingreso = sobre('IngresoRegistrado', ids.edicion, {
      ingresoId, entradaId: randomUUID(), funcionId, sedeId: ids.nacional, validadorId: randomUUID(), escaneadoEn: '2026-11-14T19:55:00-05:00', diferido: true,
    });
    await manejar('IngresoRegistrado', ingreso);
    await manejar('IngresoRegistrado', { ...ingreso, id: randomUUID() });
    await manejar('IngresoRegistrado', sobre('IngresoRegistrado', ids.edicion, { ...ingreso.datos, ingresoId: randomUUID() }));
    expect(await ctx.db.metricaFuncion.findUnique({ where: { funcionId } })).toMatchObject({ ingresosValidados: 2 });
  });
});
