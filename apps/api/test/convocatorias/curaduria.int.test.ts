import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/configurar-app';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { EvaluacionesPrismaRepository } from '../../src/modules/convocatorias/infrastructure/evaluaciones-prisma.repository';

const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
let app: INestApplication;
const coordinacion = randomUUID();
const provincialLoja = randomUUID();
const provincialOtra = randomUUID();

const auth = (cuentaId: string, rol: string, provincia?: string) => ({
  'x-cuenta-dev': cuentaId, 'x-rol-dev': rol, ...(provincia ? { 'x-provincia-dev': provincia } : {}),
});
const API = '/api/convocatorias';

interface Escenario {
  postulacionId: string;
  criterios: string[]; // ids en orden calidad, viabilidad, territorio (50/30/20)
  curadores: Array<{ id: string; cuentaId: string; asignacionId: string }>;
}

/** Postulación en evaluación con criterios 50/30/20 y `n` curadores asignados. */
async function escenario(opciones: { n?: number; provincia?: string; integrantes?: string[]; estado?: string } = {}): Promise<Escenario> {
  const convocatoriaId = randomUUID();
  const elencoId = randomUUID();
  const postulacionId = randomUUID();
  await db.convocatoria.create({
    data: {
      id: convocatoriaId, edicionId: randomUUID(), codigo: `C-${randomUUID()}`, componente: 'nacional',
      provincia: opciones.provincia ?? 'Loja', abreEn: new Date('2026-01-01T00:00:00Z'),
      cierraEn: new Date('2027-01-01T00:00:00Z'), maxObrasPorElenco: 3, estado: 'abierta',
    },
  });
  const criterios = [['Calidad', 50], ['Viabilidad', 30], ['Territorio', 20]] as const;
  const ids: string[] = [];
  for (const [nombre, peso] of criterios) {
    const id = randomUUID();
    ids.push(id);
    await db.criterio.create({ data: { id, convocatoriaId, nombre, descripcion: `${nombre} de la obra`, peso } });
  }
  await db.elenco.create({
    data: {
      id: elencoId, cuentaId: randomUUID(), nombre: 'Elenco Curaduría', responsable: 'Rosa Maldonado',
      correoContacto: 'c@example.ec', provinciaPais: 'Loja', integrantes: opciones.integrantes ?? ['Ana Torres'], trayectoria: 'T',
    },
  });
  await db.postulacion.create({
    data: {
      id: postulacionId, convocatoriaId, elencoId, numero: `E-${randomUUID().slice(0, 8)}`, obraFingerprint: randomUUID(),
      tituloObra: 'Obra a evaluar', disciplina: 'teatro', sinopsis: 'Sinopsis', duracionMin: 50, publico: 'todo público',
      fichaTecnica: {}, estado: opciones.estado ?? 'en_evaluacion', enviadaEn: new Date(), primeraEnviadaEn: new Date(),
    },
  });
  const curadores: Escenario['curadores'] = [];
  for (let i = 0; i < (opciones.n ?? 2); i++) {
    const id = randomUUID();
    const cuentaId = randomUUID();
    const asignacionId = randomUUID();
    await db.curador.create({ data: { id, cuentaId, disciplinas: ['teatro'], conflictos: [] } });
    await db.asignacion.create({ data: { id: asignacionId, postulacionId, curadorId: id, estado: 'asignada' } });
    curadores.push({ id, cuentaId, asignacionId });
  }
  return { postulacionId, criterios: ids, curadores };
}

const notas = (e: Escenario, a: number, b: number, c: number) => ({
  calificaciones: e.criterios.map((criterioId, i) => ({ criterioId, puntaje: [a, b, c][i]! })),
  observaciones: 'Observaciones del curador',
});
const evaluar = (e: Escenario, indice: number, a: number, b: number, c: number) =>
  request(app.getHttpServer())
    .put(`${API}/curaduria/asignaciones/${e.curadores[indice]!.asignacionId}/evaluacion`)
    .set(auth(e.curadores[indice]!.cuentaId, 'curador')).send(notas(e, a, b, c));
const enviar = (e: Escenario, indice: number) =>
  request(app.getHttpServer())
    .post(`${API}/curaduria/asignaciones/${e.curadores[indice]!.asignacionId}/enviar`)
    .set(auth(e.curadores[indice]!.cuentaId, 'curador'));
const estadoPostulacion = async (id: string) => db.postulacion.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  process.env.DATABASE_URL = inject('databaseUrl');
  process.env.NODE_ENV = 'test';
  process.env.CONVOCATORIAS_ALMACENAMIENTO = 'memoria';
  process.env.CONVOCATORIAS_ANTIVIRUS = 'simulador';
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  configurarApp(app);
  await app.init();
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });

describe('US3 · curaduría ponderada', () => {
  it('US3-AS1/AS2/AS5: calcula 79,00, promedia 82,00 y exige deliberación solo por dispersión > 25', async () => {
    const e = await escenario();
    expect((await evaluar(e, 0, 80, 70, 90)).status).toBe(200);
    const primero = await enviar(e, 0).expect(200);
    expect(primero.body.evaluacion).toMatchObject({ estado: 'enviada', puntaje: '79.00' });
    expect(primero.body.postulacion).toMatchObject({ estado: 'en_evaluacion', puntajeFinal: null });

    await evaluar(e, 1, 85, 85, 85).expect(200);
    const segundo = await enviar(e, 1).expect(200);
    expect(segundo.body.evaluacion.puntaje).toBe('85.00');
    expect(segundo.body.postulacion).toMatchObject({ estado: 'evaluada', puntajeFinal: '82.00' });
    const guardada = await estadoPostulacion(e.postulacionId);
    expect(guardada.estado).toBe('evaluada');
    expect(guardada.puntajeFinal?.toString()).toBe('82');

    // 25 exactos (60,00 vs 85,00) no deliberan; 25,01 sí.
    const justo = await escenario();
    await evaluar(justo, 0, 60, 60, 60).expect(200); await enviar(justo, 0).expect(200);
    await evaluar(justo, 1, 85, 85, 85).expect(200);
    expect((await enviar(justo, 1).expect(200)).body.postulacion.estado).toBe('evaluada');
    const disperso = await escenario();
    await evaluar(disperso, 0, 40, 40, 40).expect(200); await enviar(disperso, 0).expect(200);
    await evaluar(disperso, 1, 85, 85, 85).expect(200);
    const final = (await enviar(disperso, 1).expect(200)).body.postulacion;
    expect(final).toMatchObject({ estado: 'requiere_deliberacion', puntajeFinal: '62.50' });
    const acciones = (await db.auditoria.findMany({ where: { postulacionId: disperso.postulacionId } })).map((a) => a.accion);
    expect(acciones).toEqual(expect.arrayContaining(['evaluacion_enviada', 'postulacion_evaluada', 'deliberacion_requerida']));
  });

  it('valida calificaciones: 0–100 enteras, todos los criterios y no enviar sin completar', async () => {
    const e = await escenario();
    const ruta = `${API}/curaduria/asignaciones/${e.curadores[0]!.asignacionId}/evaluacion`;
    const headers = auth(e.curadores[0]!.cuentaId, 'curador');
    await request(app.getHttpServer()).put(ruta).set(headers).send(notas(e, 101, 70, 90)).expect(422);
    await request(app.getHttpServer()).put(ruta).set(headers).send(notas(e, 80.5, 70, 90)).expect(422);
    await request(app.getHttpServer()).put(ruta).set(headers).send({ calificaciones: [{ criterioId: randomUUID(), puntaje: 50 }] }).expect(422);
    // Un borrador parcial sí se guarda, pero no se puede enviar incompleto.
    await request(app.getHttpServer()).put(ruta).set(headers)
      .send({ calificaciones: [{ criterioId: e.criterios[0], puntaje: 80 }] }).expect(200);
    const incompleto = await enviar(e, 0).expect(422);
    expect(incompleto.body.detail).toMatch(/todos los criterios/);
  });

  it('US3-AS3: un conflicto de interés impide asignar y evaluar', async () => {
    const e = await escenario({ n: 1, integrantes: ['Luis Jiménez'] });
    const repo = new EvaluacionesPrismaRepository(db);
    const conflictivo = randomUUID();
    await db.curador.create({ data: { id: conflictivo, cuentaId: randomUUID(), disciplinas: ['teatro'], conflictos: ['luis jimenez'] } });
    await expect(repo.asignarCurador(e.postulacionId, conflictivo)).rejects.toThrow(/Conflicto de interés/);
    expect(await db.asignacion.count({ where: { postulacionId: e.postulacionId, curadorId: conflictivo } })).toBe(0);
    // Sin conflicto sí se asigna, y no se puede duplicar.
    const limpio = randomUUID();
    await db.curador.create({ data: { id: limpio, cuentaId: randomUUID(), disciplinas: ['teatro'], conflictos: ['Otra persona'] } });
    await expect(repo.asignarCurador(e.postulacionId, limpio)).resolves.toMatchObject({ estado: 'asignada' });
    await expect(repo.asignarCurador(e.postulacionId, limpio)).rejects.toThrow(/ya está asignado/);

    // Un conflicto declarado después de asignar bloquea evaluar y se informa en la lista.
    const cuenta = e.curadores[0]!.cuentaId;
    await db.curador.update({ where: { id: e.curadores[0]!.id }, data: { conflictos: ['Ana Torres', 'Luis Jiménez'] } });
    const lista = await request(app.getHttpServer()).get(`${API}/curaduria/asignaciones`).set(auth(cuenta, 'curador')).expect(200);
    expect(lista.body[0]).toMatchObject({ bloqueada: true, motivoBloqueo: expect.stringContaining('Conflicto de interés') });
    await evaluar(e, 0, 80, 70, 90).expect(403);
    await enviar(e, 0).expect(403);
    expect(await db.evaluacion.count({ where: { asignacionId: e.curadores[0]!.asignacionId } })).toBe(0);
  });

  it('US3-AS4: el curador no recibe puntajes ajenos antes de enviar; coordinación consulta el agregado', async () => {
    const e = await escenario();
    await evaluar(e, 0, 80, 70, 90).expect(200); await enviar(e, 0).expect(200);
    await evaluar(e, 1, 85, 85, 85).expect(200);

    const antes = await request(app.getHttpServer())
      .get(`${API}/curaduria/asignaciones/${e.curadores[1]!.asignacionId}/evaluacion`)
      .set(auth(e.curadores[1]!.cuentaId, 'curador')).expect(200);
    expect(antes.body.otrasEvaluaciones).toBeNull();
    expect(JSON.stringify(antes.body)).not.toContain('79.00');
    expect(antes.body.evaluacion).toMatchObject({ estado: 'borrador' });
    const lista = await request(app.getHttpServer()).get(`${API}/curaduria/asignaciones`).set(auth(e.curadores[1]!.cuentaId, 'curador')).expect(200);
    expect(lista.body).toHaveLength(1);
    expect(JSON.stringify(lista.body)).not.toContain('79.00');

    // No puede abrir la asignación del otro curador.
    await request(app.getHttpServer())
      .get(`${API}/curaduria/asignaciones/${e.curadores[0]!.asignacionId}/evaluacion`)
      .set(auth(e.curadores[1]!.cuentaId, 'curador')).expect(403);

    // Coordinación sí ve el agregado calculado.
    const agregado = await request(app.getHttpServer())
      .get(`${API}/panel/postulaciones/${e.postulacionId}/evaluacion`).set(auth(coordinacion, 'coordinación de convocatorias')).expect(200);
    expect(agregado.body.evaluaciones.map((x: { puntaje: string | null }) => x.puntaje).sort()).toEqual(['79.00', null].sort());
    expect(agregado.body).toMatchObject({ estado: 'en_evaluacion', pendientes: 1 });

    // Tras enviar la propia, ve las demás de forma anónima.
    await enviar(e, 1).expect(200);
    const despues = await request(app.getHttpServer())
      .get(`${API}/curaduria/asignaciones/${e.curadores[1]!.asignacionId}/evaluacion`)
      .set(auth(e.curadores[1]!.cuentaId, 'curador')).expect(200);
    expect(despues.body.otrasEvaluaciones).toEqual([{ puntaje: '79.00' }]);
    expect(JSON.stringify(despues.body.otrasEvaluaciones)).not.toContain(e.curadores[0]!.cuentaId);
    const final = await request(app.getHttpServer())
      .get(`${API}/panel/postulaciones/${e.postulacionId}/evaluacion`).set(auth(coordinacion, 'coordinación de convocatorias')).expect(200);
    expect(final.body).toMatchObject({ estado: 'evaluada', puntajeFinal: '82.00', pendientes: 0 });
  });

  it('US3-AS6: enviada es inmutable; solo coordinación reabre con motivo, audita y permite reenviar', async () => {
    const e = await escenario();
    await evaluar(e, 0, 80, 70, 90).expect(200); await enviar(e, 0).expect(200);
    await evaluar(e, 1, 85, 85, 85).expect(200); await enviar(e, 1).expect(200);
    expect((await estadoPostulacion(e.postulacionId)).estado).toBe('evaluada');

    // Inmutable para el curador.
    await evaluar(e, 0, 10, 10, 10).expect(409);
    await enviar(e, 0).expect(409);

    const evaluacion = await db.evaluacion.findUniqueOrThrow({ where: { asignacionId: e.curadores[0]!.asignacionId } });
    const ruta = `${API}/panel/evaluaciones/${evaluacion.id}/reabrir`;
    await request(app.getHttpServer()).post(ruta).set(auth(e.curadores[0]!.cuentaId, 'curador')).send({ motivo: 'Quiero cambiarla' }).expect(403);
    await request(app.getHttpServer()).post(ruta).set(auth(coordinacion, 'coordinación de convocatorias')).send({}).expect(400);
    await request(app.getHttpServer()).post(ruta).set(auth(coordinacion, 'coordinación de convocatorias')).send({ motivo: '   ' }).expect(400);
    await request(app.getHttpServer()).post(ruta).set(auth(provincialOtra, 'coordinación provincial', 'Pichincha')).send({ motivo: 'Ajena' }).expect(403);

    const reabierta = await request(app.getHttpServer()).post(ruta)
      .set(auth(provincialLoja, 'coordinación provincial', 'Loja')).send({ motivo: 'Error al calificar el criterio 2' }).expect(200);
    expect(reabierta.body).toMatchObject({ evaluacion: { estado: 'reabierta' }, postulacion: { estado: 'en_evaluacion', puntajeFinal: null } });
    await request(app.getHttpServer()).post(ruta).set(auth(coordinacion, 'coordinación de convocatorias')).send({ motivo: 'Otra vez' }).expect(409);

    const auditoria = await db.auditoria.findMany({ where: { postulacionId: e.postulacionId, accion: 'evaluacion_reabierta' } });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({
      actorCuentaId: provincialLoja, motivo: 'Error al calificar el criterio 2', estadoAnterior: 'enviada', estadoNuevo: 'reabierta',
    });
    expect(auditoria[0]!.correlacionId).toEqual(expect.any(String));

    // El curador corrige y reenvía; se recalcula el puntaje final.
    const lista = await request(app.getHttpServer()).get(`${API}/curaduria/asignaciones`).set(auth(e.curadores[0]!.cuentaId, 'curador')).expect(200);
    expect(lista.body[0].evaluacion).toMatchObject({ estado: 'reabierta' });
    await evaluar(e, 0, 90, 90, 90).expect(200);
    const reenvio = await enviar(e, 0).expect(200);
    expect(reenvio.body.evaluacion.puntaje).toBe('90.00');
    expect(reenvio.body.postulacion).toMatchObject({ estado: 'evaluada', puntajeFinal: '87.50' });
    const reenviada = await db.evaluacion.findUniqueOrThrow({ where: { id: evaluacion.id } });
    expect(reenviada.estado).toBe('enviada');
    expect(reenviada.enviadaEn).toEqual(expect.any(Date));
  });

  it('T034: roles y alcance en curaduría', async () => {
    const e = await escenario({ provincia: 'Loja' });
    const rutaLista = `${API}/curaduria/asignaciones`;
    await request(app.getHttpServer()).get(rutaLista).set(auth(randomUUID(), 'postulante')).expect(403);
    await request(app.getHttpServer()).get(rutaLista).set(auth(coordinacion, 'coordinación de convocatorias')).expect(403);
    await request(app.getHttpServer()).get(rutaLista).expect(401);
    // Un cuenta sin perfil de curador ve lista vacía y no puede abrir asignaciones.
    const sinPerfil = randomUUID();
    expect((await request(app.getHttpServer()).get(rutaLista).set(auth(sinPerfil, 'curador')).expect(200)).body).toEqual([]);
    await request(app.getHttpServer())
      .get(`${API}/curaduria/asignaciones/${e.curadores[0]!.asignacionId}/evaluacion`).set(auth(sinPerfil, 'curador')).expect(403);

    // Panel: listado filtrado por alcance provincial.
    const loja = await request(app.getHttpServer()).get(`${API}/panel/evaluaciones`).set(auth(provincialLoja, 'coordinación provincial', 'Loja')).expect(200);
    expect(loja.body.map((x: { postulacionId: string }) => x.postulacionId)).toContain(e.postulacionId);
    const otra = await request(app.getHttpServer()).get(`${API}/panel/evaluaciones`).set(auth(provincialOtra, 'coordinación provincial', 'Pichincha')).expect(200);
    expect(otra.body.map((x: { postulacionId: string }) => x.postulacionId)).not.toContain(e.postulacionId);
    await request(app.getHttpServer()).get(`${API}/panel/postulaciones/${e.postulacionId}/evaluacion`)
      .set(auth(provincialOtra, 'coordinación provincial', 'Pichincha')).expect(403);
    await request(app.getHttpServer()).get(`${API}/panel/evaluaciones`).set(auth(e.curadores[0]!.cuentaId, 'curador')).expect(403);
  });

  it('US3: una postulación admitida pasa a en_evaluacion al asignar el primer curador', async () => {
    const e = await escenario({ n: 0, estado: 'admitida' });
    const repo = new EvaluacionesPrismaRepository(db);
    const curador = randomUUID();
    await db.curador.create({ data: { id: curador, cuentaId: randomUUID(), disciplinas: ['teatro'], conflictos: [] } });
    await repo.asignarCurador(e.postulacionId, curador);
    expect((await estadoPostulacion(e.postulacionId)).estado).toBe('en_evaluacion');
    expect(await db.auditoria.count({ where: { postulacionId: e.postulacionId, accion: 'evaluacion_iniciada' } })).toBe(1);
  });
});
