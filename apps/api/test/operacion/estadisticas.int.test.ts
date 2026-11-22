import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conRol, crearAppOperacion, programador, sembrarEdicion } from './app';

// T108 · US5 — indicadores, CSV e informe de cierre, contra PostgreSQL real.
let ctx: Awaited<ReturnType<typeof crearAppOperacion>>;
let ids: Awaited<ReturnType<typeof sembrarEdicion>>;
let anio = 0;
let cerrar: () => Promise<string[]>;
const fn: Record<string, string> = {};
const direccion = conRol('direccion');

beforeAll(async () => {
  ctx = await crearAppOperacion();
  const { EstadisticasServicio } = await import('../../src/modules/operacion/application/estadisticas/estadisticas.servicio');
  cerrar = () => ctx.app.get(EstadisticasServicio).cerrarEdiciones(randomUUID());
  ids = await sembrarEdicion(ctx.db);
  anio = (await ctx.db.edicionOperacion.findUniqueOrThrow({ where: { id: ids.edicion } })).anio;
  await ctx.db.cifrasHistoricas.create({ data: { anio: anio - 1, actividades: 2, elencos: 2, obras: 2, paises: 1, asistenciaTotal: 1000 } });
  await ctx.db.obraOperacion.updateMany({ where: { id: { in: [ids.cura, ids.zombi] } }, data: { imagenes: ['https://fiavl.test/obra.jpg'] } });
  const crear = async (obraId: string, sedeId: string, inicio: string, tipoAcceso: string, aforo: number | null) =>
    (await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/funciones`).set(programador()).send({ obraId, sedeId, inicio, tipoAcceso, publico: 'familiar', aforoHabilitado: aforo })).body.id as string;
  fn.bolivar = await crear(ids.cura, ids.bolivar, '2026-11-13T20:00:00-05:00', 'pagada', 200);
  fn.nacional = await crear(ids.zombi, ids.nacional, '2026-11-14T20:00:00-05:00', 'pagada', 400);
  fn.plaza = await crear(ids.cura, ids.plaza, '2026-11-15T17:00:00-05:00', 'gratuita_libre', null);
  fn.cancelada = await crear(ids.zombi, ids.bolivar, '2026-11-16T20:00:00-05:00', 'pagada', 200);
  expect((await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/publicacion`).set(programador()).set('Idempotency-Key', randomUUID())).status).toBe(200);
  await ctx.http().post(`/api/operacion/funciones/${fn.cancelada}/cancelacion`).set(programador()).set('If-Match', '"2"').send({ motivo: 'lluvia' });
  // Proyección de Boletería (la alimentan sus eventos; aquí se carga directa).
  await ctx.db.metricaFuncion.createMany({
    data: [
      { funcionId: fn.bolivar!, entradasEmitidas: 180, ingresosValidados: 150, recaudacionCentavos: 90_000 },
      { funcionId: fn.nacional!, entradasEmitidas: 300, entradasReembolsadas: 20, ingresosValidados: 250, recaudacionCentavos: 140_000 },
    ],
  });
  ctx.reloj.ahora = new Date('2026-11-15T19:00:00-05:00');
  const jefe = conRol(`jefe_sala@sede:${ids.plaza}`);
  for (const [cantidad, clave] of [[1000, 'plaza-1'], [1200, 'plaza-2']] as const) {
    await ctx.http().post(`/api/operacion/funciones/${fn.plaza}/conteos`).set(jefe).set('Idempotency-Key', `estadisticas-${clave}`).send({ cantidad, metodo: 'cuadrantes' });
    ctx.reloj.ahora = new Date(ctx.reloj.ahora.getTime() + 60_000);
  }
  ctx.reloj.ahora = new Date('2026-11-23T12:00:00-05:00');
});
afterAll(() => ctx.cerrar());

const indicadores = (q: string, rol = direccion) => ctx.http().get(`/api/operacion/ediciones/${ids.edicion}/indicadores?${q}`).set(rol);

describe('US5 — estadísticas e informe de cierre', () => {
  it('US5-AS1 y AS2: ocupación = ingresos ÷ aforo; total = validada + estimada (último conteo)', async () => {
    const r = await indicadores('dimension=funcion');
    expect(r.status).toBe(200);
    const bolivar = r.body.filas.find((f: { clave: string }) => f.clave === fn.bolivar);
    expect(bolivar.ocupacion).toBe(0.75);
    expect(r.body.totales).toMatchObject({
      funcionesRealizadas: 3, funcionesCanceladas: 1, entradasEmitidas: 460, ingresosValidados: 400, asistenciaEstimada: 1200, asistenciaTotal: 1600, recaudacionCentavos: 230_000,
    });
    expect(r.body.totales.ocupacion).toBeCloseTo(400 / 600, 5);
    expect(r.body.actualizadoEn).toMatch(/^\d{4}-/);
  });

  it('filtros por día, sede y país; por sede agrupa con su nombre', async () => {
    const porSede = await indicadores('dimension=sede');
    expect(porSede.body.filas.map((f: { etiqueta: string }) => f.etiqueta)).toEqual(['Plaza San Sebastián', 'Teatro Bolívar', 'Teatro Nacional']);
    expect((await indicadores(`dimension=dia&desde=2026-11-14&hasta=2026-11-14`)).body.totales.ingresosValidados).toBe(250);
    expect((await indicadores(`dimension=pais&pais=Uruguay`)).body.totales.funcionesRealizadas).toBe(1);
    expect((await indicadores('dimension=planeta')).status).toBe(400);
  });

  it('US5-AS3: el CSV trae los indicadores filtrados, con BOM y «;»', async () => {
    const r = await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}/indicadores.csv?dimension=sede&sedeId=${ids.bolivar}`).set(direccion).buffer(true).parse((res, cb) => {
      let t = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (t += c));
      res.on('end', () => cb(null, t));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.headers['content-disposition']).toContain('indicadores-sede.csv');
    // trim() quitaría también el BOM.
    expect((r.body as string).charCodeAt(0)).toBe(0xfeff);
    const lineas = (r.body as string).slice(1).trimEnd().split('\r\n');
    expect(lineas[0]!.startsWith('Grupo;')).toBe(true);
    expect(lineas[1]).toBe('Teatro Bolívar;1;1;180;150;0;150;75,0;900,00');
    expect(lineas).toHaveLength(3);
  });

  it('US5-AS4: el cierre congela el informe con la variación frente a la edición anterior; la edición queda de solo lectura', async () => {
    expect((await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}/informe`).set(direccion)).body.codigo).toBe('edicion_abierta');
    expect(await cerrar()).toContain(ids.edicion);
    expect(await cerrar()).not.toContain(ids.edicion); // idempotente
    const r = await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}/informe`).set(direccion);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      anio, actividades: 3, elencos: 2, obras: 2, paises: 2, asistenciaValidada: 400, asistenciaEstimada: 1200, asistenciaTotal: 1600, recaudacionCentavos: 230_000,
      anterior: { anio: anio - 1, fuente: 'cifras_historicas' },
      variacion: { actividades: 50, elencos: 0, obras: 0, paises: 100, asistenciaTotal: 60 },
    });
    expect((await ctx.db.edicionOperacion.findUniqueOrThrow({ where: { id: ids.edicion } })).estado).toBe('cerrada');
    expect(await ctx.db.auditoriaOperacion.count({ where: { accion: 'edicion.cerrada', entidadId: ids.edicion } })).toBe(1);

    // Congelado: un cambio posterior en la proyección no lo altera, salvo que el administrador lo regenere.
    await ctx.db.metricaFuncion.update({ where: { funcionId: fn.bolivar! }, data: { ingresosValidados: 160 } });
    expect((await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}/informe`).set(direccion)).body.asistenciaValidada).toBe(400);
    expect((await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/informe`).set(direccion)).status).toBe(403);
    const regenerado = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/informe`).set(conRol('administrador'));
    expect(regenerado.body.asistenciaValidada).toBe(410);

    const nueva = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/funciones`).set(programador())
      .send({ obraId: ids.cura, sedeId: ids.bolivar, inicio: '2026-11-20T20:00:00-05:00', tipoAcceso: 'pagada', publico: 'familiar', aforoHabilitado: 100 });
    expect(nueva.body.codigo).toBe('edicion_cerrada');
  });

  it('solo Dirección, Programación y Administración ven los indicadores; el informe, Dirección y Administración', async () => {
    expect((await indicadores('dimension=sede', conRol('taquilla'))).status).toBe(403);
    expect((await indicadores('dimension=sede', programador())).status).toBe(200);
    expect((await ctx.http().get(`/api/operacion/ediciones/${ids.edicion}/informe`).set(programador())).status).toBe(403);
    expect((await ctx.http().get(`/api/operacion/ediciones/${randomUUID()}/indicadores?dimension=sede`).set(direccion)).status).toBe(404);
  });
});
