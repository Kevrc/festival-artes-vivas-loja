import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ColaEventos } from '../../src/common/datos/datos.module';
import { enTransaccion } from '../../src/common/datos/transaccion';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { PublicadorPgBossConvocatorias } from '../../src/modules/convocatorias/infrastructure/publicador.pgboss';

class ColaReal extends ColaEventos { override get habilitada() { return true; } }
const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
const cola = new ColaReal();
const publicador = new PublicadorPgBossConvocatorias(cola);
const evento = () => ({
  id: randomUUID(), tipo: 'PostulacionEnviada' as const, version: 1 as const, ocurridoEn: new Date().toISOString(),
  edicionId: randomUUID(), correlacionId: randomUUID(),
  datos: { postulacionId: randomUUID(), convocatoriaId: randomUUID(), cuentaPostulanteId: randomUUID(), numero: 'PN-2026-9999', enviadaEn: new Date().toISOString() },
});
const encolados = async (id: string) => (await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM pgboss.job WHERE data->>'id' = $1`, id))[0]!.n;

beforeAll(async () => {
  process.env.DATABASE_URL = inject('databaseUrl');
  await publicador.onModuleInit();
});
afterAll(async () => { await cola.onModuleDestroy(); await db.$disconnect(); });

describe('publicación transaccional de Convocatorias (T020)', () => {
  it('valida el evento, conserva correlación y confirma o revierte junto al cambio', async () => {
    const e = evento();
    await expect(enTransaccion(db, async () => {
      await publicador.publicar(e);
      throw new Error('rollback intencional');
    })).rejects.toThrow('rollback intencional');
    expect(await encolados(e.id)).toBe(0);
    await enTransaccion(db, () => publicador.publicar(e));
    expect(await encolados(e.id)).toBe(1);
    await enTransaccion(db, () => publicador.publicar(e));
    expect(await encolados(e.id)).toBe(1);
  });
});
