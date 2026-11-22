import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { conRol, crearAppOperacion, programador, sembrarEdicion } from './app';

// T102 · US4 — incidencias, conteos y alertas automáticas, contra PostgreSQL real.
let ctx: Awaited<ReturnType<typeof crearAppOperacion>>;
let ids: Awaited<ReturnType<typeof sembrarEdicion>>;
let manejar: (e: { id: string; tipo: string }) => Promise<void>;
beforeAll(async () => {
  ctx = await crearAppOperacion();
  const { MANEJADORES_OPERACION } = await import('../../src/modules/operacion/application/puertos');
  const ms = ctx.app.get<{ tipo: string; esquema: { parse(x: unknown): { id: string; tipo: string } }; manejar(e: unknown): Promise<void> }[]>(MANEJADORES_OPERACION);
  manejar = async (e) => {
    const m = ms.find((x) => x.tipo === e.tipo)!;
    await m.manejar(m.esquema.parse(e));
  };
});
afterAll(() => ctx.cerrar());
beforeEach(async () => {
  ids = await sembrarEdicion(ctx.db);
  await ctx.db.obraOperacion.updateMany({ where: { id: { in: [ids.cura, ids.zombi] } }, data: { imagenes: ['https://fiavl.test/obra.jpg'] } });
});
const publicar = async () =>
  expect((await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/publicacion`).set(programador()).set('Idempotency-Key', randomUUID())).status).toBe(200);

const jefeDe = (sedeId: string, cuentaId = randomUUID()) => conRol(`jefe_sala@sede:${sedeId}`, cuentaId);
const sobre = (tipo: string, datos: Record<string, unknown>) => ({
  id: randomUUID(), tipo, version: 1 as const, ocurridoEn: '2026-11-14T21:00:00-05:00', edicionId: ids.edicion, correlacionId: randomUUID(), datos,
});
async function funcion(sedeId: string, inicio: string, tipoAcceso: string, obraId = ids.cura) {
  const r = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/funciones`).set(programador())
    .send({ obraId, sedeId, inicio, tipoAcceso, publico: 'familiar', aforoHabilitado: tipoAcceso === 'gratuita_libre' ? null : 300 });
  expect(r.status).toBe(201);
  return r.body.id as string;
}

describe('US4 — incidencias y asistencia en espacios públicos', () => {
  it('US4-AS1: conteo en la plaza; el vigente es el último; repetir la petición no duplica', async () => {
    const f = await funcion(ids.plaza, '2026-11-14T17:00:00-05:00', 'gratuita_libre');
    await publicar();
    const jefe = jefeDe(ids.plaza);
    const contar = (cantidad: number, clave: string) =>
      ctx.http().post(`/api/operacion/funciones/${f}/conteos`).set(jefe).set('Idempotency-Key', clave).send({ cantidad, metodo: 'conteo por cuadrantes' });
    const r = await contar(1100, 'conteo-plaza-1');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ funcionId: f, cantidad: 1100 });
    expect((await contar(1100, 'conteo-plaza-1')).body.id).toBe(r.body.id);
    ctx.reloj.ahora = new Date(ctx.reloj.ahora.getTime() + 60_000);
    await contar(1200, 'conteo-plaza-2');
    const conteos = await ctx.db.conteoEstimado.findMany({ where: { funcionId: f }, orderBy: { registradoEn: 'desc' } });
    expect(conteos.map((c) => c.cantidad)).toEqual([1200, 1100]);
    // Comprobación de auditoría con correlación (Constitución IX).
    const auditoria = await ctx.db.auditoriaOperacion.findMany({ where: { accion: 'conteo.registrado', entidadId: f } });
    expect(auditoria).toHaveLength(2);
    expect(auditoria[0]!.correlacionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('el conteo es solo para acceso libre o espacio público; en un teatro con entradas se rechaza', async () => {
    const f = await funcion(ids.bolivar, '2026-11-14T20:00:00-05:00', 'pagada');
    const r = await ctx.http().post(`/api/operacion/funciones/${f}/conteos`).set(jefeDe(ids.bolivar)).set('Idempotency-Key', 'conteo-teatro-1').send({ cantidad: 10, metodo: 'a ojo' });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('conteo_no_aplica');
  });

  it('US4-AS2: la incidencia que afecta al público ofrece reprogramar y la ve Dirección; se atiende', async () => {
    const f = await funcion(ids.bolivar, '2026-11-14T20:00:00-05:00', 'pagada');
    await publicar();
    const jefe = jefeDe(ids.bolivar);
    const r = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/incidencias`).set(jefe).set('Idempotency-Key', 'incidencia-retraso-1')
      .send({ sedeId: ids.bolivar, funcionId: f, tipo: 'retraso', descripcion: 'Retraso de 20 min por falla de luces', afectaPublico: true });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ tipo: 'retraso', origen: 'manual', estado: 'abierta', ofrecerReprogramar: true });
    const direccion = await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}/incidencias`).set(conRol('direccion'));
    expect(direccion.body.map((i: { id: string }) => i.id)).toContain(r.body.id);
    const sinPublico = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/incidencias`).set(jefe).set('Idempotency-Key', 'incidencia-clima-1')
      .send({ sedeId: ids.bolivar, tipo: 'clima', descripcion: 'Llovizna', afectaPublico: false });
    expect(sinPublico.body.ofrecerReprogramar).toBe(false);
    const atendida = await ctx.http().patch(`/api/operacion/incidencias/${r.body.id}`).set(jefe).send({ estado: 'atendida' });
    expect(atendida.body.estado).toBe('atendida');
    expect(await ctx.db.auditoriaOperacion.count({ where: { entidadId: r.body.id } })).toBe(2);
  });

  it('RN-009: el jefe de sala del Bolívar no registra en otra sede ni ve sus incidencias', async () => {
    const jefe = jefeDe(ids.bolivar);
    const r = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/incidencias`).set(jefe).set('Idempotency-Key', 'fuera-de-sede-1')
      .send({ sedeId: ids.nacional, tipo: 'otra', descripcion: 'Prueba', afectaPublico: false });
    expect(r.status).toBe(403);
    expect(r.body.codigo).toBe('fuera_de_alcance');
    await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/incidencias`).set(jefeDe(ids.nacional)).set('Idempotency-Key', 'en-nacional-1')
      .send({ sedeId: ids.nacional, tipo: 'otra', descripcion: 'Del Nacional', afectaPublico: false });
    const lista = await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}/incidencias`).set(jefe);
    expect(lista.body.every((i: { sedeId: string }) => i.sedeId === ids.bolivar)).toBe(true);
    expect((await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/incidencias`).set(conRol('taquilla')).send({})).status).toBe(403);
    expect((await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/incidencias`).set(jefe).send({ sedeId: ids.bolivar, tipo: 'otra', descripcion: 'x y z', afectaPublico: false })).body.codigo).toBe('idempotencia_requerida');
  });

  it('US4-AS3: AforoExcedido y ConflictoDeIngreso crean una incidencia automática, una sola vez por evento', async () => {
    const f = await funcion(ids.bolivar, '2026-11-14T20:00:00-05:00', 'pagada');
    const aforo = sobre('AforoExcedido', { funcionId: f, sedeId: ids.bolivar, aforoHabilitado: 300, entradasActivas: 320, exceso: 20 });
    await manejar(aforo);
    await manejar(aforo);
    await manejar(sobre('ConflictoDeIngreso', { entradaId: randomUUID(), funcionId: f, sedeId: ids.bolivar, primerDispositivoId: 'puerta-1', segundoDispositivoId: 'puerta-2', detectadoEn: '2026-11-14T20:05:00-05:00' }));
    const auto = await ctx.db.incidencia.findMany({ where: { funcionId: f, origen: 'automatica' }, orderBy: { tipo: 'asc' } });
    expect(auto.map((i) => i.tipo)).toEqual(['aforo_superado', 'conflicto_ingreso']);
    expect(auto[0]).toMatchObject({ eventoOrigenId: aforo.id, sedeId: ids.bolivar, afectaPublico: true });
  });

  it('FR-007: SeleccionDesistida marca la obra desistida, deja sus funciones y abre una incidencia por función', async () => {
    const f1 = await funcion(ids.bolivar, '2026-11-14T20:00:00-05:00', 'pagada', ids.zombi);
    const f2 = await funcion(ids.nacional, '2026-11-15T20:00:00-05:00', 'pagada', ids.zombi);
    const e = sobre('SeleccionDesistida', { postulacionId: randomUUID(), convocatoriaId: randomUUID(), cuentaPostulanteId: randomUUID(), numero: 'PN-1', obraId: ids.zombi, motivo: 'enfermedad' });
    await manejar(e);
    await manejar(e);
    expect((await ctx.db.obraOperacion.findUniqueOrThrow({ where: { id: ids.zombi } })).estado).toBe('desistida');
    expect(await ctx.db.funcionOperacion.count({ where: { id: { in: [f1, f2] }, estado: { not: 'cancelada' } } })).toBe(2);
    const inc = await ctx.db.incidencia.findMany({ where: { tipo: 'desistimiento', funcionId: { in: [f1, f2] } } });
    expect(inc).toHaveLength(2);
    expect(await ctx.db.auditoriaOperacion.count({ where: { accion: 'obra.desistida', entidadId: ids.zombi } })).toBe(1);
  });

  it('una edición cerrada es de solo lectura', async () => {
    await ctx.db.edicionOperacion.update({ where: { id: ids.edicion }, data: { estado: 'cerrada' } });
    const r = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/incidencias`).set(programador()).set('Idempotency-Key', 'cerrada-0001')
      .send({ sedeId: ids.bolivar, tipo: 'otra', descripcion: 'Tarde', afectaPublico: false });
    expect(r.body.codigo).toBe('edicion_cerrada');
  });
});
