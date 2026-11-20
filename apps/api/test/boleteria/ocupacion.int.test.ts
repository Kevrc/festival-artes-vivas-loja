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
  ctx.relojRef.ahora = new Date('2026-11-14T19:15:00-05:00');
  await ctx.limpiarTodo();
});

describe('ocupación en vivo para la sala (T057: US6-AS1, FR-015)', () => {
  it('US6-AS1: refleja emitidas, ingresos validados, pendientes y lugares libres en tiempo real', async () => {
    const { funcionId, sedeId } = await ctx.sembrarFuncion({ aforoHabilitado: 10 });
    const cuentaId = randomUUID();

    const p = await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', cuentaId)
      .set('Idempotency-Key', `oc-${randomUUID()}`)
      .send({ funcionId, cantidad: 4 })
      .expect(201);
    const wh = { pedidoId: p.body.pedido.id, referenciaProveedor: 'ref-oc-1', resultado: 'aprobado', importeCentavos: 2000 };
    await ctx.http().post('/api/boleteria/pagos/webhook').set('x-firma-proveedor', firmarWebhookTest(wh)).send(wh).expect(200);

    const det = await ctx.http().get(`/api/boleteria/pedidos/${p.body.pedido.id}`).set('x-cuenta-dev', cuentaId).expect(200);
    const valId = randomUUID();
    for (let i = 0; i < 2; i++) {
      await ctx
        .http()
        .post('/api/boleteria/validador/validar')
        .set('x-cuenta-dev', valId)
        .set('x-rol-dev', 'validador')
        .set('x-sede-dev', sedeId)
        .send({ funcionId, tokenQr: det.body.entradas[i].tokenQr, dispositivoId: 'dev-1', puerta: 'A' })
        .expect(200);
    }

    const oc = await ctx
      .http()
      .get(`/api/boleteria/funciones/${funcionId}/ocupacion`)
      .set('x-cuenta-dev', randomUUID())
      .set('x-rol-dev', 'jefe_sala')
      .set('x-sede-dev', sedeId)
      .expect(200);

    expect(oc.body).toEqual({
      funcionId,
      aforoHabilitado: 10,
      retenidos: 0,
      emitidas: 4,
      ingresos: 2,
      pendientes: 2,
      libres: 6,
    });
  });
});
