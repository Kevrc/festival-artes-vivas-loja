import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AutorizacionDevAdapter } from '../../src/modules/boleteria/infrastructure/autorizacion-dev.adapter';
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

describe('seguridad, roles, alcance por sede y webhooks (T064, Constitución VI, Q8)', () => {
  it('rechaza compras sin cuenta verificada (FR-016) y accesos a pedidos de otra cuenta', async () => {
    const { funcionId } = await ctx.sembrarFuncion({ aforoHabilitado: 10 });
    const cuentaA = randomUUID();
    const cuentaB = randomUUID();

    // Correo sin verificar -> 403
    await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', cuentaA)
      .set('x-correo-verificado-dev', 'false')
      .set('Idempotency-Key', `noverif-${randomUUID()}`)
      .send({ funcionId, cantidad: 1 })
      .expect(403);

    // Cuenta A crea pedido, Cuenta B no puede consultarlo
    const ped = await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', cuentaA)
      .set('Idempotency-Key', `prop-${randomUUID()}`)
      .send({ funcionId, cantidad: 1 })
      .expect(201);

    await ctx.http().get(`/api/boleteria/pedidos/${ped.body.pedido.id}`).set('x-cuenta-dev', cuentaB).expect(403);
  });

  it('impide que taquilla o validador operen en otra sede o rol insuficiente', async () => {
    const { funcionId, sedeId } = await ctx.sembrarFuncion({ aforoHabilitado: 10 });
    const otraSede = randomUUID();

    // Rol asistente intenta abrir caja o descargar paquete -> 403
    await ctx
      .http()
      .post('/api/boleteria/taquilla/cajas')
      .set('x-cuenta-dev', randomUUID())
      .set('x-rol-dev', 'asistente')
      .send({ sedeId, fondoInicialCentavos: 1000 })
      .expect(403);

    // Validador asignado a otra sede -> 403
    await ctx
      .http()
      .get(`/api/boleteria/validador/funciones/${funcionId}/paquete`)
      .set('x-cuenta-dev', randomUUID())
      .set('x-rol-dev', 'validador')
      .set('x-sede-dev', otraSede)
      .expect(403);

    // Taquilla asignado a otra sede intenta abrir caja o consultar ocupación -> 403
    await ctx
      .http()
      .post('/api/boleteria/taquilla/cajas')
      .set('x-cuenta-dev', randomUUID())
      .set('x-rol-dev', 'taquilla')
      .set('x-sede-dev', otraSede)
      .send({ sedeId, fondoInicialCentavos: 1000 })
      .expect(403);
  });

  it('rechaza webhooks sin firma válida y falla cerrado fuera de desarrollo/test', async () => {
    const { funcionId } = await ctx.sembrarFuncion({ aforoHabilitado: 10 });
    const ped = await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', randomUUID())
      .set('Idempotency-Key', `wh-${randomUUID()}`)
      .send({ funcionId, cantidad: 1 })
      .expect(201);

    const payload = { pedidoId: ped.body.pedido.id, referenciaProveedor: 'ref-x', resultado: 'aprobado', importeCentavos: 500 };
    expect(firmarWebhookTest(payload)).toHaveLength(64);
    await ctx
      .http()
      .post('/api/boleteria/pagos/webhook')
      .set('x-firma-proveedor', 'firma-falsa')
      .send(payload)
      .expect(401);

    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const auth = new AutorizacionDevAdapter();
      expect(await auth.resolverDesdePeticion({ headers: { 'x-cuenta-dev': randomUUID() } })).toBeNull();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
