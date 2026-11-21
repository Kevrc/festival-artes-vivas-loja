import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { PrismaConvocatoriasRepository } from '../../src/modules/convocatorias/infrastructure/prisma-convocatorias.repository';

const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
afterAll(async () => db.$disconnect());

describe('auditoría append-only de Convocatorias (T019)', () => {
  it('SQL rechaza UPDATE y DELETE, y conserva checks del modelo', async () => {
    const convocatoriaId = randomUUID();
    const elencoId = randomUUID();
    const postulacionId = randomUUID();
    const auditoriaId = randomUUID();
    await db.convocatoria.create({ data: {
      id: convocatoriaId, edicionId: randomUUID(), codigo: `INT-${randomUUID()}`, componente: 'nacional',
      abreEn: new Date('2026-01-01T00:00:00Z'), cierraEn: new Date('2027-01-01T00:00:00Z'), maxObrasPorElenco: 3,
    } });
    await db.elenco.create({ data: {
      id: elencoId, cuentaId: randomUUID(), nombre: 'Fixture', responsable: 'Responsable', correoContacto: 'fixture@example.org',
      provinciaPais: 'Loja', integrantes: [], trayectoria: 'Fixture de integración',
    } });
    await db.postulacion.create({ data: {
      id: postulacionId, convocatoriaId, elencoId, numero: 'INT-0001', obraFingerprint: randomUUID(), tituloObra: 'Obra test',
      disciplina: 'teatro', sinopsis: 'Ficha de integración', duracionMin: 60, publico: 'todo público', fichaTecnica: {}, estado: 'enviada',
    } });
    await expect(db.postulacion.create({ data: {
      id: randomUUID(), convocatoriaId, elencoId, numero: 'INT-0001', obraFingerprint: randomUUID(), tituloObra: 'Duplicada',
      disciplina: 'teatro', sinopsis: 'Debe chocar con número existente', duracionMin: 60, publico: 'todo público', fichaTecnica: {},
    } })).rejects.toThrow();
    await db.auditoria.create({ data: { id: auditoriaId, postulacionId, accion: 'test_append_only' } });
    const repo = new PrismaConvocatoriasRepository(db);
    await expect(repo.obtenerPostulacion(postulacionId)).resolves.toEqual({ id: postulacionId, cuentaPropietariaId: expect.any(String) });
    await repo.registrarAuditoria({ id: randomUUID(), postulacionId, accion: 'registro_por_repositorio' });
    const rollbackAuditId = randomUUID();
    await expect(repo.ejecutar(async () => {
      await repo.registrarAuditoria({ id: rollbackAuditId, postulacionId, accion: 'rollback_test' });
      throw new Error('rollback auditoría');
    })).rejects.toThrow('rollback auditoría');
    expect(await db.auditoria.count({ where: { id: rollbackAuditId } })).toBe(0);
    await expect(db.$executeRaw`UPDATE convocatorias.auditoria SET accion = 'mutada' WHERE id = ${auditoriaId}::uuid`).rejects.toThrow();
    await expect(db.$executeRaw`DELETE FROM convocatorias.auditoria WHERE id = ${auditoriaId}::uuid`).rejects.toThrow();
    const constraints = await db.$queryRaw<Array<{ conname: string }>>`SELECT conname FROM pg_constraint WHERE connamespace = 'convocatorias'::regnamespace`;
    expect(constraints.map(({ conname }) => conname)).toContain('documento_bytes_check');
    const triggers = await db.$queryRaw<Array<{ tgname: string }>>`SELECT tgname FROM pg_trigger WHERE tgrelid = 'convocatorias.auditoria'::regclass AND NOT tgisinternal`;
    expect(triggers.map(({ tgname }) => tgname)).toContain('auditoria_append_only');
  });
});
