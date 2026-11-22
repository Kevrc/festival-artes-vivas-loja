import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/index.js';

// T012: restricciones de la migración 004 que Prisma no modela (ADR-0010, research R16 y R20).
const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
const edicionId = randomUUID();
const sedeId = randomUUID();
const elencoId = randomUUID();
const obraId = randomUUID();
const autor = randomUUID();

async function nuevaFuncion(inicio: string, fin: string) {
  const id = randomUUID();
  await db.funcionOperacion.create({
    data: { id, edicionId, obraId, sedeId, elencoId, inicio: new Date(inicio), fin: new Date(fin), tipoAcceso: 'pagada', creadaPor: autor },
  });
  return id;
}

async function bloque(funcionId: string, sede: string, elenco: string, rangoSede: string, rangoElenco: string, activo = true) {
  await db.$executeRawUnsafe(
    `INSERT INTO operacion.bloque_ocupacion (id, funcion_id, sede_id, elenco_id, rango_sede, rango_elenco, activo)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::tstzrange, $6::tstzrange, $7)`,
    randomUUID(), funcionId, sede, elenco, rangoSede, rangoElenco, activo,
  );
}

beforeAll(async () => {
  await db.edicionOperacion.create({
    data: {
      id: edicionId, numero: 'T', anio: 2090, fechaInicio: new Date('2090-11-01'), fechaFin: new Date('2090-11-11'),
      precioCentavos: 500, maxPagadasPersona: 6, maxReservasPersona: 4,
    },
  });
  await db.sedeOperacion.create({
    data: { id: sedeId, edicionId, nombre: 'Teatro Bolívar', tipo: 'teatro', direccion: 'Loja', lat: -4, lng: -79, aforo: 800, accesibilidad: { rampa: true } },
  });
  await db.elencoOperacion.create({ data: { id: elencoId, nombre: 'Elenco', pais: 'Ecuador', origen: 'invitado' } });
  await db.obraOperacion.create({
    data: { id: obraId, edicionId, elencoId, titulo: 'Obra', sinopsis: '', disciplina: 'teatro', componente: 'nacional', duracionMin: 120, origen: 'invitado' },
  });
});
afterAll(() => db.$disconnect());

describe('migración 004: restricciones escritas a mano', () => {
  it('EXCLUDE de sede: dos bloques activos solapados en la misma sede se rechazan (SC-001)', async () => {
    const a = await nuevaFuncion('2090-11-02T19:00:00-05:00', '2090-11-02T21:00:00-05:00');
    const b = await nuevaFuncion('2090-11-02T21:15:00-05:00', '2090-11-02T23:15:00-05:00');
    await bloque(a, sedeId, randomUUID(), '[2090-11-02T19:00-05,2090-11-02T21:30-05)', '[2090-11-02T19:00-05,2090-11-02T21:00-05)');
    await expect(
      bloque(b, sedeId, randomUUID(), '[2090-11-02T21:15-05,2090-11-02T23:45-05)', '[2090-11-02T21:15-05,2090-11-02T23:15-05)'),
    ).rejects.toThrow(/bloque_sin_cruce_sede|23P01|exclusion/i);
    // US1-AS2: a las 21:30 ya no choca (rango semiabierto)
    await bloque(b, sedeId, randomUUID(), '[2090-11-02T21:30-05,2090-11-03T00:00-05)', '[2090-11-02T21:30-05,2090-11-02T23:30-05)');
  });

  it('EXCLUDE de elenco: el mismo elenco no puede estar en dos sedes a la vez (FR-003)', async () => {
    const f = await nuevaFuncion('2090-11-03T19:00:00-05:00', '2090-11-03T21:00:00-05:00');
    await bloque(f, randomUUID(), elencoId, '[2090-11-03T19:00-05,2090-11-03T21:30-05)', '[2090-11-03T19:00-05,2090-11-03T21:00-05)');
    await expect(
      bloque(f, randomUUID(), elencoId, '[2090-11-03T20:00-05,2090-11-03T22:30-05)', '[2090-11-03T20:00-05,2090-11-03T22:00-05)'),
    ).rejects.toThrow(/bloque_sin_cruce_elenco|23P01|exclusion/i);
  });

  it('un bloque inactivo (función cancelada) no bloquea la agenda', async () => {
    const f = await nuevaFuncion('2090-11-04T19:00:00-05:00', '2090-11-04T21:00:00-05:00');
    const s = randomUUID();
    await bloque(f, s, randomUUID(), '[2090-11-04T19:00-05,2090-11-04T21:30-05)', '[2090-11-04T19:00-05,2090-11-04T21:00-05)', false);
    await bloque(f, s, randomUUID(), '[2090-11-04T19:00-05,2090-11-04T21:30-05)', '[2090-11-04T19:00-05,2090-11-04T21:00-05)');
  });

  it('CHECK: aforo habilitado positivo y fin posterior al inicio', async () => {
    await expect(nuevaFuncion('2090-11-05T21:00:00-05:00', '2090-11-05T20:00:00-05:00')).rejects.toThrow(/funcion_rango/);
    await expect(
      db.funcionOperacion.create({
        data: {
          id: randomUUID(), edicionId, obraId, sedeId, elencoId, inicio: new Date('2090-11-05T19:00:00-05:00'),
          fin: new Date('2090-11-05T20:00:00-05:00'), tipoAcceso: 'pagada', aforoHabilitado: 0, creadaPor: autor,
        },
      }),
    ).rejects.toThrow(/funcion_aforo/);
  });

  it('único parcial de roles: un rol vigente por cuenta y alcance; revocado se puede volver a asignar', async () => {
    const cuentaId = randomUUID();
    await db.cuenta.create({ data: { id: cuentaId, nombre: 'Ana', correo: `${cuentaId}@fiavl.test` } });
    const rol = { cuentaId, rol: 'validador' as const, alcanceTipo: 'sede' as const, alcanceValor: sedeId, asignadoPor: autor };
    const primero = await db.rolAsignado.create({ data: { id: randomUUID(), ...rol } });
    await expect(db.rolAsignado.create({ data: { id: randomUUID(), ...rol } })).rejects.toThrow();
    await db.rolAsignado.update({ where: { id: primero.id }, data: { revocadoEn: new Date() } });
    await db.rolAsignado.create({ data: { id: randomUUID(), ...rol } });
  });

  it('auditoría y conteos son de solo inserción (FR-012, FR-024)', async () => {
    const id = randomUUID();
    await db.auditoriaOperacion.create({ data: { id, accion: 'prueba', entidad: 'funcion' } });
    await expect(db.auditoriaOperacion.update({ where: { id }, data: { accion: 'otra' } })).rejects.toThrow(/solo inserción/);
    await expect(db.auditoriaOperacion.delete({ where: { id } })).rejects.toThrow(/solo inserción/);
    const idIdentidad = randomUUID();
    await db.auditoriaIdentidad.create({ data: { id: idIdentidad, accion: 'prueba', entidad: 'cuenta' } });
    await expect(db.auditoriaIdentidad.delete({ where: { id: idIdentidad } })).rejects.toThrow(/solo inserción/);
    const funcionId = await nuevaFuncion('2090-11-06T19:00:00-05:00', '2090-11-06T20:00:00-05:00');
    const conteo = await db.conteoEstimado.create({ data: { id: randomUUID(), funcionId, cantidad: 1200, metodo: 'aforo visual', autorId: autor } });
    await expect(db.conteoEstimado.update({ where: { id: conteo.id }, data: { cantidad: 1 } })).rejects.toThrow(/solo inserción/);
  });
});
