import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearAppOperacion, programador, sembrarEdicion } from './app';

// T031: SC-001 bajo concurrencia (ADR-0010). Dos programadores guardan a la vez funciones que chocan.
let ctx: Awaited<ReturnType<typeof crearAppOperacion>>;
beforeAll(async () => (ctx = await crearAppOperacion()));
afterAll(() => ctx.cerrar());

describe('cruces bajo concurrencia', () => {
  it('de N intentos simultáneos en la misma sede y hora se guarda exactamente uno; el resto recibe 409', async () => {
    const ids = await sembrarEdicion(ctx.db);
    const intentos = Array.from({ length: 8 }, (_, i) =>
      ctx
        .http()
        .post(`/api/operacion/ediciones/${ids.edicion}/funciones`)
        .set(programador())
        .send({
          obraId: i % 2 === 0 ? ids.cura : ids.zombi,
          sedeId: ids.bolivar,
          inicio: `2026-11-14T20:${String(i).padStart(2, '0')}:00-05:00`,
          tipoAcceso: 'pagada',
          publico: 'familiar',
          aforoHabilitado: 100,
        }),
    );
    const respuestas = await Promise.all(intentos);
    const estados = respuestas.map((r) => r.status).sort();
    // Un interbloqueo de PostgreSQL entre guardados simultáneos nunca debe salir como 500.
    expect(respuestas.filter((r) => r.status !== 201 && r.status !== 409).map((r) => r.body)).toEqual([]);
    expect(estados.filter((s) => s === 201)).toHaveLength(1);
    expect(estados.filter((s) => s === 409)).toHaveLength(7);
    for (const r of respuestas.filter((x) => x.status === 409)) expect(['cruce_sede', 'cruce_elenco']).toContain(r.body.codigo);
    const activos = await ctx.db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM operacion.bloque_ocupacion WHERE sede_id = $1::uuid AND activo`,
      ids.bolivar,
    );
    expect(activos[0]!.n).toBe(1);
  });
});
