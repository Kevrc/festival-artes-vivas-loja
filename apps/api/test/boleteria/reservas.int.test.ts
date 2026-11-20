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

describe('reservas gratuitas con aforo (T038: US3-AS1..AS5, FR-013, RN-007)', () => {
  it('US3-AS1 y US3-AS4: reserva gratuita sin pago y límite de 4 por persona y función', async () => {
    const { funcionId } = await ctx.sembrarFuncion({ tipoAcceso: 'gratuita_reserva', aforoHabilitado: 300 });
    const cuentaId = randomUUID();

    const r1 = await ctx
      .http()
      .post('/api/boleteria/reservas')
      .set('x-cuenta-dev', cuentaId)
      .set('Idempotency-Key', `res-1-${randomUUID()}`)
      .send({ funcionId, cantidad: 4 })
      .expect(201);
    expect(r1.body.estado).toBe('confirmado');
    expect(r1.body.importeCentavos).toBe(0);
    expect(r1.body.entradas).toHaveLength(4);

    // Intenta reservar 1 más (supera límite de 4)
    await ctx
      .http()
      .post('/api/boleteria/reservas')
      .set('x-cuenta-dev', cuentaId)
      .set('Idempotency-Key', `res-2-${randomUUID()}`)
      .send({ funcionId, cantidad: 1 })
      .expect(422);

    const disp = await ctx.http().get(`/api/boleteria/funciones/${funcionId}/disponibilidad`).expect(200);
    expect(disp.body.lugaresDisponibles).toBe(296);
  });

  it('US3-AS3: función gratuita de acceso libre rechaza reserva', async () => {
    const { funcionId } = await ctx.sembrarFuncion({ tipoAcceso: 'gratuita_libre', aforoHabilitado: null });
    await ctx
      .http()
      .post('/api/boleteria/reservas')
      .set('x-cuenta-dev', randomUUID())
      .set('Idempotency-Key', `libre-${randomUUID()}`)
      .send({ funcionId, cantidad: 1 })
      .expect(422);
  });

  it('US3-AS5 y US3-AS2 (FR-013): cancelación voluntaria y liberación automática 10 min antes', async () => {
    const { funcionId } = await ctx.sembrarFuncion({
      tipoAcceso: 'gratuita_reserva',
      aforoHabilitado: 100,
      inicio: '2026-11-14T20:00:00-05:00',
      fin: '2026-11-14T21:00:00-05:00',
    });
    const cuentaA = randomUUID();
    const cuentaB = randomUUID();

    const resA = await ctx
      .http()
      .post('/api/boleteria/reservas')
      .set('x-cuenta-dev', cuentaA)
      .set('Idempotency-Key', `canc-a-${randomUUID()}`)
      .send({ funcionId, cantidad: 2 })
      .expect(201);

    await ctx
      .http()
      .post(`/api/boleteria/pedidos/${resA.body.id}/cancelar-reserva`)
      .set('x-cuenta-dev', cuentaA)
      .expect(200);

    await ctx
      .http()
      .post('/api/boleteria/reservas')
      .set('x-cuenta-dev', cuentaB)
      .set('Idempotency-Key', `lib-b-${randomUUID()}`)
      .send({ funcionId, cantidad: 3 })
      .expect(201);

    // 10 minutos antes del inicio -> libera reservas no validadas de B
    ctx.relojRef.ahora = new Date('2026-11-14T19:50:00-05:00');
    const liberadas = await ctx.liberarReservas.ejecutar();
    expect(liberadas).toBe(3);

    const disp = await ctx.http().get(`/api/boleteria/funciones/${funcionId}/disponibilidad`).expect(200);
    expect(disp.body.lugaresDisponibles).toBe(100);
  });

  it('RN-007: función restringida exige condición estudiante acreditada en web', async () => {
    const { funcionId } = await ctx.sembrarFuncion({ tipoAcceso: 'restringida', aforoHabilitado: 40 });
    const cuenta = randomUUID();

    await ctx
      .http()
      .post('/api/boleteria/reservas')
      .set('x-cuenta-dev', cuenta)
      .set('x-estudiante-dev', 'false')
      .set('Idempotency-Key', `rest-no-${randomUUID()}`)
      .send({ funcionId, cantidad: 1 })
      .expect(403);

    await ctx
      .http()
      .post('/api/boleteria/reservas')
      .set('x-cuenta-dev', cuenta)
      .set('x-estudiante-dev', 'true')
      .set('Idempotency-Key', `rest-si-${randomUUID()}`)
      .send({ funcionId, cantidad: 1 })
      .expect(201);
  });
});
