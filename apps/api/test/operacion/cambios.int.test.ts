import { randomUUID } from 'node:crypto';
import { EventoCartelera, EventoOperacionBoleteria } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearAppOperacion, programador, sembrarEdicion } from './app';

// T052: US3 — reprogramar y cancelar funciones publicadas, contra PostgreSQL real.
let ctx: Awaited<ReturnType<typeof crearAppOperacion>>;
let ids: Awaited<ReturnType<typeof sembrarEdicion>>;
let publicados: { tipo: string; correlacionId: string; datos: Record<string, unknown> }[];
let emitir: (funcionId: string, cantidad: number) => Promise<void>;

beforeAll(async () => {
  ctx = await crearAppOperacion();
  const { PublicadorPgBossOperacion } = await import('../../src/modules/operacion/infrastructure/publicador.pgboss');
  const { MANEJADORES_OPERACION } = await import('../../src/modules/operacion/application/puertos');
  publicados = ctx.app.get(PublicadorPgBossOperacion).publicados as never;
  const manejadores = ctx.app.get<{ tipo: string; manejar(e: unknown): Promise<void> }[]>(MANEJADORES_OPERACION);
  const entradas = manejadores.find((m) => m.tipo === 'EntradasEmitidas')!;
  emitir = (funcionId, cantidad) =>
    entradas.manejar({
      id: randomUUID(), tipo: 'EntradasEmitidas', version: 1, ocurridoEn: new Date().toISOString(), edicionId: ids.edicion, correlacionId: randomUUID(),
      datos: {
        pedidoId: randomUUID(), funcionId, sedeId: ids.nacional, canal: 'web', tipo: 'compra', cantidad, importeCentavos: cantidad * 500,
        entradas: Array.from({ length: Math.min(cantidad, 3) }, () => ({ entradaId: randomUUID(), codigoCorto: 'ABCD1234', tokenQr: 'qr' })),
      },
    });
});
afterAll(() => ctx.cerrar());
beforeEach(async () => {
  ids = await sembrarEdicion(ctx.db);
  await ctx.db.obraOperacion.updateMany({ where: { id: { in: [ids.cura, ids.zombi] } }, data: { imagenes: ['https://fiavl.test/obra.jpg'] } });
});

/** Crea y publica una función; devuelve su id con la versión 2. */
async function publicada(obraId: string, sedeId: string, inicio: string, aforoHabilitado = 300) {
  const f = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/funciones`).set(programador())
    .send({ obraId, sedeId, inicio, tipoAcceso: 'pagada', publico: 'familiar', aforoHabilitado });
  await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/publicacion`).set(programador()).set('Idempotency-Key', randomUUID());
  publicados.length = 0;
  return f.body.id as string;
}
const reprogramar = (id: string, cuerpo: Record<string, unknown>, version = 2, headers: Record<string, string> = {}) =>
  ctx.http().post(`/api/operacion/funciones/${id}/reprogramacion`).set(programador()).set(headers).set('If-Match', `"${version}"`).send(cuerpo);

describe('US3 — reprogramar o cancelar funciones', () => {
  it('US3-AS1: reprogramar por lluvia la deja reprogramada, guarda el horario anterior y emite FuncionReprogramada', async () => {
    const id = await publicada(ids.cura, ids.nacional, '2026-11-14T20:00:00-05:00');
    const correlacion = '0b5a0000-0000-4000-8000-0000000000c3';
    const r = await reprogramar(id, { inicio: '2026-11-14T21:00:00-05:00', motivo: 'lluvia' }, 2, { 'x-correlation-id': correlacion });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'reprogramada', version: 3, inicio: '2026-11-15T02:00:00.000Z', fin: '2026-11-15T03:30:00.000Z' });

    const historial = await ctx.http().get(`/api/operacion/funciones/${id}/cambios`).set(programador());
    expect(historial.body).toEqual([
      expect.objectContaining({ tipo: 'reprogramacion', motivo: 'lluvia', anterior: expect.objectContaining({ inicio: '2026-11-15T01:00:00.000Z' }) }),
    ]);
    expect(publicados.map((e) => e.tipo)).toEqual(['FuncionReprogramada']);
    const evento = publicados[0]!;
    expect(EventoCartelera.safeParse(evento).success).toBe(true);
    expect(EventoOperacionBoleteria.safeParse(evento).success).toBe(true);
    expect(evento.datos).toMatchObject({ funcionId: id, version: 3, motivo: 'lluvia', anterior: { inicio: '2026-11-15T01:00:00.000Z' } });
    expect(evento.datos).not.toHaveProperty('sede');

    const auditoria = await ctx.db.auditoriaOperacion.findMany({ where: { correlacionId: correlacion } });
    expect(auditoria).toEqual([expect.objectContaining({ accion: 'funcion.reprogramar', entidadId: id })]);
  });

  it('US3-AS2: a una sede con menos aforo que entradas vendidas avisa el exceso y exige confirmar', async () => {
    const id = await publicada(ids.cura, ids.nacional, '2026-11-15T20:00:00-05:00', 600);
    await emitir(id, 450);
    const sinConfirmar = await reprogramar(id, { sedeId: ids.bolivar, motivo: 'Falla de sonido en el Nacional' });
    expect(sinConfirmar.status).toBe(409);
    expect(sinConfirmar.body).toMatchObject({ codigo: 'exceso_aforo', exceso: 50 });
    expect(publicados).toEqual([]);

    const confirmada = await reprogramar(id, { sedeId: ids.bolivar, motivo: 'Falla de sonido en el Nacional', confirmarExceso: true });
    expect(confirmada.status).toBe(200);
    expect(confirmada.body).toMatchObject({ estado: 'reprogramada', sedeId: ids.bolivar, aforoHabilitado: 400, version: 4 });
    const [cambio] = await ctx.db.cambioFuncion.findMany({ where: { funcionId: id } });
    expect(cambio).toMatchObject({ tipo: 'cambio_sede', excesoConfirmado: 50 });
    // Primero la reprogramación (n+1, con la sede nueva) y luego el aforo (n+2) para Boletería.
    expect(publicados.map((e) => [e.tipo, (e.datos as { version: number }).version])).toEqual([['FuncionReprogramada', 3], ['AforoCambiado', 4]]);
    expect(publicados[0]!.datos).toMatchObject({ sede: { id: ids.bolivar, aforo: 400 } });
    expect(publicados[1]!.datos).toMatchObject({ aforoAnterior: 600, aforoHabilitado: 400 });
  });

  it('reprogramar respeta los cruces de la nueva sede (RN-001)', async () => {
    await publicada(ids.zombi, ids.bolivar, '2026-11-16T19:00:00-05:00');
    const id = await publicada(ids.cura, ids.nacional, '2026-11-16T19:30:00-05:00');
    const r = await reprogramar(id, { sedeId: ids.bolivar, motivo: 'cambio de sala' }, 2);
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('cruce_sede');
  });

  it('US3-AS3: cancelar emite FuncionCancelada y libera la sede', async () => {
    const id = await publicada(ids.cura, ids.bolivar, '2026-11-17T20:00:00-05:00');
    await emitir(id, 3);
    const r = await ctx.http().post(`/api/operacion/funciones/${id}/cancelacion`).set(programador()).set('If-Match', '"2"').send({ motivo: 'Elenco enfermo' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'cancelada', version: 3 });
    expect(publicados.map((e) => e.tipo)).toEqual(['FuncionCancelada']);
    expect(EventoOperacionBoleteria.safeParse(publicados[0]).success).toBe(true);
    const activos = await ctx.db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM operacion.bloque_ocupacion WHERE funcion_id = $1::uuid AND activo`, id);
    expect(activos[0]!.n).toBe(0);
    // La sede queda libre a esa hora
    const otra = await ctx.http().post(`/api/operacion/ediciones/${ids.edicion}/funciones`).set(programador())
      .send({ obraId: ids.zombi, sedeId: ids.bolivar, inicio: '2026-11-17T20:00:00-05:00', tipoAcceso: 'pagada', publico: 'familiar', aforoHabilitado: 100 });
    expect(otra.status).toBe(201);
    expect((await ctx.db.auditoriaOperacion.findMany({ where: { entidadId: id, accion: 'funcion.cancelar' } }))).toHaveLength(1);
  });

  it('US3-AS4: sin motivo se rechaza, en reprogramación y en cancelación', async () => {
    const id = await publicada(ids.cura, ids.nacional, '2026-11-18T20:00:00-05:00');
    expect((await reprogramar(id, { inicio: '2026-11-18T21:00:00-05:00' })).body.codigo).toBe('motivo_requerido');
    const c = await ctx.http().post(`/api/operacion/funciones/${id}/cancelacion`).set(programador()).set('If-Match', '"2"').send({ motivo: '  ' });
    expect(c.status).toBe(400);
    expect(c.body.codigo).toBe('motivo_requerido');
  });

  it('US3-AS5: una función ya finalizada no se cambia', async () => {
    const id = await publicada(ids.cura, ids.nacional, '2026-11-19T20:00:00-05:00');
    const antes = ctx.reloj.ahora;
    ctx.reloj.ahora = new Date('2026-11-19T22:00:00-05:00');
    try {
      expect((await reprogramar(id, { inicio: '2026-11-20T20:00:00-05:00', motivo: 'lluvia' })).body.codigo).toBe('funcion_finalizada');
      const c = await ctx.http().post(`/api/operacion/funciones/${id}/cancelacion`).set(programador()).set('If-Match', '"2"').send({ motivo: 'lluvia' });
      expect(c.body.codigo).toBe('funcion_finalizada');
    } finally {
      ctx.reloj.ahora = antes;
    }
  });

  it('edición de una publicada sin motivo: aforo solo ⇒ AforoCambiado; otros datos ⇒ FuncionActualizada; horario ⇒ reprogramación', async () => {
    const id = await publicada(ids.cura, ids.nacional, '2026-11-20T20:00:00-05:00');
    const url = `/api/operacion/funciones/${id}`;
    const aforo = await ctx.http().patch(url).set(programador()).set('If-Match', '"2"').send({ aforoHabilitado: 500 });
    expect(aforo.body).toMatchObject({ aforoHabilitado: 500, version: 3 });
    expect(publicados.map((e) => e.tipo)).toEqual(['AforoCambiado']);
    publicados.length = 0;
    const publico = await ctx.http().patch(url).set(programador()).set('If-Match', '"3"').send({ publico: 'adultos' });
    expect(publico.body).toMatchObject({ publico: 'adultos', version: 4 });
    expect(publicados.map((e) => e.tipo)).toEqual(['FuncionActualizada']);
    expect(EventoCartelera.safeParse(publicados[0]).success).toBe(true);
    expect((await ctx.http().patch(url).set(programador()).set('If-Match', '"4"').send({ inicio: '2026-11-20T21:00:00-05:00' })).body.codigo).toBe('usar_reprogramacion');
  });
});

describe('entrega diferida del AforoCambiado (research R3)', () => {
  it('con la cola real, el AforoCambiado queda programado unos segundos después', async () => {
    const { ColaEventos } = await import('../../src/common/datos/datos.module');
    const { PublicadorPgBossOperacion } = await import('../../src/modules/operacion/infrastructure/publicador.pgboss');
    const { aforoCambiado } = await import('../../src/modules/operacion/application/eventos-salida');
    class ColaReal extends ColaEventos {
      override get habilitada() {
        return true;
      }
    }
    const cola = new ColaReal();
    const publicador = new PublicadorPgBossOperacion(cola);
    await publicador.onModuleInit();
    const evento = aforoCambiado(randomUUID(), randomUUID(), 4, 600, 400, randomUUID(), new Date());
    try {
      await publicador.publicar(evento, { retrasoSegundos: 15 });
      const [fila] = await ctx.db.$queryRawUnsafe<{ espera: number }[]>(
        `SELECT extract(epoch FROM start_after - created_on)::int AS espera FROM pgboss.job WHERE data->>'id' = $1`,
        evento.id,
      );
      expect(fila!.espera).toBeGreaterThanOrEqual(14);
    } finally {
      await cola.onModuleDestroy();
    }
  });
});
