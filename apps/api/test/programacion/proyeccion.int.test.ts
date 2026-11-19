import { ejemplo } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { AplicarEvento } from '../../src/modules/programacion/application/proyeccion/aplicar-evento';
import { PrismaCarteleraRepository } from '../../src/modules/programacion/infrastructure/prisma-cartelera.repository';
import { datosFuncion, edicion2026, limpiar, nuevoId } from './fixtures';

const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
const revalidadas: string[][] = [];
const aplicar = new AplicarEvento(new PrismaCarteleraRepository(db), {
  revalidar: async (tags) => void revalidadas.push(tags),
});

beforeAll(() => db.$connect());
afterAll(() => db.$disconnect());
beforeEach(async () => {
  await limpiar(db);
  revalidadas.length = 0;
});

describe('proyección de la cartelera (T014)', () => {
  it('un evento repetido no duplica ni vuelve a aplicarse', async () => {
    const edicionId = nuevoId();
    const evento = ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId }));
    await aplicar.ejecutar(evento);
    await aplicar.ejecutar(evento);
    expect(await db.funcionCartelera.count()).toBe(1);
    expect(await db.eventoProcesado.count()).toBe(1);
  });

  it('ignora una versión anterior de la función (llegada fuera de orden)', async () => {
    const edicionId = nuevoId();
    const funcionId = nuevoId();
    await aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId, version: 3, titulo: 'Nueva' })));
    await aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId, version: 2, titulo: 'Vieja' })));
    const f = await db.funcionCartelera.findUniqueOrThrow({ where: { id: funcionId }, include: { obra: true } });
    expect(f.versionOrigen).toBe(3);
    expect(f.obra.titulo).toBe('Nueva');
  });

  it('FuncionReprogramada guarda el horario anterior y revalida el día anterior y el nuevo', async () => {
    const edicionId = nuevoId();
    const funcionId = nuevoId();
    const sedeId = nuevoId();
    await aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId, sedeId })));
    revalidadas.length = 0;
    await aplicar.ejecutar(
      ejemplo.funcionReprogramada(edicionId, {
        funcionId,
        version: 2,
        anterior: { inicio: '2026-11-14T19:00:00-05:00', fin: '2026-11-14T20:30:00-05:00', sedeId },
        nuevo: { inicio: '2026-11-15T19:00:00-05:00', fin: '2026-11-15T20:30:00-05:00', sedeId },
        motivo: 'lluvia',
      }),
    );
    const f = await db.funcionCartelera.findUniqueOrThrow({ where: { id: funcionId } });
    expect(f.estado).toBe('reprogramada');
    expect(f.horarioAnterior).toMatchObject({ sedeId });
    expect(f.diaFestival.toISOString().slice(0, 10)).toBe('2026-11-15');
    expect(revalidadas.flat()).toEqual(expect.arrayContaining(['dia:2026-11-14', 'dia:2026-11-15']));
  });

  it('FuncionCancelada marca la función como cancelada', async () => {
    const edicionId = nuevoId();
    const funcionId = nuevoId();
    await aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId })));
    await aplicar.ejecutar(ejemplo.funcionCancelada(edicionId, { funcionId, version: 2 }));
    expect((await db.funcionCartelera.findUniqueOrThrow({ where: { id: funcionId } })).estado).toBe('cancelada');
  });

  it('una función que llega antes que su edición queda guardada pero la edición no es visible', async () => {
    const edicionId = nuevoId();
    await aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId })));
    expect((await db.edicionCartelera.findUniqueOrThrow({ where: { id: edicionId } })).estado).toBe('borrador');
    await aplicar.ejecutar(edicion2026(edicionId));
    const ed = await db.edicionCartelera.findUniqueOrThrow({ where: { id: edicionId } });
    expect(ed.estado).toBe('publicada');
    expect(ed.numero).toBe('XI');
  });

  it('DisponibilidadCambiada guarda el aforo habilitado y descarta valores más viejos', async () => {
    const edicionId = nuevoId();
    const funcionId = nuevoId();
    await aplicar.ejecutar(ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId })));
    const nuevo = new Date('2026-11-10T12:00:00Z').toISOString();
    const viejo = new Date('2026-11-10T11:00:00Z').toISOString();
    await aplicar.ejecutar(ejemplo.disponibilidadCambiada(edicionId, { funcionId, lugaresRestantes: 5, aforoHabilitado: 100, calculadoEn: nuevo }));
    await aplicar.ejecutar(ejemplo.disponibilidadCambiada(edicionId, { funcionId, lugaresRestantes: 50, aforoHabilitado: 100, calculadoEn: viejo }));
    const f = await db.funcionCartelera.findUniqueOrThrow({ where: { id: funcionId } });
    expect(f.lugaresRestantes).toBe(5);
    expect(f.aforoHabilitado).toBe(100);
    expect(f.disponibilidad).toBe('ultimos_lugares');
  });

  it('rechaza un evento que no cumple el contrato', async () => {
    await expect(aplicar.ejecutar({ tipo: 'FuncionCancelada' } as never)).rejects.toThrow();
  });
});
