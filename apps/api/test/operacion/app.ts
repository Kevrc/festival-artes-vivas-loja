import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { inject } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/index.js';

/** App Nest real de la spec 004 contra el PostgreSQL de Testcontainers, con reloj controlable. */
export async function crearAppOperacion() {
  process.env.DATABASE_URL = inject('databaseUrl');
  process.env.LOG_LEVEL = 'silent';
  const { AppModule } = await import('../../src/app.module');
  const { configurarApp } = await import('../../src/configurar-app');
  const { RELOJ_OPERACION } = await import('../../src/modules/operacion/application/puertos');
  const reloj = { ahora: new Date('2026-11-10T12:00:00-05:00') };
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RELOJ_OPERACION)
    .useValue(() => reloj.ahora)
    .compile();
  const app: INestApplication = modulo.createNestApplication({ logger: false });
  configurarApp(app);
  await app.init();
  const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
  return {
    app,
    db,
    reloj,
    http: () => request(app.getHttpServer()),
    cerrar: async () => {
      await app.close();
      await db.$disconnect();
    },
  };
}

export const programador = (cuentaId = randomUUID()) => ({ 'x-cuenta-dev': cuentaId, 'x-roles-dev': 'programador' });
export const conRol = (roles: string, cuentaId = randomUUID()) => ({ 'x-cuenta-dev': cuentaId, 'x-roles-dev': roles });

/** Edición con dos teatros, un elenco y dos obras, aislada por ids nuevos en cada llamada. */
export async function sembrarEdicion(db: PrismaClient, opciones: { anio?: number; estado?: 'planificacion' | 'publicada' | 'cerrada' } = {}) {
  const ids = {
    edicion: randomUUID(),
    bolivar: randomUUID(),
    nacional: randomUUID(),
    plaza: randomUUID(),
    elenco: randomUUID(),
    otroElenco: randomUUID(),
    cura: randomUUID(),
    zombi: randomUUID(),
    desistida: randomUUID(),
  };
  const anio = opciones.anio ?? 3000 + Math.floor(Math.random() * 6000);
  await db.edicionOperacion.create({
    data: {
      id: ids.edicion, numero: 'P', anio, fechaInicio: new Date('2026-11-12'), fechaFin: new Date('2026-11-22'),
      precioCentavos: 500, maxPagadasPersona: 6, maxReservasPersona: 4, estado: opciones.estado ?? 'planificacion',
    },
  });
  const acc = { sillaRuedas: true, banoAccesible: true, rampa: true };
  await db.sedeOperacion.createMany({
    data: [
      { id: ids.bolivar, edicionId: ids.edicion, nombre: 'Teatro Bolívar', tipo: 'teatro', direccion: 'Bolívar', lat: -4, lng: -79, aforo: 400, accesibilidad: acc, montajeMin: 30 },
      { id: ids.nacional, edicionId: ids.edicion, nombre: 'Teatro Nacional', tipo: 'teatro', direccion: 'Universitaria', lat: -4, lng: -79, aforo: 800, accesibilidad: acc, montajeMin: 30 },
      { id: ids.plaza, edicionId: ids.edicion, nombre: 'Plaza San Sebastián', tipo: 'espacio_publico', direccion: 'Lourdes', lat: -4, lng: -79, accesibilidad: acc, montajeMin: 15 },
    ],
  });
  await db.elencoOperacion.createMany({
    data: [
      { id: ids.elenco, nombre: 'Cano Artes Escénicas', pais: 'Ecuador', origen: 'invitado' },
      { id: ids.otroElenco, nombre: 'Santiago Sanguineti', pais: 'Uruguay', origen: 'invitado' },
    ],
  });
  await db.obraOperacion.createMany({
    data: [
      { id: ids.cura, edicionId: ids.edicion, elencoId: ids.elenco, titulo: 'El Cura sin cabeza', sinopsis: '', disciplina: 'teatro', componente: 'nacional', duracionMin: 90, origen: 'invitado' },
      { id: ids.zombi, edicionId: ids.edicion, elencoId: ids.otroElenco, titulo: 'Zombi Manifiesto', sinopsis: '', disciplina: 'teatro', componente: 'internacional', duracionMin: 120, origen: 'invitado' },
      { id: ids.desistida, edicionId: ids.edicion, elencoId: ids.otroElenco, titulo: 'Desistida', sinopsis: '', disciplina: 'teatro', componente: 'internacional', duracionMin: 60, origen: 'invitado', estado: 'desistida' },
    ],
  });
  return ids;
}
