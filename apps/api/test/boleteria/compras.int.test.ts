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

describe('compras pagadas en línea (T021: US1-AS1..AS6, SC-005)', () => {
  it('US1-AS1: compra 3 entradas a USD 5, paga USD 15,00, emite 3 QR distintos y quedan 47 lugares', async () => {
    const { funcionId } = await ctx.sembrarFuncion({ aforoHabilitado: 50 });
    const cuentaId = randomUUID();

    const resPedido = await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', cuentaId)
      .set('Idempotency-Key', `clave-${randomUUID()}`)
      .send({ funcionId, cantidad: 3 })
      .expect(201);

    expect(resPedido.body.pedido.estado).toBe('pendiente');
    expect(resPedido.body.pedido.importeCentavos).toBe(1500);
    expect(resPedido.body.urlPago).toContain(resPedido.body.pedido.id);

    const webhook = {
      pedidoId: resPedido.body.pedido.id,
      referenciaProveedor: 'prov-tx-1',
      resultado: 'aprobado',
      importeCentavos: 1500,
    };
    await ctx
      .http()
      .post('/api/boleteria/pagos/webhook')
      .set('x-firma-proveedor', firmarWebhookTest(webhook))
      .send(webhook)
      .expect(200);

    const mis = await ctx
      .http()
      .get('/api/boleteria/mis-entradas')
      .set('x-cuenta-dev', cuentaId)
      .expect(200);

    expect(mis.body).toHaveLength(1);
    expect(mis.body[0].estado).toBe('pagado');
    expect(mis.body[0].entradas).toHaveLength(3);
    const qrs = new Set(mis.body[0].entradas.map((e: { tokenQr: string }) => e.tokenQr));
    expect(qrs.size).toBe(3);

    const disp = await ctx.http().get(`/api/boleteria/funciones/${funcionId}/disponibilidad`).expect(200);
    expect(disp.body.lugaresDisponibles).toBe(47);
    expect(ctx.publicador.publicados.some((e) => e.tipo === 'EntradasEmitidas')).toBe(true);

    // FR-009 reenvío de correo (caso borde correo rebotado)
    await ctx
      .http()
      .post(`/api/boleteria/pedidos/${resPedido.body.pedido.id}/reenviar-correo`)
      .set('x-cuenta-dev', cuentaId)
      .expect(202);
  });

  it('US1-AS2: pago rechazado no emite entradas y libera los lugares retenidos', async () => {
    const { funcionId } = await ctx.sembrarFuncion({ aforoHabilitado: 10 });
    const cuentaId = randomUUID();

    const p = await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', cuentaId)
      .set('Idempotency-Key', `rechazo-${randomUUID()}`)
      .send({ funcionId, cantidad: 4 })
      .expect(201);

    const webhook = {
      pedidoId: p.body.pedido.id,
      referenciaProveedor: 'prov-rej-1',
      resultado: 'rechazado',
      importeCentavos: 2000,
    };
    await ctx
      .http()
      .post('/api/boleteria/pagos/webhook')
      .set('x-firma-proveedor', firmarWebhookTest(webhook))
      .send(webhook)
      .expect(200);

    const detalle = await ctx
      .http()
      .get(`/api/boleteria/pedidos/${p.body.pedido.id}`)
      .set('x-cuenta-dev', cuentaId)
      .expect(200);
    expect(detalle.body.estado).toBe('fallido');
    expect(detalle.body.entradas).toHaveLength(0);

    const disp = await ctx.http().get(`/api/boleteria/funciones/${funcionId}/disponibilidad`).expect(200);
    expect(disp.body.lugaresDisponibles).toBe(10);
  });

  it('US1-AS3: si quedan 2 lugares y pide 3 informa cuántos quedan y no inicia pago', async () => {
    const { funcionId } = await ctx.sembrarFuncion({ aforoHabilitado: 2 });
    const res = await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', randomUUID())
      .set('Idempotency-Key', `cupo-${randomUUID()}`)
      .send({ funcionId, cantidad: 3 })
      .expect(409);

    expect(res.body.lugaresDisponibles).toBe(2);
    expect(res.body.detail).toContain('2');
    expect(await ctx.db.pedidoBoleteria.count()).toBe(0);
  });

  it('US1-AS4 y SC-005: Idempotency-Key y webhook repetidos cobran y emiten una sola vez', async () => {
    const { funcionId } = await ctx.sembrarFuncion({ aforoHabilitado: 20 });
    const cuentaId = randomUUID();
    const key = `idem-${randomUUID()}`;

    const r1 = await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', cuentaId)
      .set('Idempotency-Key', key)
      .send({ funcionId, cantidad: 2 })
      .expect(201);

    const r2 = await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', cuentaId)
      .set('Idempotency-Key', key)
      .send({ funcionId, cantidad: 2 })
      .expect(201);

    expect(r2.body.pedido.id).toBe(r1.body.pedido.id);

    const webhook = {
      pedidoId: r1.body.pedido.id,
      referenciaProveedor: 'prov-dup-1',
      resultado: 'aprobado',
      importeCentavos: 1000,
    };
    const firma = firmarWebhookTest(webhook);
    await ctx.http().post('/api/boleteria/pagos/webhook').set('x-firma-proveedor', firma).send(webhook).expect(200);
    await ctx.http().post('/api/boleteria/pagos/webhook').set('x-firma-proveedor', firma).send(webhook).expect(200);

    expect(await ctx.db.pedidoBoleteria.count()).toBe(1);
    expect(await ctx.db.entradaBoleteria.count()).toBe(2);
    expect(await ctx.db.movimientoPago.count({ where: { tipo: 'cobro' } })).toBe(1);
  });

  it('US1-AS5 y US1-AS6: retención expira a 10 min y pago tardío emite si hay cupo o reembolsa si se agotó', async () => {
    const { funcionId } = await ctx.sembrarFuncion({ aforoHabilitado: 2 });
    const cuentaA = randomUUID();
    const cuentaB = randomUUID();

    // A retiene 2 lugares (deja 0)
    const pA = await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', cuentaA)
      .set('Idempotency-Key', `exp-a-${randomUUID()}`)
      .send({ funcionId, cantidad: 2 })
      .expect(201);

    // Avanzar 11 minutos -> expira
    ctx.relojRef.ahora = new Date('2026-11-14T12:11:00-05:00');
    expect(await ctx.expirarRetenciones.ejecutar()).toBe(1);

    const dispTrasExp = await ctx.http().get(`/api/boleteria/funciones/${funcionId}/disponibilidad`).expect(200);
    expect(dispTrasExp.body.lugaresDisponibles).toBe(2);

    // B compra y paga los 2 lugares restantes
    const pB = await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', cuentaB)
      .set('Idempotency-Key', `exp-b-${randomUUID()}`)
      .send({ funcionId, cantidad: 2 })
      .expect(201);
    const whB = { pedidoId: pB.body.pedido.id, referenciaProveedor: 'ref-b', resultado: 'aprobado', importeCentavos: 1000 };
    await ctx.http().post('/api/boleteria/pagos/webhook').set('x-firma-proveedor', firmarWebhookTest(whB)).send(whB).expect(200);

    // Llega webhook tardío para A sin cupo -> devolución automática + PedidoReembolsado
    const whA = { pedidoId: pA.body.pedido.id, referenciaProveedor: 'ref-a', resultado: 'aprobado', importeCentavos: 1000 };
    const respTardia = await ctx
      .http()
      .post('/api/boleteria/pagos/webhook')
      .set('x-firma-proveedor', firmarWebhookTest(whA))
      .send(whA)
      .expect(200);
    expect(respTardia.body.estadoPedido).toBe('reembolsado');
    expect(ctx.publicador.publicados.some((e) => e.tipo === 'PedidoReembolsado')).toBe(true);
  });

  it('caso borde: proveedor caído responde 503 y libera retención; RN-004 cierra venta a inicio + 30 min', async () => {
    const { funcionId } = await ctx.sembrarFuncion({ aforoHabilitado: 10 });
    ctx.simulador.establecerModo('caido');
    await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', randomUUID())
      .set('Idempotency-Key', `caido-${randomUUID()}`)
      .send({ funcionId, cantidad: 2 })
      .expect(503);

    const disp = await ctx.http().get(`/api/boleteria/funciones/${funcionId}/disponibilidad`).expect(200);
    expect(disp.body.lugaresDisponibles).toBe(10);

    ctx.simulador.establecerModo('normal');
    ctx.relojRef.ahora = new Date('2026-11-14T20:31:00-05:00');
    await ctx
      .http()
      .post('/api/boleteria/pedidos')
      .set('x-cuenta-dev', randomUUID())
      .set('Idempotency-Key', `tarde-${randomUUID()}`)
      .send({ funcionId, cantidad: 1 })
      .expect(422);
  });
});
