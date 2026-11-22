import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conRol, crearAppOperacion, programador, sembrarEdicion } from './app';

// T119 · US6 — ediciones, sedes y parámetros, contra PostgreSQL real.
let ctx: Awaited<ReturnType<typeof crearAppOperacion>>;
let publicados: { tipo: string; datos: Record<string, unknown> }[];
const admin = conRol('administrador');
beforeAll(async () => {
  ctx = await crearAppOperacion();
  const { PublicadorPgBossOperacion } = await import('../../src/modules/operacion/infrastructure/publicador.pgboss');
  publicados = ctx.app.get(PublicadorPgBossOperacion).publicados as never;
});
afterAll(() => ctx.cerrar());

const anioLibre = () => 3000 + Math.floor(Math.random() * 6000);
const ACC = { sillaRuedas: true, banoAccesible: true, rampa: false };
const sede = (p: Record<string, unknown> = {}) => ({ nombre: `Sala ${randomUUID().slice(0, 6)}`, tipo: 'teatro', direccion: 'Calle Sucre 10-20', lat: -4, lng: -79.2, aforo: 200, accesibilidad: ACC, ...p });

describe('US6 — ediciones, sedes y parámetros', () => {
  it('US6-AS1: la edición nueva copia sedes (con sede_origen_id) y parámetros, no funciones; US6-AS2 advierte fuera de noviembre', async () => {
    const ids = await sembrarEdicion(ctx.db);
    await ctx.db.sedeOperacion.update({ where: { id: ids.plaza }, data: { activa: false } });
    const anio = anioLibre();
    const r = await ctx.http().post('/api/operacion/ediciones').set(admin)
      .send({ numero: 'XII', anio, fechaInicio: `${anio}-10-30`, fechaFin: `${anio}-11-08`, aPartirDe: ids.edicion });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ anio, estado: 'planificacion', precioCentavos: 500, maxPagadasPersona: 6, maxReservasPersona: 4 });
    expect(r.body.advertencias).toEqual([expect.stringContaining('noviembre')]);
    const copiadas = await ctx.db.sedeOperacion.findMany({ where: { edicionId: r.body.id }, orderBy: { nombre: 'asc' } });
    expect(copiadas.map((s) => [s.nombre, s.sedeOrigenId])).toEqual([['Teatro Bolívar', ids.bolivar], ['Teatro Nacional', ids.nacional]]);
    expect(await ctx.db.funcionOperacion.count({ where: { edicionId: r.body.id } })).toBe(0);
    expect(await ctx.db.obraOperacion.count({ where: { edicionId: r.body.id } })).toBe(0);
    expect((await ctx.db.edicionOperacion.findUniqueOrThrow({ where: { id: r.body.id } })).edicionBaseId).toBe(ids.edicion);
    expect(await ctx.db.auditoriaOperacion.count({ where: { accion: 'edicion.creada', entidadId: r.body.id } })).toBe(1);
    // El año es único; sin base hacen falta los parámetros.
    expect((await ctx.http().post('/api/operacion/ediciones').set(admin).send({ numero: 'XII', anio, fechaInicio: `${anio}-11-10`, fechaFin: `${anio}-11-20`, aPartirDe: ids.edicion })).body.codigo).toBe('anio_ocupado');
    const otro = anioLibre();
    expect((await ctx.http().post('/api/operacion/ediciones').set(admin).send({ numero: 'XIII', anio: otro, fechaInicio: `${otro}-11-10`, fechaFin: `${otro}-11-20` })).body.codigo).toBe('parametros_requeridos');
    expect((await ctx.http().post('/api/operacion/ediciones').set(admin).send({ numero: 'XIII', anio: otro, fechaInicio: `${otro}-11-20`, fechaFin: `${otro}-11-10`, precioCentavos: 0, maxPagadasPersona: 1, maxReservasPersona: 1 })).body.codigo).toBe('fechas_invertidas');
  });

  it('US6-AS3: una sede con funciones no se elimina; solo se desactiva sin funciones futuras', async () => {
    const ids = await sembrarEdicion(ctx.db);
    const f = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/funciones`).set(programador())
      .send({ obraId: ids.cura, sedeId: ids.bolivar, inicio: '2026-11-14T20:00:00-05:00', tipoAcceso: 'pagada', publico: 'familiar', aforoHabilitado: 300 });
    expect(f.status).toBe(201);
    const bolivar = await ctx.db.sedeOperacion.findUniqueOrThrow({ where: { id: ids.bolivar } });
    const cuerpo = { nombre: bolivar.nombre, tipo: 'teatro', direccion: bolivar.direccion, lat: bolivar.lat, lng: bolivar.lng, aforo: 400, accesibilidad: ACC };
    expect((await ctx.http().delete(`/api/operacion/sedes/${ids.bolivar}`).set(admin)).body.codigo).toBe('sede_con_funciones');
    const desactivar = await ctx.http().patch(`/api/operacion/sedes/${ids.bolivar}`).set(admin).set('If-Match', `"${bolivar.version}"`).send({ ...cuerpo, activa: false });
    expect(desactivar.status).toBe(409);
    expect(desactivar.body).toMatchObject({ codigo: 'sede_con_funciones', funcionesFuturas: 1 });
    // Bajar el aforo por debajo del de sus funciones tampoco.
    expect((await ctx.http().patch(`/api/operacion/sedes/${ids.bolivar}`).set(admin).set('If-Match', `"${bolivar.version}"`).send({ ...cuerpo, aforo: 250 })).body.codigo).toBe('aforo_supera_sede');

    // Pasada la función ya puede desactivarse (no eliminarse).
    ctx.reloj.ahora = new Date('2026-11-15T12:00:00-05:00');
    try {
      const ok = await ctx.http().patch(`/api/operacion/sedes/${ids.bolivar}`).set(admin).set('If-Match', `"${bolivar.version}"`).send({ ...cuerpo, activa: false });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ activa: false, version: bolivar.version + 1 });
      expect((await ctx.http().patch(`/api/operacion/sedes/${ids.bolivar}`).set(admin).set('If-Match', `"${bolivar.version}"`).send(cuerpo)).status).toBe(412);
      expect(await ctx.db.auditoriaOperacion.count({ where: { accion: 'sede.desactivada', entidadId: ids.bolivar } })).toBe(1);
    } finally {
      ctx.reloj.ahora = new Date('2026-11-10T12:00:00-05:00');
    }
    // Una sede sin funciones sí se elimina.
    const nueva = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/sedes`).set(admin).send(sede());
    expect(nueva.status).toBe(201);
    expect((await ctx.http().delete(`/api/operacion/sedes/${nueva.body.id}`).set(admin)).status).toBe(204);
  });

  it('accesibilidad obligatoria; aforo obligatorio salvo espacio público y recorrido; recorrido con puntos de paso', async () => {
    const ids = await sembrarEdicion(ctx.db);
    const crear = (s: Record<string, unknown>) => ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/sedes`).set(admin).send(s);
    const { accesibilidad: _a, ...sinAcc } = sede();
    expect((await crear(sinAcc)).status).toBe(400);
    expect((await crear(sede({ aforo: null }))).body.codigo).toBe('aforo_requerido');
    expect((await crear(sede({ tipo: 'espacio_publico', aforo: null }))).status).toBe(201);
    expect((await crear(sede({ tipo: 'recorrido', aforo: null, recorrido: [{ lat: -4, lng: -79 }] }))).body.codigo).toBe('recorrido_requerido');
    const recorrido = await crear(sede({ tipo: 'recorrido', aforo: null, recorrido: [{ lat: -4, lng: -79, nombre: 'Inicio' }, { lat: -4.01, lng: -79.01 }] }));
    expect(recorrido.status).toBe(201);
    expect(recorrido.body.recorrido).toHaveLength(2);
    expect((await crear(sede({ nombre: 'Teatro Bolívar' }))).body.codigo).toBe('sede_duplicada');
    expect((await crear(sede())).headers.etag).toBe('"1"');
  });

  it('RN-006: cambiar el precio no toca los pedidos existentes; en una edición publicada se vuelve a anunciar', async () => {
    const ids = await sembrarEdicion(ctx.db, { estado: 'publicada' });
    await ctx.db.pedidoRegistrado.create({ data: { pedidoId: randomUUID(), funcionId: randomUUID(), tipo: 'compra', canal: 'web', cantidad: 2, importeCentavos: 1000 } });
    const antes = await ctx.db.pedidoRegistrado.aggregate({ _sum: { importeCentavos: true } });
    const e = (await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}`).set(admin));
    expect(e.headers.etag).toBe(`"${e.body.version}"`);
    publicados.length = 0;
    const r = await ctx.http().patch(`/api/operacion/ediciones/${ids.edicion}`).set(admin).set('If-Match', e.headers.etag as string)
      .send({ numero: e.body.numero, anio: e.body.anio, fechaInicio: e.body.fechaInicio, fechaFin: e.body.fechaFin, precioCentavos: 700, maxPagadasPersona: 8, maxReservasPersona: 4 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ precioCentavos: 700, maxPagadasPersona: 8, version: e.body.version + 1, advertencias: [] });
    expect((await ctx.db.pedidoRegistrado.aggregate({ _sum: { importeCentavos: true } }))._sum).toEqual(antes._sum);
    const anuncio = publicados.find((x) => x.tipo === 'ProgramacionPublicada');
    expect(anuncio?.datos.edicion).toMatchObject({ id: ids.edicion, precioCentavos: 700, maxPagadasPersona: 8 });
    expect((await ctx.http().patch(`/api/operacion/ediciones/${ids.edicion}`).set(admin).set('If-Match', e.headers.etag as string).send({ numero: 'X', anio: e.body.anio, fechaInicio: e.body.fechaInicio, fechaFin: e.body.fechaFin, precioCentavos: 1, maxPagadasPersona: 1, maxReservasPersona: 1 })).status).toBe(412);
  });

  it('solo administración escribe; una edición cerrada es de solo lectura', async () => {
    const ids = await sembrarEdicion(ctx.db, { estado: 'cerrada' });
    expect((await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/sedes`).set(programador()).send(sede())).status).toBe(403);
    expect((await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/sedes`).set(admin).send(sede())).body.codigo).toBe('edicion_cerrada');
    expect((await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}`).set(conRol('direccion'))).status).toBe(200);
  });
});
