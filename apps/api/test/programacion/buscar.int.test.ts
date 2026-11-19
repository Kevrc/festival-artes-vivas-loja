import { ejemplo } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from './app';
import { datosFuncion, edicion2026, limpiar, nuevoId } from './fixtures';

let ctx: Awaited<ReturnType<typeof crearApp>>;
beforeAll(async () => (ctx = await crearApp()));
afterAll(() => ctx.cerrar());
beforeEach(() => limpiar(ctx.db));

async function sembrar(publicar = true) {
  const edicionId = nuevoId();
  await ctx.aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, titulo: 'Zombi Manifiesto', elenco: 'Santiago Sanguineti', pais: 'Uruguay' })));
  await ctx.aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, titulo: 'La Artista', elenco: 'Los Nadies Circo', pais: 'Chile' })));
  if (publicar) await ctx.aplicar.ejecutar(edicion2026(edicionId));
}

describe('GET /api/cartelera/buscar', () => {
  it.each(['zombi', 'ZOMBÍ', 'manifies', 'sanguineti'])('US2-AS2: "%s" encuentra Zombi Manifiesto', async (q) => {
    await sembrar();
    const r = await ctx.http().get('/api/cartelera/buscar').query({ q }).expect(200);
    expect(r.body[0]).toMatchObject({ titulo: 'Zombi Manifiesto', elenco: { pais: 'Uruguay' } });
    expect(r.body[0].funciones).toHaveLength(1);
  });

  it('no devuelve obras de ediciones no publicadas', async () => {
    await sembrar(false);
    expect((await ctx.http().get('/api/cartelera/buscar').query({ q: 'zombi' }).expect(200)).body).toEqual([]);
  });

  it('rechaza consultas de menos de 2 o más de 80 caracteres', async () => {
    await ctx.http().get('/api/cartelera/buscar').query({ q: 'z' }).expect(400);
    await ctx.http().get('/api/cartelera/buscar').query({ q: 'z'.repeat(81) }).expect(400);
  });
});
