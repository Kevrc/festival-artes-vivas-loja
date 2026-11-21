import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearAppOperacion, programador, sembrarEdicion } from './app';

// T032: US1-AS5 — una obra seleccionada en convocatoria aparece con su ficha técnica.
let ctx: Awaited<ReturnType<typeof crearAppOperacion>>;
beforeAll(async () => (ctx = await crearAppOperacion()));
afterAll(() => ctx.cerrar());

describe('PostulacionSeleccionada (contrato provisional de 003)', () => {
  it('crea elenco y obra con ficha técnica una sola vez aunque el evento llegue dos veces', async () => {
    const ids = await sembrarEdicion(ctx.db);
    const { MANEJADORES_OPERACION } = await import('../../src/modules/operacion/application/puertos');
    const manejadores = ctx.app.get<{ tipo: string; manejar(e: unknown): Promise<void> }[]>(MANEJADORES_OPERACION);
    const manejador = manejadores.find((m) => m.tipo === 'PostulacionSeleccionada')!;
    const postulacionId = randomUUID();
    const obraId = randomUUID();
    const evento = {
      id: randomUUID(),
      tipo: 'PostulacionSeleccionada',
      version: 1,
      ocurridoEn: '2026-09-01T10:00:00-05:00',
      edicionId: ids.edicion,
      correlacionId: randomUUID(),
      datos: {
        postulacionId,
        convocatoriaId: randomUUID(),
        cuentaPostulanteId: randomUUID(),
        numero: 'FIAVL-2026-0042',
        componente: 'camino_a_loja',
        provincia: 'Zamora Chinchipe',
        obra: {
          id: obraId, titulo: 'Raíces del sur', sinopsis: 'Danza de la Amazonía', disciplina: 'danza', duracionMin: 50, edadMinima: 0,
          imagenes: [], fichaArtistica: [{ rol: 'Coreografía', nombre: 'Colectivo Yantzaza' }],
          fichaTecnica: { montajeMin: 40, desmontajeMin: 20, requerimientos: ['Linóleo', 'Sonido estéreo'] },
        },
        elenco: { id: randomUUID(), nombre: 'Colectivo Yantzaza', pais: 'Ecuador' },
      },
    };
    await manejador.manejar(evento);
    await manejador.manejar(evento);
    await manejador.manejar({ ...evento, id: randomUUID() }); // mismo contenido, otro evento

    expect(await ctx.db.obraOperacion.count({ where: { postulacionId } })).toBe(1);
    const r = await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}/obras?origen=convocatoria`).set(programador());
    expect(r.status).toBe(200);
    expect(r.body).toEqual([
      expect.objectContaining({
        id: obraId,
        titulo: 'Raíces del sur',
        origen: 'convocatoria',
        componente: 'camino_a_loja',
        fichaTecnica: { montajeMin: 40, desmontajeMin: 20, requerimientos: ['Linóleo', 'Sonido estéreo'], provincia: 'Zamora Chinchipe' },
        elenco: expect.objectContaining({ nombre: 'Colectivo Yantzaza' }),
      }),
    ]);
  });
});
