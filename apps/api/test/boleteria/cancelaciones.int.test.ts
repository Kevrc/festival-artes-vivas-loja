import { randomUUID } from 'node:crypto';
import { ejemplo } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearAppBoleteria, firmarWebhookTest } from './app';

let ctx: Awaited<ReturnType<typeof crearAppBoleteria>>;

beforeAll(async () => {
  ctx = await crearAppBoleteria();
});

afterAll(async () => {
  await ctx.cerrar();
});

beforeEach(async () => {
  ctx.relojRef.ahora = new Date('2026-11-14T12:00:00-05:00');
  await ctx.limpiarTodo();
});

async function comprarYPagarWeb(funcionId: string, cuentaId: string, cantidad: number) {
  const p = await ctx
    .http()
    .post('/api/boleteria/pedidos')
    .set('x-cuenta-dev', cuentaId)
    .set('Idempotency-Key', `canc-${randomUUID()}`)
    .send({ funcionId, cantidad })
    .expect(201);
  const wh = {
    pedidoId: p.body.pedido.id,
    referenciaProveedor: `ref-${randomUUID()}`,
    resultado: 'aprobado',
    importeCentavos: p.body.pedido.importeCentavos,
  };
  await ctx.http().post('/api/boleteria/pagos/webhook').set('x-firma-proveedor', firmarWebhookTest(wh)).send(wh).expect(200);
  return p.body.pedido.id as string;
}

describe('cancelaciones, devoluciones y cambios (T051: US5-AS1..AS5, casos borde)', () => {
  it('US5-AS1, US5-AS2, US5-AS3, US5-AS4, US5-AS5: cancelación, devolución web, cambio de función, devolución en taquilla y plazo de 7 días', async () => {
    const fOrig = await ctx.sembrarFuncion({ titulo: 'Cometa', aforoHabilitado: 50 });
    const fAlt = await ctx.sembrarFuncion({
      edicionId: fOrig.edicionId,
      obraId: fOrig.obraId,
      titulo: 'Cometa',
      sedeId: fOrig.sedeId,
      inicio: '2026-11-15T19:00:00-05:00',
      fin: '2026-11-15T20:30:00-05:00',
      aforoHabilitado: 30,
    });

    const cuentaDev = randomUUID();
    const cuentaCambio = randomUUID();
    const cuentaVencido = randomUUID();
    const pDev = await comprarYPagarWeb(fOrig.funcionId, cuentaDev, 2);
    const pCambio = await comprarYPagarWeb(fOrig.funcionId, cuentaCambio, 2);
    const pVencido = await comprarYPagarWeb(fOrig.funcionId, cuentaVencido, 1);

    // Venta en efectivo en taquilla
    const vendedorId = randomUUID();
    const caja = await ctx
      .http()
      .post('/api/boleteria/taquilla/cajas')
      .set('x-cuenta-dev', vendedorId)
      .set('x-rol-dev', 'taquilla')
      .set('x-sede-dev', fOrig.sedeId)
      .send({ sedeId: fOrig.sedeId, fondoInicialCentavos: 5000 })
      .expect(201);
    const vTaq = await ctx
      .http()
      .post('/api/boleteria/taquilla/ventas')
      .set('x-cuenta-dev', vendedorId)
      .set('x-rol-dev', 'taquilla')
      .set('x-sede-dev', fOrig.sedeId)
      .set('Idempotency-Key', `taq-canc-${randomUUID()}`)
      .send({ cajaId: caja.body.id, funcionId: fOrig.funcionId, cantidad: 1, medioPago: 'efectivo' })
      .expect(201);

    // Operación cancela fOrig
    await ctx.aplicar.ejecutar(ejemplo.funcionCancelada(fOrig.edicionId, { funcionId: fOrig.funcionId, version: 2 }));

    // US5-AS1: entradas anuladas
    const detDev = await ctx.http().get(`/api/boleteria/pedidos/${pDev}`).set('x-cuenta-dev', cuentaDev).expect(200);
    expect(detDev.body.entradas.every((e: { estado: string }) => e.estado === 'anulada')).toBe(true);

    // US5-AS2: comprador web elige devolución
    const respDev = await ctx
      .http()
      .post(`/api/boleteria/pedidos/${pDev}/eleccion-cancelacion`)
      .set('x-cuenta-dev', cuentaDev)
      .send({ eleccion: 'devolucion' })
      .expect(200);
    expect(respDev.body.estado).toBe('reembolsado');

    // US5-AS3: comprador web elige cambio sin nuevo cobro
    const respCambio = await ctx
      .http()
      .post(`/api/boleteria/pedidos/${pCambio}/eleccion-cancelacion`)
      .set('x-cuenta-dev', cuentaCambio)
      .send({ eleccion: 'cambio', nuevaFuncionId: fAlt.funcionId })
      .expect(200);
    expect(respCambio.body.funcionId).toBe(fAlt.funcionId);
    expect(respCambio.body.importeCentavos).toBe(0);
    expect(respCambio.body.entradas).toHaveLength(2);

    // US5-AS4: devolución en efectivo en taquilla queda como egreso en caja
    await ctx
      .http()
      .post('/api/boleteria/taquilla/devoluciones')
      .set('x-cuenta-dev', vendedorId)
      .set('x-rol-dev', 'taquilla')
      .set('x-sede-dev', fOrig.sedeId)
      .send({ cajaId: caja.body.id, codigoEntrada: vTaq.body.entradas[0].codigoCorto })
      .expect(200);

    const cajaAct = await ctx
      .http()
      .get('/api/boleteria/taquilla/cajas/actual')
      .set('x-cuenta-dev', vendedorId)
      .set('x-rol-dev', 'taquilla')
      .set('x-sede-dev', fOrig.sedeId)
      .expect(200);
    expect(cajaAct.body.totalDevolucionesEfectivoCentavos).toBe(500);
    expect(cajaAct.body.efectivoEsperadoCentavos).toBe(5000);

    // US5-AS5: pasan 7 días sin elección para pVencido -> devolución automática
    ctx.relojRef.ahora = new Date('2026-11-22T12:00:00-05:00');
    expect(await ctx.cancelaciones.procesarDevolucionesVencidas()).toBe(1);
    const detVencido = await ctx.http().get(`/api/boleteria/pedidos/${pVencido}`).set('x-cuenta-dev', cuentaVencido).expect(200);
    expect(detVencido.body.estado).toBe('reembolsado');
  });

  it('casos borde: FuncionReprogramada mantiene entradas válidas (RN-005) y AforoCambiado menor a emitidas emite AforoExcedido', async () => {
    const f = await ctx.sembrarFuncion({ aforoHabilitado: 10 });
    const cuenta = randomUUID();
    const pedId = await comprarYPagarWeb(f.funcionId, cuenta, 4);

    await ctx.aplicar.ejecutar(
      ejemplo.funcionReprogramada(f.edicionId, {
        funcionId: f.funcionId,
        version: 2,
        anterior: { inicio: '2026-11-14T20:00:00-05:00', fin: '2026-11-14T21:30:00-05:00', sedeId: f.sedeId },
        nuevo: { inicio: '2026-11-15T20:00:00-05:00', fin: '2026-11-15T21:30:00-05:00', sedeId: f.sedeId },
        motivo: 'lluvia',
      }),
    );

    const det = await ctx.http().get(`/api/boleteria/pedidos/${pedId}`).set('x-cuenta-dev', cuenta).expect(200);
    expect(det.body.entradas.every((e: { estado: string }) => e.estado === 'valida')).toBe(true);

    // Reducir aforo de 10 a 2 cuando ya hay 4 vendidas -> bloquea nuevas ventas y publica AforoExcedido
    await ctx.aplicar.ejecutar(
      ejemplo.aforoCambiado(f.edicionId, {
        funcionId: f.funcionId,
        version: 3,
        aforoAnterior: 10,
        aforoHabilitado: 2,
      }),
    );

    expect(ctx.publicador.publicados.some((e) => e.tipo === 'AforoExcedido')).toBe(true);
    const disp = await ctx.http().get(`/api/boleteria/funciones/${f.funcionId}/disponibilidad`).expect(200);
    expect(disp.body.lugaresDisponibles).toBe(0);
  });
});
