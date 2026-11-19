import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { inject } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '../../src/generated/prisma/index.js';

/** App Nest real contra el PostgreSQL de Testcontainers, con reloj y revalidador controlables. */
export async function crearApp(opciones: { ahora?: () => Date } = {}) {
  process.env.DATABASE_URL = inject('databaseUrl');
  process.env.LOG_LEVEL = 'silent';
  const { AppModule } = await import('../../src/app.module');
  const { configurarApp } = await import('../../src/configurar-app');
  const { RELOJ, REVALIDADOR } = await import('../../src/modules/programacion/application/puertos');
  const { AplicarEvento } = await import('../../src/modules/programacion/application/proyeccion/aplicar-evento');
  const revalidadas: string[] = [];
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RELOJ)
    .useValue(opciones.ahora ?? (() => new Date('2026-11-14T12:00:00-05:00')))
    .overrideProvider(REVALIDADOR)
    .useValue({ revalidar: async (t: string[]) => void revalidadas.push(...t) })
    .compile();
  const app: INestApplication = modulo.createNestApplication({ logger: false });
  configurarApp(app);
  await app.init();
  const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
  return {
    app,
    db,
    revalidadas,
    aplicar: app.get(AplicarEvento),
    http: () => request(app.getHttpServer()),
    cerrar: async () => {
      await app.close();
      await db.$disconnect();
    },
  };
}
