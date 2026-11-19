import { ejemplo } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from './app';
import { datosFuncion, edicion2026, limpiar, nuevoId } from './fixtures';

const CABECERA_DEV = 'x-cuenta-dev';
let ctx: Awaited<ReturnType<typeof crearApp>>;
const entornoPrevio = process.env.NODE_ENV;
beforeAll(async () => {
  process.env.NODE_ENV = 'development';
  ctx = await crearApp();
});
afterAll(async () => {
  process.env.NODE_ENV = entornoPrevio;
  await ctx.cerrar();
});
beforeEach(() => limpiar(ctx.db));

async function dosFunciones() {
  const edicionId = nuevoId();
  const ids = [nuevoId(), nuevoId()];
  for (const funcionId of ids) await ctx.aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId })));
  await ctx.aplicar.ejecutar(edicion2026(edicionId));
  return ids as [string, string];
}

describe('favoritos (US5)', () => {
  it('US5-AS3: la fusión no duplica e ignora ids inexistentes', async () => {
    const [a, b] = await dosFunciones();
    const cuenta = nuevoId();
    await ctx.http().put(`/api/cartelera/favoritos/${a}`).set(CABECERA_DEV, cuenta).expect(204);
    const r = await ctx.http().post('/api/cartelera/favoritos/fusion').set(CABECERA_DEV, cuenta).send({ funcionIds: [a, b, nuevoId()] }).expect(200);
    expect([...r.body].sort()).toEqual([a, b].sort());
    expect(await ctx.db.favorito.count()).toBe(2);
  });

  it('PUT y DELETE son idempotentes', async () => {
    const [a] = await dosFunciones();
    const cuenta = nuevoId();
    await ctx.http().put(`/api/cartelera/favoritos/${a}`).set(CABECERA_DEV, cuenta).expect(204);
    await ctx.http().put(`/api/cartelera/favoritos/${a}`).set(CABECERA_DEV, cuenta).expect(204);
    expect((await ctx.http().get('/api/cartelera/favoritos').set(CABECERA_DEV, cuenta).expect(200)).body).toEqual([a]);
    await ctx.http().delete(`/api/cartelera/favoritos/${a}`).set(CABECERA_DEV, cuenta).expect(204);
    await ctx.http().delete(`/api/cartelera/favoritos/${a}`).set(CABECERA_DEV, cuenta).expect(204);
    expect((await ctx.http().get('/api/cartelera/favoritos').set(CABECERA_DEV, cuenta).expect(200)).body).toEqual([]);
  });

  it('PUT de una función inexistente es 404', async () => {
    await ctx.http().put(`/api/cartelera/favoritos/${nuevoId()}`).set(CABECERA_DEV, nuevoId()).expect(404);
  });

  it('401 sin sesión', () => ctx.http().get('/api/cartelera/favoritos').expect(401));

  it('S1: la guarda temporal falla cerrada fuera de desarrollo', async () => {
    process.env.NODE_ENV = 'production';
    try {
      await ctx.http().get('/api/cartelera/favoritos').set(CABECERA_DEV, nuevoId()).expect(401);
    } finally {
      process.env.NODE_ENV = 'development';
    }
  });
});
