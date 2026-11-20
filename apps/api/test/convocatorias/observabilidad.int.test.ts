import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { registro } from '../../src/common/observabilidad/metricas';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { AdmisionServicio } from '../../src/modules/convocatorias/application/admision/admision.servicio';
import { EvaluacionesPrismaRepository } from '../../src/modules/convocatorias/infrastructure/evaluaciones-prisma.repository';
import { fijarObservador, ObservadorConvocatorias } from '../../src/modules/convocatorias/infrastructure/observabilidad-convocatorias';
import { PostulacionesPrismaRepository } from '../../src/modules/convocatorias/infrastructure/postulaciones-prisma.repository';

const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
afterAll(async () => db.$disconnect());

const ahora = new Date('2026-07-01T12:00:00.000Z');
const publicador = { publicar: async () => undefined };
const logs: Array<{ datos: Record<string, unknown>; mensaje: string }> = [];
let restaurar: () => void;
beforeEach(() => {
  logs.length = 0;
  restaurar = fijarObservador(new ObservadorConvocatorias({ log: (datos, mensaje) => { logs.push({ datos, mensaje }); } }));
});
afterEach(() => restaurar());

const contador = async (nombre: string, etiquetas: Record<string, string> = {}) => {
  const metrica = (await registro.getMetricsAsJSON()).find((m) => m.name === nombre);
  return metrica?.values.find((v) => Object.entries(etiquetas).every(([k, x]) => (v.labels as Record<string, string>)[k] === x))?.value ?? 0;
};

async function postulacion(estado: string, subsanarHasta?: Date) {
  const convocatoriaId = randomUUID(); const elencoId = randomUUID(); const id = randomUUID();
  await db.convocatoria.create({
    data: { id: convocatoriaId, edicionId: randomUUID(), codigo: `O-${randomUUID()}`, componente: 'nacional', abreEn: new Date('2026-01-01T00:00:00Z'), cierraEn: new Date('2027-01-01T00:00:00Z'), maxObrasPorElenco: 3, estado: 'abierta' },
  });
  await db.elenco.create({
    data: { id: elencoId, cuentaId: randomUUID(), nombre: 'Elenco Ana Torres', responsable: 'Ana Torres', correoContacto: 'ana.torres@example.ec', provinciaPais: 'Loja', integrantes: ['Ana Torres'], trayectoria: 'T' },
  });
  await db.postulacion.create({
    data: {
      id, convocatoriaId, elencoId, numero: `O-${randomUUID().slice(0, 8)}`, obraFingerprint: randomUUID(), tituloObra: 'Obra', disciplina: 'teatro', sinopsis: 'S', duracionMin: 50,
      publico: 'todo', fichaTecnica: {}, estado, enviadaEn: ahora, primeraEnviadaEn: ahora, ...(subsanarHasta ? { subsanarHasta } : {}),
    },
  });
  return { id, cuentaId: (await db.elenco.findUniqueOrThrow({ where: { id: elencoId } })).cuentaId };
}

describe('T050 · correlación y métricas de Convocatorias', () => {
  it('cada cambio de estado deja un log con la misma correlacionId que su fila de auditoría, sin datos personales', async () => {
    const repo = new PostulacionesPrismaRepository(db, publicador);
    const admision = new AdmisionServicio(repo, () => ahora);
    const { id, cuentaId } = await postulacion('enviada');
    const solicitadas = await contador('convocatorias_subsanaciones_total', { evento: 'solicitada' });
    const reenviadas = await contador('convocatorias_subsanaciones_total', { evento: 'reenviada' });

    await admision.resolver(id, randomUUID(), { decision: 'subsanar', detalle: 'Detalle con datos de Ana Torres' });
    await admision.reenviar(id, cuentaId);

    const auditoria = await db.auditoria.findMany({ where: { postulacionId: id }, orderBy: { registradoEn: 'asc' } });
    expect(auditoria.map((a) => a.accion)).toEqual(['subsanacion_solicitada', 'subsanacion_reenviada']);
    const eventos = logs.filter((l) => l.datos.evento);
    expect(eventos.map((l) => l.datos.evento)).toEqual(['subsanacion_solicitada', 'subsanacion_reenviada']);
    eventos.forEach((l, i) => expect(l.datos.correlacionId).toBe(auditoria[i]!.correlacionId));
    // El log de la operación lleva la correlación de su primer evento y una duración.
    expect(logs.find((l) => l.datos.operacion === 'resolver_admisibilidad')?.datos).toMatchObject({ resultado: 'ok', correlacionId: auditoria[0]!.correlacionId });
    expect(JSON.stringify(logs)).not.toMatch(/Ana Torres|ana\.torres|Detalle con datos/);
    expect(await contador('convocatorias_subsanaciones_total', { evento: 'solicitada' })).toBe(solicitadas + 1);
    expect(await contador('convocatorias_subsanaciones_total', { evento: 'reenviada' })).toBe(reenviadas + 1);
  });

  it('el trabajo de expiración registra el vencimiento con la correlación auditada', async () => {
    const repo = new PostulacionesPrismaRepository(db, publicador);
    const antes = await contador('convocatorias_expiraciones_total');
    const { id } = await postulacion('requiere_subsanacion', new Date(ahora.getTime() - 1000));
    expect(await new AdmisionServicio(repo, () => ahora).expirarVencidas()).toBeGreaterThanOrEqual(1);
    const fila = await db.auditoria.findFirstOrThrow({ where: { postulacionId: id, accion: 'subsanacion_vencida' } });
    expect(logs.find((l) => l.datos.evento === 'subsanacion_vencida' && l.datos.correlacionId === fila.correlacionId)).toBeDefined();
    expect(await contador('convocatorias_expiraciones_total')).toBeGreaterThanOrEqual(antes + 1);
  });

  it('una operación que revierte no deja eventos ni métricas de negocio', async () => {
    const repo = new PostulacionesPrismaRepository(db, publicador);
    const { id } = await postulacion('enviada');
    const antes = await contador('convocatorias_admisibilidad_total', { resultado: 'admitida' });
    // Un id inexistente falla antes de confirmar nada.
    await expect(repo.resolverAdmisibilidad({ postulacionId: randomUUID(), decision: 'admitir', ahora })).rejects.toThrow();
    expect(logs.some((l) => l.datos.evento === 'postulacion_admitida')).toBe(false);
    expect(logs.some((l) => l.datos.resultado === 'error')).toBe(true);
    expect(await contador('convocatorias_admisibilidad_total', { resultado: 'admitida' })).toBe(antes);
    expect((await db.postulacion.findUniqueOrThrow({ where: { id } })).estado).toBe('enviada');
  });

  it('la evaluación enviada y la reapertura emiten eventos correlacionados', async () => {
    const repo = new EvaluacionesPrismaRepository(db);
    const { id } = await postulacion('en_evaluacion');
    const postulacionRow = await db.postulacion.findUniqueOrThrow({ where: { id } });
    const criterios: string[] = [];
    for (const [nombre, peso] of [['A', 50], ['B', 30], ['C', 20]] as const) {
      const cid = randomUUID(); criterios.push(cid);
      await db.criterio.create({ data: { id: cid, convocatoriaId: postulacionRow.convocatoriaId, nombre, descripcion: nombre, peso } });
    }
    const curadorId = randomUUID(); const cuentaCurador = randomUUID(); const asignacionId = randomUUID();
    await db.curador.create({ data: { id: curadorId, cuentaId: cuentaCurador, disciplinas: ['teatro'], conflictos: [] } });
    await db.asignacion.create({ data: { id: asignacionId, postulacionId: id, curadorId, estado: 'asignada' } });
    await repo.guardarEvaluacion(cuentaCurador, asignacionId, { calificaciones: criterios.map((criterioId) => ({ criterioId, puntaje: 80 })), observaciones: 'Observación privada' });
    await repo.enviarEvaluacion(cuentaCurador, asignacionId, ahora);
    const evaluacion = await db.evaluacion.findUniqueOrThrow({ where: { asignacionId } });
    await repo.reabrirEvaluacion({ evaluacionId: evaluacion.id, actorCuentaId: randomUUID(), motivo: 'Motivo con datos personales', ahora, provinciaPermitida: () => true });

    const auditoria = await db.auditoria.findMany({ where: { postulacionId: id, accion: { in: ['evaluacion_enviada', 'evaluacion_reabierta'] } } });
    for (const fila of auditoria) {
      expect(logs.find((l) => l.datos.evento === fila.accion && l.datos.correlacionId === fila.correlacionId), fila.accion).toBeDefined();
    }
    expect(await contador('convocatorias_evaluaciones_total', { evento: 'enviada' })).toBeGreaterThanOrEqual(1);
    expect(await contador('convocatorias_evaluaciones_total', { evento: 'reabierta' })).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(logs)).not.toMatch(/Observación privada|Motivo con datos personales/);
    expect(await registro.metrics()).toMatch(/convocatorias_operacion_duracion_segundos_count\{operacion="enviar_evaluacion",resultado="ok"\} \d+/);
  });
});
