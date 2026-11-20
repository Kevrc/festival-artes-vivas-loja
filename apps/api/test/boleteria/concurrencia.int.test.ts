import { randomUUID } from 'node:crypto';
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

describe('concurrencia de aforo SC-001 / RNF-001 (T022)', () => {
  it('500 compras simultáneas sobre una función de 100 lugares emiten exactamente 100 entradas sin sobreventa', async () => {
    const { funcionId } = await ctx.sembrarFuncion({ aforoHabilitado: 100 });

    const peticiones = Array.from({ length: 500 }, (_, i) =>
      ctx
        .http()
        .post('/api/boleteria/pedidos')
        .set('x-cuenta-dev', randomUUID())
        .set('Idempotency-Key', `conc-${i}-${randomUUID()}`)
        .send({ funcionId, cantidad: 1 }),
    );

    const respuestas = await Promise.all(peticiones);
    const exitosas = respuestas.filter((r) => r.status === 201);
    const rechazadas = respuestas.filter((r) => r.status === 409);

    expect(exitosas).toHaveLength(100);
    expect(rechazadas).toHaveLength(400);

    // Confirmar el pago de las 100 exitosas en paralelo
    await Promise.all(
      exitosas.map((r, i) => {
        const wh = {
          pedidoId: r.body.pedido.id,
          referenciaProveedor: `ref-conc-${i}`,
          resultado: 'aprobado',
          importeCentavos: 500,
        };
        return ctx
          .http()
          .post('/api/boleteria/pagos/webhook')
          .set('x-firma-proveedor', firmarWebhookTest(wh))
          .send(wh)
          .expect(200);
      }),
    );

    const inv = await ctx.db.inventarioFuncion.findUniqueOrThrow({ where: { funcionId } });
    expect(inv.emitidos).toBe(100);
    expect(inv.retenidos).toBe(0);
    expect(await ctx.db.entradaBoleteria.count({ where: { funcionId } })).toBe(100);
  }, 60_000);

  it('un pago aprobado que llega justo al vencer no descuenta dos veces los lugares retenidos', async () => {
    // Revisión del PR #6: webhook y expiración simultáneos sobre el mismo pedido
    for (let ronda = 0; ronda < 15; ronda++) {
      await ctx.limpiarTodo();
      ctx.relojRef.ahora = new Date('2026-11-14T12:00:00-05:00');
      const { funcionId } = await ctx.sembrarFuncion({ aforoHabilitado: 10 });
      const crear = () =>
        ctx
          .http()
          .post('/api/boleteria/pedidos')
          .set('x-cuenta-dev', randomUUID())
          .set('Idempotency-Key', `clave-${randomUUID()}`)
          .send({ funcionId, cantidad: 2 })
          .expect(201);
      const a = await crear();
      ctx.relojRef.ahora = new Date('2026-11-14T12:05:00-05:00');
      await crear(); // B sigue pendiente
      ctx.relojRef.ahora = new Date('2026-11-14T12:10:01-05:00'); // A ya venció
      const wh = { pedidoId: a.body.pedido.id, referenciaProveedor: `ref-carrera-${ronda}`, resultado: 'aprobado', importeCentavos: 1000 };
      await Promise.all([
        ctx.http().post('/api/boleteria/pagos/webhook').set('x-firma-proveedor', firmarWebhookTest(wh)).send(wh),
        ctx.expirarRetenciones.ejecutar(),
      ]);
      const inv = await ctx.db.inventarioFuncion.findUniqueOrThrow({ where: { funcionId } });
      const pendientes = await ctx.db.pedidoBoleteria.aggregate({ where: { funcionId, estado: 'pendiente' }, _sum: { cantidad: true } });
      const vigentes = await ctx.db.entradaBoleteria.count({ where: { funcionId, estado: 'valida' } });
      expect(inv.retenidos, `ronda ${ronda}`).toBe(pendientes._sum.cantidad ?? 0);
      expect(inv.emitidos, `ronda ${ronda}`).toBe(vigentes);
    }
  });
});

