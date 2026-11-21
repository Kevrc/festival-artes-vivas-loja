import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearAppOperacion, conRol, programador, sembrarEdicion } from './app';

// T030: US1 por HTTP contra PostgreSQL real.
let ctx: Awaited<ReturnType<typeof crearAppOperacion>>;
let ids: Awaited<ReturnType<typeof sembrarEdicion>>;
beforeAll(async () => (ctx = await crearAppOperacion()));
afterAll(() => ctx.cerrar());
beforeEach(async () => (ids = await sembrarEdicion(ctx.db)));

const crear = (cuerpo: Record<string, unknown>, headers: Record<string, string> = programador()) =>
  ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/funciones`).set(headers).send(cuerpo);
const funcion = (obraId: string, sedeId: string, inicio: string, extra: Record<string, unknown> = {}) => ({
  obraId,
  sedeId,
  inicio,
  tipoAcceso: 'pagada',
  publico: 'familiar',
  aforoHabilitado: 300,
  ...extra,
});

describe('US1 — programar funciones en la grilla', () => {
  it('US1-AS1: "El Cura sin cabeza" (90 min) a las 20:00 queda en borrador con fin 21:30', async () => {
    const r = await crear(funcion(ids.cura, ids.nacional, '2026-11-12T20:00:00-05:00'));
    expect(r.status).toBe(201);
    expect(r.headers.etag).toBe('"1"');
    expect(r.body).toMatchObject({ estado: 'borrador', fin: '2026-11-13T02:30:00.000Z', obraTitulo: 'El Cura sin cabeza', version: 1 });
  });

  it('US1-AS2: a las 21:15 choca con la función de 19:00–21:00 (montaje 30) y se muestra; a las 21:30 se acepta', async () => {
    // Zombi Manifiesto dura 120 min: 19:00–21:00 en el Teatro Bolívar.
    expect((await crear(funcion(ids.zombi, ids.bolivar, '2026-11-13T19:00:00-05:00'))).status).toBe(201);
    const choque = await crear(funcion(ids.cura, ids.bolivar, '2026-11-13T21:15:00-05:00'));
    expect(choque.status).toBe(409);
    expect(choque.body.codigo).toBe('cruce_sede');
    expect(choque.body.conflictos).toEqual([
      expect.objectContaining({ tipo: 'sede', obraTitulo: 'Zombi Manifiesto', sedeNombre: 'Teatro Bolívar', libreDesde: '2026-11-14T02:30:00.000Z' }),
    ]);
    expect((await crear(funcion(ids.cura, ids.bolivar, '2026-11-13T21:30:00-05:00'))).status).toBe(201);
  });

  it('US1-AS3: aforo habilitado 900 en una sede de 800 se rechaza', async () => {
    const r = await crear(funcion(ids.cura, ids.nacional, '2026-11-14T20:00:00-05:00', { aforoHabilitado: 900 }));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: 'aforo_supera_sede', aforoSede: 800 });
  });

  it('US1-AS4: el mismo elenco no puede estar en dos sedes a la vez', async () => {
    expect((await crear(funcion(ids.zombi, ids.bolivar, '2026-11-15T19:00:00-05:00'))).status).toBe(201);
    // Desistida es del mismo elenco pero no programable; usamos una obra nueva del mismo elenco.
    const otra = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/obras`).set(programador()).send({
      titulo: 'Segunda obra', sinopsis: '', disciplina: 'teatro', componente: 'internacional', duracionMin: 60, edadMinima: 0,
      elenco: { id: ids.otroElenco, nombre: 'Santiago Sanguineti', pais: 'Uruguay' },
    });
    expect(otra.status).toBe(201);
    const r = await crear(funcion(otra.body.id, ids.nacional, '2026-11-15T20:00:00-05:00'));
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('cruce_elenco');
    expect(r.body.conflictos[0]).toMatchObject({ tipo: 'elenco', sedeNombre: 'Teatro Bolívar' });
  });

  it('FR-013: dos ediciones con la misma versión ⇒ la segunda recibe 412 con la versión vigente', async () => {
    const creada = await crear(funcion(ids.cura, ids.nacional, '2026-11-16T20:00:00-05:00'));
    const url = `/api/operacion/funciones/${creada.body.id}`;
    const primera = await ctx.http().patch(url).set(programador()).set('If-Match', '"1"').send({ aforoHabilitado: 500 });
    expect(primera.status).toBe(200);
    expect(primera.headers.etag).toBe('"2"');
    const segunda = await ctx.http().patch(url).set(programador()).set('If-Match', '"1"').send({ aforoHabilitado: 600 });
    expect(segunda.status).toBe(412);
    expect(segunda.body).toMatchObject({ codigo: 'version_obsoleta', version: 2 });
    expect((await ctx.http().patch(url).set(programador()).send({ publico: 'adultos' })).status).toBe(428);
  });

  it('RN-002: el fin solo se alarga; al mover el inicio se recalcula', async () => {
    const creada = await crear(funcion(ids.cura, ids.nacional, '2026-11-17T20:00:00-05:00'));
    const url = `/api/operacion/funciones/${creada.body.id}`;
    const corto = await ctx.http().patch(url).set(programador()).set('If-Match', '"1"').send({ fin: '2026-11-17T21:00:00-05:00' });
    expect(corto.status).toBe(400);
    expect(corto.body.codigo).toBe('fin_menor');
    const largo = await ctx.http().patch(url).set(programador()).set('If-Match', '"1"').send({ fin: '2026-11-17T21:45:00-05:00' });
    expect(largo.body.fin).toBe('2026-11-18T02:45:00.000Z');
  });

  it('obra desistida no se programa; borrador se elimina con su versión', async () => {
    const desistida = await crear(funcion(ids.desistida, ids.nacional, '2026-11-18T20:00:00-05:00'));
    expect(desistida.body.codigo).toBe('obra_desistida');
    const creada = await crear(funcion(ids.cura, ids.nacional, '2026-11-18T20:00:00-05:00'));
    const url = `/api/operacion/funciones/${creada.body.id}`;
    expect((await ctx.http().delete(url).set(programador()).set('If-Match', '"1"')).status).toBe(204);
    expect((await ctx.http().get(url).set(programador())).status).toBe(404);
    // La sede queda libre tras eliminar el borrador
    expect((await crear(funcion(ids.cura, ids.nacional, '2026-11-18T20:00:00-05:00'))).status).toBe(201);
  });

  it('grilla del día: sedes como columnas, funciones del día (incluida la que cruza medianoche) y feriado informativo', async () => {
    await crear(funcion(ids.cura, ids.nacional, '2026-11-20T23:30:00-05:00'));
    await crear(funcion(ids.zombi, ids.bolivar, '2026-11-21T19:00:00-05:00'));
    const r = await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}/grilla?fecha=2026-11-20`).set(conRol('direccion'));
    expect(r.status).toBe(200);
    expect(r.body.feriado).toBe('Feriado nacional');
    expect(r.body.sedes.map((s: { nombre: string }) => s.nombre)).toEqual(['Plaza San Sebastián', 'Teatro Bolívar', 'Teatro Nacional']);
    expect(r.body.funciones.map((f: { obraTitulo: string }) => f.obraTitulo)).toEqual(['El Cura sin cabeza']);
    expect(r.body.sedes[0].accesibilidad).toEqual({ sillaRuedas: true, banoAccesible: true, rampa: true });
  });

  it('autorización en el servidor: sin sesión 401; taquilla no programa (403); dirección solo lee', async () => {
    const cuerpo = funcion(ids.cura, ids.nacional, '2026-11-19T20:00:00-05:00');
    expect((await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/funciones`).send(cuerpo)).status).toBe(401);
    expect((await crear(cuerpo, conRol(`taquilla@sede:${ids.bolivar}`))).status).toBe(403);
    expect((await crear(cuerpo, conRol('direccion'))).status).toBe(403);
  });

  it('edición cerrada: solo lectura (RN-007)', async () => {
    const cerrada = await sembrarEdicion(ctx.db, { estado: 'cerrada' });
    const r = await ctx.http().post(`/api/operacion/ediciones/${cerrada.edicion}/funciones`).set(programador())
      .send(funcion(cerrada.cura, cerrada.nacional, '2026-11-12T20:00:00-05:00'));
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('edicion_cerrada');
  });

  it('Constitución IX: crear y editar quedan en la auditoría con actor y correlación', async () => {
    const actor = '5f0c3a2e-9d1b-4c7e-8a6f-000000000001';
    const correlacion = '5f0c3a2e-9d1b-4c7e-8a6f-0000000000c0';
    const r = await crear(funcion(ids.cura, ids.nacional, '2026-11-21T20:00:00-05:00'), { ...programador(actor), 'x-correlation-id': correlacion });
    const registros = await ctx.db.auditoriaOperacion.findMany({ where: { entidadId: r.body.id } });
    expect(registros).toEqual([expect.objectContaining({ accion: 'funcion.crear', actorId: actor, correlacionId: correlacion, rol: 'programador' })]);
  });
});

describe('caso borde: cambiar la duración de una obra', () => {
  it('no mueve las funciones y devuelve los cruces recalculados', async () => {
    await crear(funcion(ids.cura, ids.bolivar, '2026-11-13T19:00:00-05:00'));
    await crear(funcion(ids.zombi, ids.bolivar, '2026-11-13T21:00:00-05:00'));
    const obra = await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}/obras?q=Cura`).set(programador());
    const r = await ctx.http().patch(`/api/operacion/obras/${ids.cura}`).set(programador()).set('If-Match', `"${obra.body[0].version}"`).send({
      titulo: 'El Cura sin cabeza', sinopsis: '', disciplina: 'teatro', componente: 'nacional', duracionMin: 120, edadMinima: 0,
      elenco: { id: ids.elenco, nombre: 'Cano Artes Escénicas', pais: 'Ecuador' },
    });
    expect(r.status).toBe(200);
    expect(r.body.obra.duracionMin).toBe(120);
    expect(r.body.conflictos).toEqual([expect.objectContaining({ tipo: 'sede', obraTitulo: 'Zombi Manifiesto' })]);
    const funciones = await ctx.db.funcionOperacion.findMany({ where: { obraId: ids.cura } });
    expect(funciones[0]!.fin.toISOString()).toBe('2026-11-14T01:30:00.000Z');
  });
});
