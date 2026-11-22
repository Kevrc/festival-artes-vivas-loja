import { EventoCartelera, EventoOperacionBoleteria } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearAppOperacion, programador, sembrarEdicion } from './app';

// T045: US2 — publicar la programación, contra PostgreSQL real.
let ctx: Awaited<ReturnType<typeof crearAppOperacion>>;
let ids: Awaited<ReturnType<typeof sembrarEdicion>>;
let publicados: { tipo: string; id: string; correlacionId: string; datos: Record<string, unknown> }[];

beforeAll(async () => {
  ctx = await crearAppOperacion();
  const { PublicadorPgBossOperacion } = await import('../../src/modules/operacion/infrastructure/publicador.pgboss');
  publicados = ctx.app.get(PublicadorPgBossOperacion).publicados as never;
});
afterAll(() => ctx.cerrar());
beforeEach(async () => {
  ids = await sembrarEdicion(ctx.db);
  await ctx.db.obraOperacion.updateMany({ where: { id: { in: [ids.cura, ids.zombi] } }, data: { imagenes: ['https://fiavl.test/obra.jpg'] } });
  publicados.length = 0;
});

const crear = (cuerpo: Record<string, unknown>) =>
  ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/funciones`).set(programador()).send({ publico: 'familiar', aforoHabilitado: 300, tipoAcceso: 'pagada', ...cuerpo });
const publicarEdicion = (headers: Record<string, string> = {}) =>
  ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/publicacion`).set(programador()).set('Idempotency-Key', 'clave-de-prueba-1').set(headers);

describe('US2 — publicar la programación', () => {
  it('US2-AS1: los borradores pasan a programadas y se emiten FuncionProgramada y ProgramacionPublicada con los contratos de 001 y 002', async () => {
    const a = await crear({ obraId: ids.cura, sedeId: ids.nacional, inicio: '2026-11-12T20:00:00-05:00' });
    const b = await crear({ obraId: ids.zombi, sedeId: ids.bolivar, inicio: '2026-11-13T19:00:00-05:00' });
    const c = await crear({ obraId: ids.cura, sedeId: ids.bolivar, inicio: '2026-11-14T19:00:00-05:00' });
    const correlacion = '0b5a0000-0000-4000-8000-0000000000c1';

    const r = await publicarEdicion({ 'x-correlation-id': correlacion });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ funcionesPublicadas: 3 });

    for (const f of [a, b, c]) {
      const vista = await ctx.http().get(`/api/operacion/funciones/${f.body.id}`).set(programador());
      expect(vista.body).toMatchObject({ estado: 'programada', version: 2 });
    }
    expect(publicados.map((e) => e.tipo)).toEqual(['FuncionProgramada', 'FuncionProgramada', 'FuncionProgramada', 'ProgramacionPublicada']);
    for (const e of publicados) {
      expect(EventoCartelera.safeParse(e).success).toBe(true);
      expect(EventoOperacionBoleteria.safeParse(e).success).toBe(true);
      expect(e.correlacionId).toBe(correlacion);
    }
    expect((publicados[3]!.datos as { funcionIds: string[] }).funcionIds.sort()).toEqual([a.body.id, b.body.id, c.body.id].sort());
    expect(await ctx.db.edicionOperacion.findUnique({ where: { id: ids.edicion } })).toMatchObject({ estado: 'publicada' });

    // Constitución IX: auditoría de la edición y de cada función, con la correlación de la petición
    const auditoria = await ctx.db.auditoriaOperacion.findMany({ where: { correlacionId: correlacion } });
    expect(auditoria.map((x) => x.accion).sort()).toEqual(['edicion.publicar', 'funcion.publicar', 'funcion.publicar', 'funcion.publicar']);
  });

  it('la función publicada llega a la proyección de Cartelera (SC-003)', async () => {
    const f = await crear({ obraId: ids.cura, sedeId: ids.nacional, inicio: '2026-11-15T20:00:00-05:00' });
    await publicarEdicion();
    const { AplicarEvento } = await import('../../src/modules/programacion/application/proyeccion/aplicar-evento');
    const aplicar = ctx.app.get(AplicarEvento);
    for (const e of publicados) expect((await aplicar.ejecutar(e)).aplicado).toBe(true);
    expect(await ctx.db.funcionCartelera.findUnique({ where: { id: f.body.id } })).toMatchObject({ obraId: ids.cura, estado: 'programada', versionOrigen: 2 });
  });

  it('US2-AS2: una función sin tipo de acceso bloquea la publicación, se listan los errores y no se publica nada', async () => {
    const sinAcceso = await crear({ obraId: ids.cura, sedeId: ids.nacional, inicio: '2026-11-16T20:00:00-05:00', tipoAcceso: null });
    expect(sinAcceso.status).toBe(201);
    await ctx.db.obraOperacion.update({ where: { id: ids.zombi }, data: { imagenes: [] } });
    await crear({ obraId: ids.zombi, sedeId: ids.bolivar, inicio: '2026-11-16T19:00:00-05:00' });

    const v = await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}/publicacion/validacion`).set(programador());
    expect(v.status).toBe(200);
    expect(v.body.valida).toBe(false);
    expect(v.body.errores.map((e: { codigo: string }) => e.codigo).sort()).toEqual(['obra_sin_imagen', 'sin_tipo_acceso']);
    expect(v.body.errores.find((e: { codigo: string }) => e.codigo === 'sin_tipo_acceso')).toMatchObject({ funcionId: sinAcceso.body.id });

    const r = await publicarEdicion();
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ codigo: 'publicacion_invalida', valida: false });
    expect(r.body.errores).toHaveLength(2);
    expect(publicados).toEqual([]);
    expect(await ctx.db.funcionOperacion.count({ where: { edicionId: ids.edicion, estado: 'borrador' } })).toBe(2);
  });

  it('US2-AS3: en una edición publicada, una función nueva se publica sola sin republicar la edición', async () => {
    await crear({ obraId: ids.cura, sedeId: ids.nacional, inicio: '2026-11-17T20:00:00-05:00' });
    await publicarEdicion();
    publicados.length = 0;

    const nueva = await crear({ obraId: ids.zombi, sedeId: ids.bolivar, inicio: '2026-11-18T19:00:00-05:00' });
    const r = await ctx.http().post(`/api/operacion/funciones/${nueva.body.id}/publicacion`).set(programador()).set('If-Match', '"1"');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'programada', version: 2 });
    expect(publicados.map((e) => e.tipo)).toEqual(['FuncionProgramada']);
    expect((await ctx.http().post(`/api/operacion/funciones/${nueva.body.id}/publicacion`).set(programador()).set('If-Match', '"2"')).body.codigo).toBe('funcion_publicada');
  });

  it('publicar una función suelta exige que la edición ya esté publicada, y repetir la publicación es inocuo', async () => {
    const f = await crear({ obraId: ids.cura, sedeId: ids.nacional, inicio: '2026-11-19T20:00:00-05:00' });
    const suelta = await ctx.http().post(`/api/operacion/funciones/${f.body.id}/publicacion`).set(programador()).set('If-Match', '"1"');
    expect(suelta.body.codigo).toBe('edicion_sin_publicar');
    await publicarEdicion();
    publicados.length = 0;
    expect((await publicarEdicion()).body).toEqual({ funcionesPublicadas: 0 });
    expect(publicados).toEqual([]);
    expect((await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/publicacion`).set(programador())).body.codigo).toBe('idempotencia_requerida');
  });

  it('solo el programador publica', async () => {
    const r = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/publicacion`).set({ 'x-cuenta-dev': ids.edicion, 'x-roles-dev': 'direccion' }).set('Idempotency-Key', 'clave-de-prueba-2');
    expect(r.status).toBe(403);
  });
});
