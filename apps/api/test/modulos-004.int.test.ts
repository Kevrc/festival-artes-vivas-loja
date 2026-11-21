import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { IDENTIDAD_PUBLICA } from '@fiavl/contracts';
import { afterAll, describe, expect, inject, it } from 'vitest';

// T006: los módulos de la spec 004 arrancan en el API y en el worker sin romper los existentes.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.LOG_LEVEL = 'silent';

const cerrar: (() => Promise<void>)[] = [];
afterAll(async () => {
  for (const c of cerrar) await c();
});

describe('registro de Operación e Identidad', () => {
  it('el API arranca con los cuatro módulos y ofrece IDENTIDAD_PUBLICA a todos', async () => {
    const { AppModule } = await import('../src/app.module');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = modulo.createNestApplication({ logger: false });
    await app.init();
    cerrar.push(() => app.close());
    const identidad = app.get(IDENTIDAD_PUBLICA);
    // Fuera de development/test el proveedor de desarrollo falla cerrado; aquí NODE_ENV=test.
    expect(await identidad.resolverSesion({ headers: {} })).toBeNull();
  });

  it('el worker compila con los consumidores de Operación e Identidad', async () => {
    const { WorkerModule } = await import('../src/worker.module');
    const modulo = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    expect(modulo).toBeDefined();
    cerrar.push(() => modulo.close());
  });
});
