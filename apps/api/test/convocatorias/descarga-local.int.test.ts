import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/configurar-app';
import { PrismaClient } from '../../src/generated/prisma/index.js';

/**
 * Regresión de CI: sin CONVOCATORIAS_FIRMA_SECRET (como en el job E2E, NODE_ENV=test → almacenamiento en memoria)
 * la URL firmada que emite la API debe poder descargarse. Antes firmaba y verificaba con secretos distintos (403).
 */
const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
let app: INestApplication;
const cuentaId = randomUUID();
const headers = { 'x-cuenta-dev': cuentaId, 'x-rol-dev': 'postulante' };

beforeAll(async () => {
  process.env.DATABASE_URL = inject('databaseUrl');
  process.env.NODE_ENV = 'test';
  delete process.env.CONVOCATORIAS_FIRMA_SECRET;
  delete process.env.CONVOCATORIAS_ALMACENAMIENTO;
  process.env.CONVOCATORIAS_ANTIVIRUS = 'simulador';
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  configurarApp(app);
  await app.init();
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });

describe('descarga de documentos con URL firmada local', () => {
  it('la URL emitida se puede descargar sin configurar el secreto de firma, y una firma alterada se rechaza', async () => {
    const convocatoriaId = randomUUID();
    const elencoId = randomUUID();
    const postulacionId = randomUUID();
    await db.convocatoria.create({
      data: {
        id: convocatoriaId, edicionId: randomUUID(), codigo: `D-${randomUUID()}`, componente: 'nacional', abreEn: new Date('2026-01-01T00:00:00Z'),
        cierraEn: new Date('2099-01-01T00:00:00Z'), maxObrasPorElenco: 3, estado: 'abierta',
      },
    });
    await db.elenco.create({
      data: { id: elencoId, cuentaId, nombre: 'Elenco', responsable: 'R', correoContacto: 'd@example.ec', provinciaPais: 'Loja', integrantes: [], trayectoria: 'T' },
    });
    await db.postulacion.create({
      data: {
        id: postulacionId, convocatoriaId, elencoId, numero: `BORRADOR-${randomUUID()}`, obraFingerprint: randomUUID(), tituloObra: 'Obra', disciplina: 'teatro',
        sinopsis: 'S', duracionMin: 50, publico: 'todo', fichaTecnica: {}, estado: 'borrador',
      },
    });
    const subida = await request(app.getHttpServer())
      .post(`/api/convocatorias/postulaciones/${postulacionId}/documentos`).set(headers)
      .field('tipo', 'dossier').attach('archivo', Buffer.from('%PDF-1.7\ncontenido privado'), { filename: 'dossier.pdf', contentType: 'application/pdf' })
      .expect(201);
    const { url } = (await request(app.getHttpServer()).get(`/api/convocatorias/documentos/${subida.body.id}/descarga`).set(headers).expect(200)).body as { url: string };

    const local = new URL(url);
    const ruta = `${local.pathname}${local.search}`;
    const descarga = await request(app.getHttpServer()).get(ruta).expect(200);
    expect(descarga.headers['content-disposition']).toContain('dossier.pdf');
    expect(Buffer.from(descarga.body).toString()).toContain('contenido privado');

    local.searchParams.set('sig', '0'.repeat(64));
    await request(app.getHttpServer()).get(`${local.pathname}${local.search}`).expect(403);
  });
});
