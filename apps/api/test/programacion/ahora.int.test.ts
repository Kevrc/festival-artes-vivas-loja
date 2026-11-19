import { ejemplo } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from './app';
import { datosFuncion, edicion2026, limpiar, nuevoId } from './fixtures';

const AHORA = new Date('2026-11-14T17:10:00-05:00');
let ctx: Awaited<ReturnType<typeof crearApp>>;
beforeAll(async () => (ctx = await crearApp({ ahora: () => AHORA })));
afterAll(() => ctx.cerrar());
beforeEach(() => limpiar(ctx.db));

describe('GET /api/cartelera/ahora (US4)', () => {
  it('US4-AS1: a las 17:10 incluye la de 17:00 (en curso) y la de 17:45, no la de 19:30 ni canceladas', async () => {
    const edicionId = nuevoId();
    const [encurso, pronto, tarde, cancelada] = [nuevoId(), nuevoId(), nuevoId(), nuevoId()];
    const programar = (funcionId: string, inicio: string, fin: string) =>
      ctx.aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId, inicio, fin })));
    await programar(encurso, '2026-11-14T17:00:00-05:00', '2026-11-14T18:00:00-05:00');
    await programar(pronto, '2026-11-14T17:45:00-05:00', '2026-11-14T18:30:00-05:00');
    await programar(tarde, '2026-11-14T19:30:00-05:00', '2026-11-14T20:30:00-05:00');
    await programar(cancelada, '2026-11-14T17:30:00-05:00', '2026-11-14T18:30:00-05:00');
    await ctx.aplicar.ejecutar(ejemplo.funcionCancelada(edicionId, { funcionId: cancelada, version: 2 }));
    await ctx.aplicar.ejecutar(edicion2026(edicionId));

    const r = await ctx.http().get('/api/cartelera/ahora').expect(200);
    expect(r.body.horaServidor).toBe(AHORA.toISOString());
    expect(r.body.items.map((f: { id: string }) => f.id)).toEqual([encurso, pronto]);
    expect(r.body.items[0].sede.coordenadas).toEqual({ lat: -3.996, lng: -79.201 });
  });
});
