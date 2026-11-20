import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/configurar-app';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import type { INestApplication } from '@nestjs/common';

const databaseUrl = inject('databaseUrl');
const db = new PrismaClient({ datasourceUrl: databaseUrl });
let app: INestApplication;
const cuenta = randomUUID();
const perfil = { nombre: 'Elenco API', responsable: 'Ana', correoContacto: 'api@example.ec', provinciaPais: 'Loja', trayectoria: 'Trayectoria', integrantes: ['Ana'] };
const obra = { titulo: 'Obra API', disciplina: 'teatro', sinopsis: 'Sinopsis', duracionMin: 45, publico: 'todo público', fichaTecnica: { montaje: 'liviano', integrantesEnGira: 4 }, videoUrl: 'https://youtu.be/api-fiavl' };

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = 'test';
  process.env.CONVOCATORIAS_ALMACENAMIENTO = 'memoria';
  process.env.CONVOCATORIAS_ANTIVIRUS = 'simulador';
  process.env.CONVOCATORIAS_FIRMA_SECRET = 'prueba-api-secreta';
  const convocatoriaId = randomUUID();
  await db.convocatoria.create({ data: { id: convocatoriaId, edicionId: randomUUID(), codigo: `PN-${randomUUID().slice(0, 8)}-2026`, componente: 'nacional', provincia: null, abreEn: new Date('2026-01-01T00:00:00Z'), cierraEn: new Date('2027-01-01T00:00:00Z'), maxObrasPorElenco: 3, estado: 'abierta' } });
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication(); configurarApp(app); await app.init();
  // Expuesto en el proceso de prueba para que las pruebas de ruta usen el fixture aislado.
  process.env.CONVOCATORIAS_TEST_ID = convocatoriaId;
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });

const auth = (id = cuenta) => ({ 'x-cuenta-dev': id, 'x-rol-dev': 'postulante' });

describe('API de postulación US1', () => {
  it('US1-AS2/FR-004/FR-016: conserva faltantes, carga documentos, envía y limita descargas a la cuenta propietaria', async () => {
    const list = await request(app.getHttpServer()).get('/api/convocatorias').expect(200);
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: process.env.CONVOCATORIAS_TEST_ID })]));
    const draft = await request(app.getHttpServer()).post('/api/convocatorias/postulaciones').set(auth()).send({ convocatoriaId: process.env.CONVOCATORIAS_TEST_ID, elenco: perfil, obra }).expect(201);
    const id = draft.body.id as string;
    const incompleta = await request(app.getHttpServer()).post(`/api/convocatorias/postulaciones/${id}/enviar`).set(auth()).expect(400);
    expect(incompleta.body.faltantes).toContain('documentos.dossier');
    expect((await request(app.getHttpServer()).get(`/api/convocatorias/postulaciones/${id}`).set(auth()).expect(200)).body.estado).toBe('borrador');

    const pdf = Buffer.from('%PDF-1.7\nArchivo de prueba');
    for (const tipo of ['dossier', 'ficha_tecnica']) {
      await request(app.getHttpServer()).post(`/api/convocatorias/postulaciones/${id}/documentos`).set(auth()).field('tipo', tipo)
        .attach('archivo', pdf, { filename: `${tipo}.pdf`, contentType: 'application/pdf' }).expect(201);
    }
    const acuse = await request(app.getHttpServer()).post(`/api/convocatorias/postulaciones/${id}/enviar`).set(auth()).expect(200);
    expect(acuse.body).toMatchObject({ estado: 'enviada', numero: expect.stringMatching(/^PN-.*-2026-0001$/) });
    const copia = await request(app.getHttpServer()).get(`/api/convocatorias/postulaciones/${id}/descarga`).set(auth()).expect(200);
    expect(copia.body.numero).toBe(acuse.body.numero);
    const documentoId = (await db.documento.findFirstOrThrow({ where: { postulacionId: id } })).id;
    const denegado = await request(app.getHttpServer()).get(`/api/convocatorias/documentos/${documentoId}/descarga`).set(auth(randomUUID())).expect(403);
    expect(denegado.body.status).toBe(403);
    const url = (await request(app.getHttpServer()).get(`/api/convocatorias/documentos/${documentoId}/descarga`).set(auth()).expect(200)).body.url as string;
    const firmada = new URL(url);
    expect(Number(firmada.searchParams.get('exp')) * 1000 - Date.now()).toBeLessThanOrEqual(300_000);
    const contenido = await request(app.getHttpServer()).get(`${firmada.pathname}${firmada.search}`).expect(200);
    expect(contenido.body).toBeDefined();
  });

  it('FR-004: rechaza un MIME declarado que no coincide con la firma', async () => {
    const cuentaMIME = randomUUID();
    const draft = await request(app.getHttpServer()).post('/api/convocatorias/postulaciones').set(auth(cuentaMIME)).send({ convocatoriaId: process.env.CONVOCATORIAS_TEST_ID, elenco: perfil, obra: { ...obra, titulo: 'Obra MIME' } }).expect(201);
    await request(app.getHttpServer()).post(`/api/convocatorias/postulaciones/${draft.body.id}/documentos`).set(auth(cuentaMIME)).field('tipo', 'dossier')
      .attach('archivo', Buffer.from('%PDF-1.7\nNo es PNG'), { filename: 'archivo.png', contentType: 'image/png' }).expect(400);
  });

  it('FR-004: responde 413 al superar 10 000 000 bytes', async () => {
    const cuentaLimite = randomUUID();
    const draft = await request(app.getHttpServer()).post('/api/convocatorias/postulaciones').set(auth(cuentaLimite)).send({ convocatoriaId: process.env.CONVOCATORIAS_TEST_ID, elenco: perfil, obra: { ...obra, titulo: 'Obra sobre límite' } }).expect(201);
    const exceso = Buffer.alloc(10_000_001); exceso.write('%PDF-1.7');
    await request(app.getHttpServer()).post(`/api/convocatorias/postulaciones/${draft.body.id}/documentos`).set(auth(cuentaLimite)).field('tipo', 'dossier')
      .attach('archivo', exceso, { filename: 'dossier.pdf', contentType: 'application/pdf' }).expect(413);
    await expect(db.documento.count({ where: { postulacionId: draft.body.id } })).resolves.toBe(0);
  });
});
