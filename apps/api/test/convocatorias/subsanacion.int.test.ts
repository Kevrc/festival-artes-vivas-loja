import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import type { EventoPublicadoConvocatorias } from '@fiavl/contracts';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { AdmisionServicio } from '../../src/modules/convocatorias/application/admision/admision.servicio';
import { PostulacionesPrismaRepository } from '../../src/modules/convocatorias/infrastructure/postulaciones-prisma.repository';

const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
afterAll(async () => db.$disconnect());

const ahora = new Date('2026-07-01T12:00:00.000Z');
const vence = new Date('2026-07-04T12:00:00.000Z');
const coordinacion = randomUUID();

function publicadorFalso() {
  const eventos: EventoPublicadoConvocatorias[] = [];
  return {
    eventos,
    publicar: async (evento: EventoPublicadoConvocatorias) => {
      eventos.push(evento);
    },
  };
}

interface Fixture {
  convocatoriaId: string;
  elencoId: string;
  postulacionId: string;
  cuentaId: string;
  fingerprint: string;
}

async function crearPostulacion(opciones: {
  estado?: string;
  componente?: string;
  fingerprint?: string;
  subsanarHasta?: Date | null;
  cuentaId?: string;
} = {}): Promise<Fixture> {
  const convocatoriaId = randomUUID();
  const elencoId = randomUUID();
  const postulacionId = randomUUID();
  const cuentaId = opciones.cuentaId ?? randomUUID();
  const fingerprint = opciones.fingerprint ?? randomUUID();
  await db.convocatoria.create({
    data: {
      id: convocatoriaId,
      edicionId: randomUUID(),
      codigo: `T-${randomUUID()}`,
      componente: opciones.componente ?? 'nacional',
      abreEn: new Date('2026-01-01T00:00:00Z'),
      cierraEn: new Date('2027-01-01T00:00:00Z'),
      maxObrasPorElenco: 3,
      estado: 'abierta',
    },
  });
  await db.elenco.create({
    data: {
      id: elencoId,
      cuentaId,
      nombre: 'Elenco de prueba',
      responsable: 'Responsable',
      correoContacto: 'prueba@example.ec',
      provinciaPais: 'Loja',
      integrantes: [],
      trayectoria: 'Trayectoria de prueba',
    },
  });
  await db.postulacion.create({
    data: {
      id: postulacionId,
      convocatoriaId,
      elencoId,
      numero: `T-${randomUUID().slice(0, 8)}`,
      obraFingerprint: fingerprint,
      tituloObra: 'Obra de prueba',
      disciplina: 'teatro',
      sinopsis: 'Sinopsis de prueba',
      duracionMin: 60,
      publico: 'todo público',
      fichaTecnica: {},
      estado: opciones.estado ?? 'enviada',
      enviadaEn: ahora,
      primeraEnviadaEn: ahora,
      ...(opciones.subsanarHasta ? { subsanarHasta: opciones.subsanarHasta } : {}),
    },
  });
  return { convocatoriaId, elencoId, postulacionId, cuentaId, fingerprint };
}

describe('US2 · admisibilidad y subsanación sobre PostgreSQL', () => {
  it('US2-AS1: pide subsanación con plazo, auditoría y evento en la misma transacción', async () => {
    const fixture = await crearPostulacion({ estado: 'enviada' });
    const publicador = publicadorFalso();
    const servicio = new AdmisionServicio(new PostulacionesPrismaRepository(db, publicador), () => ahora);

    const actualizada = await servicio.resolver(fixture.postulacionId, coordinacion, {
      decision: 'subsanar',
      detalle: 'El dossier está ilegible',
    });

    expect(actualizada.estado).toBe('requiere_subsanacion');
    expect(actualizada.subsanarHasta?.toISOString()).toBe(vence.toISOString());
    const persistida = await db.postulacion.findUniqueOrThrow({ where: { id: fixture.postulacionId } });
    expect(persistida.estado).toBe('requiere_subsanacion');
    expect(persistida.subsanarHasta?.toISOString()).toBe(vence.toISOString());

    const auditoria = await db.auditoria.findFirstOrThrow({ where: { postulacionId: fixture.postulacionId } });
    expect(auditoria).toMatchObject({
      actorCuentaId: coordinacion,
      accion: 'subsanacion_solicitada',
      estadoAnterior: 'enviada',
      estadoNuevo: 'requiere_subsanacion',
      motivo: 'El dossier está ilegible',
    });
    expect(auditoria.correlacionId).toBeTruthy();

    expect(publicador.eventos).toHaveLength(1);
    expect(publicador.eventos[0]).toMatchObject({
      tipo: 'SubsanacionSolicitada',
      datos: { postulacionId: fixture.postulacionId, detalle: 'El dossier está ilegible', venceEn: vence.toISOString() },
    });
  });

  it('US2-AS1: revierte estado y auditoría si falla la publicación del evento', async () => {
    const fixture = await crearPostulacion({ estado: 'enviada' });
    const roto = { publicar: async () => { throw new Error('cola caída'); } };
    const servicio = new AdmisionServicio(new PostulacionesPrismaRepository(db, roto), () => ahora);

    await expect(
      servicio.resolver(fixture.postulacionId, coordinacion, { decision: 'subsanar', detalle: 'Corregir dossier' }),
    ).rejects.toThrow('cola caída');

    expect((await db.postulacion.findUniqueOrThrow({ where: { id: fixture.postulacionId } })).estado).toBe('enviada');
    expect(await db.auditoria.count({ where: { postulacionId: fixture.postulacionId } })).toBe(0);
  });

  it('US2-AS2/AS3: reenvía en plazo, admite y expira de forma idempotente', async () => {
    const fixture = await crearPostulacion({ estado: 'requiere_subsanacion', subsanarHasta: vence });
    const publicador = publicadorFalso();
    const servicio = new AdmisionServicio(new PostulacionesPrismaRepository(db, publicador), () => ahora);

    const reenviada = await servicio.reenviar(fixture.postulacionId, fixture.cuentaId);
    expect(reenviada.estado).toBe('enviada');
    expect(reenviada.subsanarHasta).toBeNull();
    const auditoriaReenvio = await db.auditoria.findFirstOrThrow({
      where: { postulacionId: fixture.postulacionId, accion: 'subsanacion_reenviada' },
    });
    expect(auditoriaReenvio).toMatchObject({ estadoAnterior: 'requiere_subsanacion', estadoNuevo: 'enviada' });
    expect(publicador.eventos.some((evento) => evento.tipo === 'PostulacionEnviada')).toBe(true);

    const admitida = await servicio.resolver(fixture.postulacionId, coordinacion, { decision: 'admitir' });
    expect(admitida.estado).toBe('admitida');
    const auditoriaAdmision = await db.auditoria.findFirstOrThrow({
      where: { postulacionId: fixture.postulacionId, accion: 'postulacion_admitida' },
    });
    expect(auditoriaAdmision).toMatchObject({ estadoAnterior: 'enviada', estadoNuevo: 'admitida' });

    const vencidaA = await crearPostulacion({ estado: 'requiere_subsanacion', subsanarHasta: new Date(ahora.getTime() - 1) });
    const vencidaB = await crearPostulacion({ estado: 'requiere_subsanacion', subsanarHasta: new Date(ahora.getTime() - 1) });
    expect(await servicio.expirarVencidas()).toBeGreaterThanOrEqual(2);
    expect(await servicio.expirarVencidas()).toBe(0);

    for (const vencida of [vencidaA, vencidaB]) {
      const persistida = await db.postulacion.findUniqueOrThrow({ where: { id: vencida.postulacionId } });
      expect(persistida.estado).toBe('no_admitida');
      const auditoria = await db.auditoria.findFirstOrThrow({
        where: { postulacionId: vencida.postulacionId, accion: 'subsanacion_vencida' },
      });
      expect(auditoria).toMatchObject({ estadoAnterior: 'requiere_subsanacion', estadoNuevo: 'no_admitida' });
      expect(auditoria.motivo).toContain('Plazo');
    }
  });

  it('US2-AS2/AS3: rechaza un reenvío posterior al vencimiento y deja no admitida', async () => {
    const fixture = await crearPostulacion({
      estado: 'requiere_subsanacion',
      subsanarHasta: new Date(ahora.getTime() - 1),
    });
    const servicio = new AdmisionServicio(
      new PostulacionesPrismaRepository(db, { publicar: async () => undefined }),
      () => ahora,
    );
    await expect(servicio.reenviar(fixture.postulacionId, fixture.cuentaId)).rejects.toThrow('Plazo');
    expect((await db.postulacion.findUniqueOrThrow({ where: { id: fixture.postulacionId } })).estado).toBe('no_admitida');
  });

  it('US2-AS4/RN-005: no admite una obra ya presentada en Camino a Loja', async () => {
    const fingerprint = randomUUID();
    await db.historialObraCamino.create({
      data: { id: randomUUID(), obraFingerprint: fingerprint, edicionAnio: 2025, referenciaFuente: 'prueba' },
    });
    const servicio = new AdmisionServicio(
      new PostulacionesPrismaRepository(db, { publicar: async () => undefined }),
      () => ahora,
    );

    const camino = await crearPostulacion({ estado: 'enviada', componente: 'Camino a Loja', fingerprint });
    const resultado = await servicio.resolver(camino.postulacionId, coordinacion, { decision: 'admitir' });
    expect(resultado.estado).toBe('no_admitida');
    const auditoria = await db.auditoria.findFirstOrThrow({ where: { postulacionId: camino.postulacionId } });
    expect(auditoria.estadoNuevo).toBe('no_admitida');
    expect(auditoria.motivo).toContain('RN-005');

    const nacional = await crearPostulacion({ estado: 'enviada', componente: 'nacional', fingerprint });
    const admitida = await servicio.resolver(nacional.postulacionId, coordinacion, { decision: 'admitir' });
    expect(admitida.estado).toBe('admitida');
  });
});
