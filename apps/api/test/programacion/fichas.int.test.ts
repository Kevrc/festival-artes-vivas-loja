import { ejemplo } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from './app';
import { datosFuncion, edicion2026, limpiar, nuevoId } from './fixtures';

let ctx: Awaited<ReturnType<typeof crearApp>>;
beforeAll(async () => (ctx = await crearApp()));
afterAll(() => ctx.cerrar());
beforeEach(() => limpiar(ctx.db));

async function sembrarCometa(publicar = true) {
  const edicionId = nuevoId();
  const obraId = nuevoId();
  const sedeId = nuevoId();
  const base = { edicionId, obraId, sedeId, titulo: 'Cometa', elenco: 'Roser López Espinosa', pais: 'España', disciplina: 'danza' as const, sedeNombre: 'Centro Cultural Alfredo Mora Reyes' };
  await ctx.aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ ...base, inicio: '2026-11-15T19:30:00-05:00', fin: '2026-11-15T20:25:00-05:00' })));
  await ctx.aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ ...base, inicio: '2026-11-15T17:00:00-05:00', fin: '2026-11-15T17:55:00-05:00' })));
  if (publicar) await ctx.aplicar.ejecutar(edicion2026(edicionId));
  const elencoId = (await ctx.db.obraCartelera.findUniqueOrThrow({ where: { id: obraId } })).elencoId;
  return { obraId, sedeId, elencoId };
}

describe('fichas (US3)', () => {
  it('US3-AS1: la ficha de Cometa lista sus dos funciones en orden con su sede', async () => {
    const { obraId, sedeId } = await sembrarCometa();
    const r = await ctx.http().get(`/api/cartelera/obras/${obraId}`).expect(200);
    expect(r.body).toMatchObject({ titulo: 'Cometa', disciplina: 'danza', duracionMin: 90, elenco: { pais: 'España' } });
    expect(r.body.funciones.map((f: { inicio: string }) => f.inicio)).toEqual(['2026-11-15T22:00:00.000Z', '2026-11-16T00:30:00.000Z']);
    expect(r.body.funciones[0].sede.id).toBe(sedeId);
  });

  it('US3-AS2: la ficha de sede declara la accesibilidad cargada y sus funciones', async () => {
    const { sedeId } = await sembrarCometa();
    const r = await ctx.http().get(`/api/cartelera/sedes/${sedeId}`).expect(200);
    expect(r.body).toMatchObject({ nombre: 'Centro Cultural Alfredo Mora Reyes', accesibilidad: { sillaRuedas: true } });
    expect(r.body.funciones).toHaveLength(2);
  });

  it('la ficha de elenco lista sus obras', async () => {
    const { elencoId } = await sembrarCometa();
    const r = await ctx.http().get(`/api/cartelera/elencos/${elencoId}`).expect(200);
    expect(r.body).toMatchObject({ nombre: 'Roser López Espinosa', pais: 'España', obras: [{ titulo: 'Cometa' }] });
  });

  it('404 si la edición está en borrador y 400 si el id no es uuid', async () => {
    const { obraId, sedeId, elencoId } = await sembrarCometa(false);
    await ctx.http().get(`/api/cartelera/obras/${obraId}`).expect(404);
    await ctx.http().get(`/api/cartelera/sedes/${sedeId}`).expect(404);
    await ctx.http().get(`/api/cartelera/elencos/${elencoId}`).expect(404);
    await ctx.http().get('/api/cartelera/obras/no-es-uuid').expect(400);
  });
});
