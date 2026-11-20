import { ejemplo } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { AplicarEventoOperacion } from '../../src/modules/boleteria/application/eventos/aplicar-evento-operacion';
import { PrismaBoleteriaRepository } from '../../src/modules/boleteria/infrastructure/prisma-boleteria.repository';
import { PublicadorPgBossBoleteria } from '../../src/modules/boleteria/infrastructure/publicador.pgboss';
import { datosFuncion, edicion2026, limpiar } from '../programacion/fixtures';

const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
let publicador: PublicadorPgBossBoleteria;
let aplicar: AplicarEventoOperacion;

async function limpiarBoleteria() {
  await limpiar(db);
  await db.$executeRawUnsafe(
    'TRUNCATE boleteria.movimiento_caja, boleteria.movimiento_pago, boleteria.ingreso, boleteria.entrada, boleteria.pedido, boleteria.caja, boleteria.inventario_funcion, boleteria.edicion_boleteria, boleteria.auditoria_boleteria, boleteria.evento_procesado CASCADE',
  );
}

beforeAll(() => db.$connect());
afterAll(() => db.$disconnect());
beforeEach(async () => {
  await limpiarBoleteria();
  publicador = new PublicadorPgBossBoleteria();
  aplicar = new AplicarEventoOperacion(new PrismaBoleteriaRepository(db), publicador, () => new Date('2026-11-14T12:00:00-05:00'));
});

describe('consumidor idempotente de Operación en Boletería (T008)', () => {
  it('un evento repetido no duplica ni vuelve a aplicarse', async () => {
    const edicionId = crypto.randomUUID();
    const evento = ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, aforoHabilitado: 300 }));
    expect(await aplicar.ejecutar(evento)).toEqual({ aplicado: true });
    expect(await aplicar.ejecutar(evento)).toEqual({ aplicado: false });
    expect(await db.inventarioFuncion.count()).toBe(1);
    expect(await db.eventoProcesadoBoleteria.count()).toBe(1);
  });

  it('ignora una versión anterior llegada fuera de orden', async () => {
    const edicionId = crypto.randomUUID();
    const funcionId = crypto.randomUUID();
    await aplicar.ejecutar(
      ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId, version: 3, aforoHabilitado: 400 })),
    );
    await aplicar.ejecutar(
      ejemplo.funcionProgramada(edicionId, datosFuncion({ edicionId, funcionId, version: 2, aforoHabilitado: 100 })),
    );
    const inv = await db.inventarioFuncion.findUniqueOrThrow({ where: { funcionId } });
    expect(inv.versionOrigen).toBe(3);
    expect(inv.aforoHabilitado).toBe(400);
  });

  it('ProgramacionPublicada aplica parámetros por defecto (500, 6, 4) si EdicionDto los omite', async () => {
    const edicionId = crypto.randomUUID();
    await aplicar.ejecutar(edicion2026(edicionId));
    const ed = await db.edicionBoleteria.findUniqueOrThrow({ where: { id: edicionId } });
    expect(ed.estado).toBe('publicada');
    expect(ed.precioCentavos).toBe(500);
    expect(ed.maxPagadasPersona).toBe(6);
    expect(ed.maxReservasPersona).toBe(4);
  });
});
