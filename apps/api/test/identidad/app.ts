import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { inject } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { seedIdentidad } from '../../../../prisma/seed/identidad';

/** App Nest real de Identidad contra el PostgreSQL de Testcontainers, con reloj y correo en memoria. */
export async function crearAppIdentidad() {
  process.env.DATABASE_URL = inject('databaseUrl');
  process.env.LOG_LEVEL = 'silent';
  process.env.WEB_URL = 'https://fiavl.test';
  const { AppModule } = await import('../../src/app.module');
  const { configurarApp } = await import('../../src/configurar-app');
  const { RELOJ_IDENTIDAD, RELOJ_TOTP, PROVEEDOR_CORREO } = await import('../../src/modules/identidad/application/puertos');
  const { CorreoMemoria } = await import('../../src/modules/identidad/infrastructure/correo.adapters');
  const { PublicadorPgBossIdentidad } = await import('../../src/modules/identidad/infrastructure/publicador.pgboss');
  const reloj = { ahora: new Date('2026-11-10T12:00:00-05:00') };
  const correo = new CorreoMemoria();
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RELOJ_IDENTIDAD)
    .useValue(() => reloj.ahora)
    .overrideProvider(RELOJ_TOTP)
    .useValue(() => reloj.ahora)
    .overrideProvider(PROVEEDOR_CORREO)
    .useValue(correo)
    .compile();
  const app: INestApplication = modulo.createNestApplication({ logger: false });
  configurarApp(app);
  await app.init();
  const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
  await seedIdentidad(db);
  return {
    app,
    db,
    reloj,
    correo,
    publicados: app.get(PublicadorPgBossIdentidad).publicados,
    http: () => request(app.getHttpServer()),
    cerrar: async () => {
      await app.close();
      await db.$disconnect();
    },
  };
}

/** Correo único por prueba (las pruebas comparten base). */
export const correoUnico = (nombre = 'ana') => `${nombre}.${Math.random().toString(36).slice(2, 10)}@fiavl.test`;

/** Token del último enlace enviado a `para` (lo que haría la persona al abrir su correo). */
export function tokenDelCorreo(correo: { enviados: { para: string; texto: string }[] }, para: string): string {
  const mensaje = [...correo.enviados].reverse().find((m) => m.para === para);
  const token = mensaje?.texto.match(/token=([A-Za-z0-9_-]+)/)?.[1];
  if (!token) throw new Error(`No hay enlace enviado a ${para}`);
  return token;
}

/** Espera a que terminen los envíos sin bloqueo (se hacen después de responder). */
export const esperarEnvios = () => new Promise((r) => setTimeout(r, 50));
