import { ejemplo } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from './app';
import { datosFuncion, edicion2026, limpiar, nuevoId } from './fixtures';

const AHORA = new Date('2026-11-14T12:00:00-05:00');
let ctx: Awaited<ReturnType<typeof crearApp>>;
beforeAll(async () => (ctx = await crearApp({ ahora: () => AHORA })));
afterAll(() => ctx.cerrar());
beforeEach(() => limpiar(ctx.db));

describe('GET /api/cartelera/disponibilidad', () => {
  it('US1-AS5 y RN-002: agotado, últimos lugares y desconocida si tiene más de 5 min', async () => {
    const edicionId = nuevoId();
    const [agotada, ultimos, vieja, libre] = [nuevoId(), nuevoId(), nuevoId(), nuevoId()];
    for (const id of [agotada, ultimos, vieja]) await ctx.aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId: id })));
    await ctx.aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId: libre, tipoAcceso: 'gratuita_libre', aforoHabilitado: null })));
    await ctx.aplicar.ejecutar(edicion2026(edicionId));
    const reciente = new Date(AHORA.getTime() - 60_000).toISOString();
    const antigua = new Date(AHORA.getTime() - 6 * 60_000).toISOString();
    await ctx.aplicar.ejecutar(ejemplo.disponibilidadCambiada(edicionId, { funcionId: agotada, lugaresRestantes: 0, aforoHabilitado: 300, calculadoEn: reciente }));
    await ctx.aplicar.ejecutar(ejemplo.disponibilidadCambiada(edicionId, { funcionId: ultimos, lugaresRestantes: 30, aforoHabilitado: 300, calculadoEn: reciente }));
    await ctx.aplicar.ejecutar(ejemplo.disponibilidadCambiada(edicionId, { funcionId: vieja, lugaresRestantes: 200, aforoHabilitado: 300, calculadoEn: antigua }));

    const r = await ctx.http().get('/api/cartelera/disponibilidad?fecha=2026-11-14').expect(200);
    const nivel = Object.fromEntries(r.body.items.map((i: { funcionId: string; nivel: string }) => [i.funcionId, i.nivel]));
    expect(nivel).toEqual({ [agotada]: 'agotado', [ultimos]: 'ultimos_lugares', [vieja]: 'desconocida', [libre]: 'no_aplica' });
    expect(r.body.version).toBeTruthy();
    expect(r.headers['cache-control']).toContain('s-maxage=15');
  });

  it('la versión del día cambia con la programación, no con la disponibilidad', async () => {
    const edicionId = nuevoId();
    const id = nuevoId();
    await ctx.aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId: id })));
    await ctx.aplicar.ejecutar(edicion2026(edicionId));
    const v1 = (await ctx.http().get('/api/cartelera/disponibilidad?fecha=2026-11-14')).body.version;
    await ctx.aplicar.ejecutar(ejemplo.disponibilidadCambiada(edicionId, { funcionId: id, lugaresRestantes: 3, aforoHabilitado: 300, calculadoEn: AHORA.toISOString() }));
    expect((await ctx.http().get('/api/cartelera/disponibilidad?fecha=2026-11-14')).body.version).toBe(v1);
    await ctx.aplicar.ejecutar(ejemplo.funcionCancelada(edicionId, { funcionId: id, version: 2 }));
    expect((await ctx.http().get('/api/cartelera/disponibilidad?fecha=2026-11-14')).body.version).not.toBe(v1);
  });

  it('400 sin fecha válida', () => ctx.http().get('/api/cartelera/disponibilidad').expect(400));
});
