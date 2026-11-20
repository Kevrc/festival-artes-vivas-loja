import { afterAll, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { seedConvocatorias, SEED_CONVOCATORIA_ID } from '../../../../prisma/seed/convocatorias';
import { MemoriaAlmacenamientoDocumentos } from '../../src/modules/convocatorias/infrastructure/almacenamiento-memoria.adapter';

const databaseUrl = inject('databaseUrl');
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const almacenamiento = new MemoriaAlmacenamientoDocumentos();

afterAll(async () => db.$disconnect());

describe('seed de Convocatorias (T005)', () => {
  it('es idempotente, conserva fixtures con estados distintos y sus documentos en almacenamiento', async () => {
    await seedConvocatorias(db, almacenamiento);
    await seedConvocatorias(db, almacenamiento);
    const convocatoria = await db.convocatoria.findUniqueOrThrow({
      where: { id: SEED_CONVOCATORIA_ID },
      include: { postulaciones: { include: { documentos: true, asignaciones: { include: { curador: true } } } } },
    });
    expect(new Set(convocatoria.postulaciones.map(({ estado }) => estado))).toEqual(new Set(['enviada', 'requiere_subsanacion', 'admitida', 'en_evaluacion']));
    expect(convocatoria.postulaciones.filter(({ asignaciones }) => asignaciones.length > 0).length).toBeGreaterThan(0);
    for (const postulacion of convocatoria.postulaciones) {
      for (const documento of postulacion.documentos) await expect(almacenamiento.leer(documento.objectKey)).resolves.toMatchObject({ length: documento.bytes });
    }
    expect(await db.postulacion.count({ where: { convocatoriaId: convocatoria.id } })).toBe(4);
    expect(await db.historialObraCamino.count({ where: { edicionAnio: 2025 } })).toBeGreaterThan(0);
  });
});
