import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearAppBoleteria } from './app';

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

describe('taquilla física y arqueo de caja (T044: US4-AS1..AS5, SC-006)', () => {
  it('US4-AS1: web y taquilla compiten por el último lugar y solo uno vende', async () => {
    const { funcionId, sedeId } = await ctx.sembrarFuncion({ aforoHabilitado: 1 });
    const vendedorId = randomUUID();
    const caja = await ctx
      .http()
      .post('/api/boleteria/taquilla/cajas')
      .set('x-cuenta-dev', vendedorId)
      .set('x-rol-dev', 'taquilla')
      .set('x-sede-dev', sedeId)
      .send({ sedeId, fondoInicialCentavos: 1000 })
      .expect(201);

    const [rWeb, rTaq] = await Promise.all([
      ctx
        .http()
        .post('/api/boleteria/pedidos')
        .set('x-cuenta-dev', randomUUID())
        .set('Idempotency-Key', `web-ultimo-${randomUUID()}`)
        .send({ funcionId, cantidad: 1 }),
      ctx
        .http()
        .post('/api/boleteria/taquilla/ventas')
        .set('x-cuenta-dev', vendedorId)
        .set('x-rol-dev', 'taquilla')
        .set('x-sede-dev', sedeId)
        .set('Idempotency-Key', `taq-ultimo-${randomUUID()}`)
        .send({ cajaId: caja.body.id, funcionId, cantidad: 1, medioPago: 'efectivo' }),
    ]);

    const codigos = [rWeb.status, rTaq.status].sort();
    expect(codigos).toEqual([201, 409]);
  });

  it('US4-AS2, US4-AS3, US4-AS4, US4-AS5 y SC-006: venta en efectivo y datáfono sin correo, cierre cuadrado y bloqueo en caja cerrada', async () => {
    const { funcionId, sedeId } = await ctx.sembrarFuncion({ aforoHabilitado: 30 });
    const vendedorId = randomUUID();

    const caja = await ctx
      .http()
      .post('/api/boleteria/taquilla/cajas')
      .set('x-cuenta-dev', vendedorId)
      .set('x-rol-dev', 'taquilla')
      .set('x-sede-dev', sedeId)
      .send({ sedeId, fondoInicialCentavos: 2000 })
      .expect(201);

    // US4-AS5: venta sin correo ni cuenta
    const vEf = await ctx
      .http()
      .post('/api/boleteria/taquilla/ventas')
      .set('x-cuenta-dev', vendedorId)
      .set('x-rol-dev', 'taquilla')
      .set('x-sede-dev', sedeId)
      .set('Idempotency-Key', `v-ef-${randomUUID()}`)
      .send({ cajaId: caja.body.id, funcionId, cantidad: 2, medioPago: 'efectivo' })
      .expect(201);
    expect(vEf.body.estado).toBe('pagado');
    expect(vEf.body.entradas).toHaveLength(2);

    await ctx
      .http()
      .post('/api/boleteria/taquilla/ventas')
      .set('x-cuenta-dev', vendedorId)
      .set('x-rol-dev', 'taquilla')
      .set('x-sede-dev', sedeId)
      .set('Idempotency-Key', `v-tarj-${randomUUID()}`)
      .send({ cajaId: caja.body.id, funcionId, cantidad: 1, medioPago: 'tarjeta_datafono' })
      .expect(201);

    const cierre = await ctx
      .http()
      .post(`/api/boleteria/taquilla/cajas/${caja.body.id}/cerrar`)
      .set('x-cuenta-dev', vendedorId)
      .set('x-rol-dev', 'taquilla')
      .set('x-sede-dev', sedeId)
      .send({ efectivoDeclaradoCentavos: 3000 }) // 2000 fondo + 1000 efectivo
      .expect(200);

    expect(cierre.body.estado).toBe('cerrada');
    expect(cierre.body.efectivoEsperadoCentavos).toBe(3000);
    expect(cierre.body.totalTarjetaVentasCentavos).toBe(500);
    expect(cierre.body.diferenciaCentavos).toBe(0);

    // US4-AS4: caja cerrada rechaza venta
    await ctx
      .http()
      .post('/api/boleteria/taquilla/ventas')
      .set('x-cuenta-dev', vendedorId)
      .set('x-rol-dev', 'taquilla')
      .set('x-sede-dev', sedeId)
      .set('Idempotency-Key', `v-cerrada-${randomUUID()}`)
      .send({ cajaId: caja.body.id, funcionId, cantidad: 1, medioPago: 'efectivo' })
      .expect(422);
  });
});
