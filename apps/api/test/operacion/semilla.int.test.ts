import { afterAll, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { EDICION_2026, funcionId } from '../../../../prisma/seed/edicion-2026';
import { seedOperacion } from '../../../../prisma/seed/operacion';

// T027: la semilla carga la edición 2026 en `operacion` con los mismos ids de 001 y 002.
const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
afterAll(() => db.$disconnect());

describe('semilla de Operación', () => {
  it('es idempotente y respeta las restricciones de cruce', async () => {
    const primera = await seedOperacion(db);
    await seedOperacion(db);
    expect(await db.funcionOperacion.count({ where: { edicionId: EDICION_2026 } })).toBe(primera.funciones);
    expect(await db.edicionOperacion.findUnique({ where: { id: EDICION_2026 } })).toMatchObject({ anio: 2026, estado: 'publicada' });
  });

  it('mismos ids de función que la cartelera y estados de demostración coherentes', async () => {
    const monas = await db.funcionOperacion.findUniqueOrThrow({ where: { id: funcionId('monas') }, include: { bloques: true, cambios: true } });
    expect(monas.estado).toBe('cancelada');
    expect(monas.bloques.every((b) => !b.activo)).toBe(true);
    expect(monas.cambios.map((c) => c.tipo)).toEqual(['cancelacion']);
    const hazmerreir = await db.funcionOperacion.findUniqueOrThrow({ where: { id: funcionId('hazmerreir-1') } });
    expect(hazmerreir.estado).toBe('reprogramada');
    expect(hazmerreir.inicio.toISOString()).toBe('2026-11-18T02:00:00.000Z');
  });

  it('una actividad continua ocupa su sede un bloque por día (research R1)', async () => {
    const bloques = await db.bloqueOcupacion.count({ where: { funcionId: funcionId('buddy') } });
    expect(bloques).toBe(11);
  });

  it('carga las cifras públicas de 2025 para la comparación interanual', async () => {
    expect(await db.cifrasHistoricas.findUnique({ where: { anio: 2025 } })).toMatchObject({ actividades: 313, paises: 18, asistenciaTotal: 163_162 });
  });
});
