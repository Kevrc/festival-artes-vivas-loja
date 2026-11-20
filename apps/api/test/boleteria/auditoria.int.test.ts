import { randomUUID } from 'node:crypto';
import { ejemplo } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CancelarReserva } from '../../src/modules/boleteria/application/reservas/reservas-servicios';
import { crearAppBoleteria } from './app';

// Hallazgos de la auditoría del repositorio
let ctx: Awaited<ReturnType<typeof crearAppBoleteria>>;
beforeAll(async () => (ctx = await crearAppBoleteria()));
afterAll(() => ctx.cerrar());
beforeEach(async () => {
  ctx.relojRef.ahora = new Date('2026-11-14T12:00:00-05:00');
  await ctx.limpiarTodo();
});

const taquilla = (cuenta: string, sedeId: string) => ({ 'x-cuenta-dev': cuenta, 'x-rol-dev': 'taquilla', 'x-sede-dev': sedeId });

describe('auditoría #2: devolución en taquilla con doble clic', () => {
  it('solo sale efectivo una vez y el inventario resta una vez', async () => {
    const f = await ctx.sembrarFuncion({ aforoHabilitado: 10 });
    const vendedor = randomUUID();
    const caja = await ctx.http().post('/api/boleteria/taquilla/cajas').set(taquilla(vendedor, f.sedeId)).send({ sedeId: f.sedeId, fondoInicialCentavos: 0 }).expect(201);
    const venta = await ctx
      .http()
      .post('/api/boleteria/taquilla/ventas')
      .set(taquilla(vendedor, f.sedeId))
      .set('Idempotency-Key', `venta-${randomUUID()}`)
      .send({ cajaId: caja.body.id, funcionId: f.funcionId, cantidad: 2, medioPago: 'efectivo' })
      .expect(201);
    await ctx.aplicar.ejecutar(ejemplo.funcionCancelada(f.edicionId, { funcionId: f.funcionId, version: 2 }));

    const devolver = () =>
      ctx
        .http()
        .post('/api/boleteria/taquilla/devoluciones')
        .set(taquilla(vendedor, f.sedeId))
        .send({ cajaId: caja.body.id, codigoEntrada: venta.body.entradas[0].codigoCorto });
    const estados = (await Promise.all([devolver(), devolver()])).map((r) => r.status).sort();
    expect(estados).toEqual([200, 422]);

    const egresos = await ctx.db.movimientoCaja.count({ where: { cajaId: caja.body.id, tipo: 'egreso_devolucion' } });
    expect(egresos).toBe(1);
    const inv = await ctx.db.inventarioFuncion.findUniqueOrThrow({ where: { funcionId: f.funcionId } });
    expect(inv.emitidos).toBe(await ctx.db.entradaBoleteria.count({ where: { funcionId: f.funcionId, estado: 'valida' } }));
  });
});

describe('auditoría #3: cancelar una reserva mientras se liberan las reservas', () => {
  it('los lugares emitidos se restan una sola vez', async () => {
    const f = await ctx.sembrarFuncion({ aforoHabilitado: 20, tipoAcceso: 'gratuita_reserva' });
    const cuenta = randomUUID();
    const reservar = (c: string) =>
      ctx.http().post('/api/boleteria/reservas').set('x-cuenta-dev', c).set('Idempotency-Key', `res-${randomUUID()}`).send({ funcionId: f.funcionId, cantidad: 2 }).expect(201);
    const a = await reservar(cuenta);
    const b = await reservar(randomUUID());
    // B ya entró: sus 2 entradas siguen contando y la liberación no las toca (así una resta de más no
    // queda oculta por GREATEST(0, …))
    await ctx.db.entradaBoleteria.updateMany({ where: { pedidoId: b.body.id }, data: { estado: 'usada' } });
    ctx.relojRef.ahora = new Date('2026-11-14T19:50:00-05:00'); // 10 min antes: se liberan

    // Orden forzado: la cancelación lee las entradas válidas, la liberación las cambia y después
    // la cancelación escribe. Un candado sobre las entradas de A hace esperar a las dos.
    let soltar!: () => void;
    const candado = new Promise<void>((r) => (soltar = r));
    let bloqueado!: () => void;
    const listo = new Promise<void>((r) => (bloqueado = r));
    const bloqueo = ctx.db.$transaction(async (t) => {
      await t.$queryRaw`SELECT "id" FROM "boleteria"."entrada" WHERE "pedido_id" = ${a.body.id}::uuid FOR UPDATE`;
      bloqueado();
      await candado;
    });
    await listo;
    const liberar = ctx.liberarReservas.ejecutar();
    await new Promise((r) => setTimeout(r, 300));
    const cancelar = ctx.app.get(CancelarReserva).ejecutar({ pedidoId: a.body.id, cuentaId: cuenta });
    await new Promise((r) => setTimeout(r, 300));
    soltar();
    await bloqueo;
    await Promise.allSettled([liberar, cancelar]);

    const inv = await ctx.db.inventarioFuncion.findUniqueOrThrow({ where: { funcionId: f.funcionId } });
    const vigentes = await ctx.db.entradaBoleteria.count({ where: { funcionId: f.funcionId, estado: { in: ['valida', 'usada'] } } });
    expect(inv.emitidos).toBe(vigentes);
  });
});
