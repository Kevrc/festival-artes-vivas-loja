import { ejemplo } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from './app';
import { datosFuncion, edicion2026, limpiar, nuevoId } from './fixtures';

let ctx: Awaited<ReturnType<typeof crearApp>>;
// Antes del festival: la edición 2026 es la próxima
beforeAll(async () => (ctx = await crearApp({ ahora: () => new Date('2026-10-01T12:00:00-05:00') })));
afterAll(() => ctx.cerrar());
beforeEach(() => limpiar(ctx.db));

async function sembrar() {
  const edicionId = nuevoId();
  const temprano = nuevoId();
  const tarde = nuevoId();
  const expo = nuevoId();
  await ctx.aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId: tarde, titulo: 'Tarde', inicio: '2026-11-14T20:00:00-05:00', fin: '2026-11-14T21:00:00-05:00' })));
  await ctx.aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId: temprano, titulo: 'Temprano', inicio: '2026-11-14T17:00:00-05:00', fin: '2026-11-14T18:00:00-05:00' })));
  await ctx.aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId: expo, titulo: 'Buddy Bears', continua: true, tipoAcceso: 'gratuita_libre', aforoHabilitado: null, inicio: '2026-11-12T09:00:00-05:00', fin: '2026-11-22T17:00:00-05:00', disciplina: 'exposicion' })));
  return { edicionId, temprano, tarde, expo };
}

describe('GET /api/cartelera/dias/{fecha}', () => {
  it('US1-AS1: lista las funciones del día por hora con sus datos', async () => {
    const { edicionId, temprano, tarde } = await sembrar();
    await ctx.aplicar.ejecutar(edicion2026(edicionId));
    const r = await ctx.http().get('/api/cartelera/dias/2026-11-14').expect(200);
    const ids = r.body.funciones.map((f: { id: string }) => f.id);
    expect(ids.indexOf(temprano)).toBeLessThan(ids.indexOf(tarde));
    const f = r.body.funciones.find((x: { id: string }) => x.id === temprano);
    expect(f).toMatchObject({ tipoAcceso: 'pagada', estado: 'programada', obra: { titulo: 'Temprano', elenco: { pais: 'Ecuador' } }, sede: { nombre: 'Teatro Bolívar' } });
    expect(r.headers['cache-control']).toContain('s-maxage=60');
    expect(r.headers.etag).toBeTruthy();
  });

  it('incluye la exposición continua en cada día de su intervalo', async () => {
    const { edicionId, expo } = await sembrar();
    await ctx.aplicar.ejecutar(edicion2026(edicionId));
    const r = await ctx.http().get('/api/cartelera/dias/2026-11-18').expect(200);
    expect(r.body.funciones.map((f: { id: string }) => f.id)).toEqual([expo]);
  });

  it('RN-001 / US1-AS6: una edición en borrador no es visible', async () => {
    await sembrar();
    await ctx.http().get('/api/cartelera/dias/2026-11-14').expect(404);
  });

  it('rechaza una fecha mal formada con problem+json', async () => {
    const r = await ctx.http().get('/api/cartelera/dias/14-11-2026').expect(400);
    expect(r.headers['content-type']).toContain('application/problem+json');
  });
});

describe('GET /api/cartelera/ediciones/actual', () => {
  it('US1-AS2: fuera del festival sugiere el primer día de la próxima edición, con facetas', async () => {
    const { edicionId } = await sembrar();
    await ctx.aplicar.ejecutar(edicion2026(edicionId));
    const r = await ctx.http().get('/api/cartelera/ediciones/actual').expect(200);
    expect(r.body).toMatchObject({ id: edicionId, numero: 'XI', diaSugerido: '2026-11-12' });
    expect(r.body.facetas.disciplinas).toEqual(expect.arrayContaining(['teatro', 'exposicion']));
    expect(r.body.facetas.paises).toEqual(['Ecuador']);
  });

  it('404 si no hay ediciones publicadas', async () => {
    await ctx.http().get('/api/cartelera/ediciones/actual').expect(404);
  });
});
