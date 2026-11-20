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

const coordinacion = randomUUID();
const provincialLoja = randomUUID();
const provincialOtra = randomUUID();
const ahora = new Date('2026-07-01T12:00:00.000Z');

interface Fixture {
  convocatoriaId: string;
  elencoId: string;
  postulacionId: string;
  cuentaId: string;
}

async function crearPostulacion(opciones: {
  estado?: string;
  provincia?: string | null;
  subsanarHasta?: Date | null;
} = {}): Promise<Fixture> {
  const convocatoriaId = randomUUID();
  const elencoId = randomUUID();
  const postulacionId = randomUUID();
  const cuentaId = randomUUID();
  await db.convocatoria.create({
    data: {
      id: convocatoriaId, edicionId: randomUUID(), codigo: `T-${randomUUID()}`, componente: 'nacional',
      provincia: opciones.provincia ?? 'Loja', abreEn: new Date('2026-01-01T00:00:00Z'),
      cierraEn: new Date('2027-01-01T00:00:00Z'), maxObrasPorElenco: 3, estado: 'abierta',
    },
  });
  await db.elenco.create({
    data: {
      id: elencoId, cuentaId, nombre: 'Elenco API admisión', responsable: 'Responsable',
      correoContacto: 'admision@example.ec', provinciaPais: 'Loja', integrantes: [], trayectoria: 'Trayectoria',
    },
  });
  await db.postulacion.create({
    data: {
      id: postulacionId, convocatoriaId, elencoId, numero: `T-${randomUUID().slice(0, 8)}`,
      obraFingerprint: randomUUID(), tituloObra: 'Obra admisión', disciplina: 'teatro',
      sinopsis: 'Sinopsis', duracionMin: 50, publico: 'todo público', fichaTecnica: {},
      estado: opciones.estado ?? 'enviada', enviadaEn: ahora, primeraEnviadaEn: ahora,
      ...(opciones.subsanarHasta ? { subsanarHasta: opciones.subsanarHasta } : {}),
    },
  });
  return { convocatoriaId, elencoId, postulacionId, cuentaId };
}

const auth = (cuentaId: string, rol: string, provincia?: string) => ({
  'x-cuenta-dev': cuentaId,
  'x-rol-dev': rol,
  ...(provincia ? { 'x-provincia-dev': provincia } : {}),
});

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = 'test';
  process.env.CONVOCATORIAS_ALMACENAMIENTO = 'memoria';
  process.env.CONVOCATORIAS_ANTIVIRUS = 'simulador';
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  configurarApp(app);
  await app.init();
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });

describe('API de admisibilidad y subsanación US2', () => {
  it('US2-AS1/AS2: la coordinación pide corrección, el elenco reenvía y luego es admitida', async () => {
    const fixture = await crearPostulacion({ estado: 'enviada', provincia: 'Loja' });
    const coordinadorAuth = auth(coordinacion, 'coordinación de convocatorias');

    const listado = await request(app.getHttpServer())
      .get('/api/convocatorias/panel/postulaciones')
      .set(coordinadorAuth)
      .expect(200);
    expect(listado.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: fixture.postulacionId, estado: 'enviada' })]));
    expect(listado.headers['cache-control']).toBe('no-store');

    const subsanacion = await request(app.getHttpServer())
      .post(`/api/convocatorias/panel/postulaciones/${fixture.postulacionId}/admisibilidad`)
      .set(coordinadorAuth)
      .send({ decision: 'subsanar', detalle: 'El dossier está ilegible' })
      .expect(200);
    expect(subsanacion.body).toMatchObject({ estado: 'requiere_subsanacion' });
    expect(new Date(subsanacion.body.subsanarHasta).getTime()).toBeGreaterThan(Date.now());

    const detalle = await request(app.getHttpServer())
      .get(`/api/convocatorias/postulaciones/${fixture.postulacionId}`)
      .set(auth(fixture.cuentaId, 'postulante'))
      .expect(200);
    expect(detalle.body).toMatchObject({
      estado: 'requiere_subsanacion',
      detalleSubsanacion: { motivo: 'El dossier está ilegible' },
    });

    const reenvio = await request(app.getHttpServer())
      .post(`/api/convocatorias/postulaciones/${fixture.postulacionId}/subsanar`)
      .set(auth(fixture.cuentaId, 'postulante'))
      .expect(200);
    expect(reenvio.body).toMatchObject({ estado: 'enviada', subsanarHasta: null });

    const admision = await request(app.getHttpServer())
      .post(`/api/convocatorias/panel/postulaciones/${fixture.postulacionId}/admisibilidad`)
      .set(coordinadorAuth)
      .send({ decision: 'admitir' })
      .expect(200);
    expect(admision.body.estado).toBe('admitida');
    expect(await db.auditoria.count({ where: { postulacionId: fixture.postulacionId } })).toBe(3);
  });

  it('T034/T038: aplica rol y alcance provincial, y exige motivo para no admitir', async () => {
    const fixture = await crearPostulacion({ estado: 'enviada', provincia: 'Loja' });
    const ruta = `/api/convocatorias/panel/postulaciones/${fixture.postulacionId}/admisibilidad`;

    await request(app.getHttpServer())
      .post(ruta)
      .set(auth(provincialLoja, 'coordinación provincial', 'Loja'))
      .send({ decision: 'admitir' })
      .expect(200);

    const otroFixture = await crearPostulacion({ estado: 'enviada', provincia: 'Loja' });
    const rutaAjena = `/api/convocatorias/panel/postulaciones/${otroFixture.postulacionId}/admisibilidad`;
    await request(app.getHttpServer())
      .post(rutaAjena)
      .set(auth(provincialOtra, 'coordinación provincial', 'Pichincha'))
      .send({ decision: 'admitir' })
      .expect(403);

    await request(app.getHttpServer())
      .post(rutaAjena)
      .set(auth(fixture.cuentaId, 'postulante'))
      .send({ decision: 'admitir' })
      .expect(403);

    const sinMotivo = await request(app.getHttpServer())
      .post(rutaAjena)
      .set(auth(coordinacion, 'coordinación de convocatorias'))
      .send({ decision: 'no_admitir' })
      .expect(400);
    expect(sinMotivo.body.detail).toContain('motivo');

    const listadoAjeno = await request(app.getHttpServer())
      .get('/api/convocatorias/panel/postulaciones')
      .set(auth(provincialOtra, 'coordinación provincial', 'Pichincha'))
      .expect(200);
    expect(listadoAjeno.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: otroFixture.postulacionId })]));
  });

  it('US2-AS3: el reenvío fuera de plazo deja la postulación no admitida', async () => {
    const fixture = await crearPostulacion({
      estado: 'requiere_subsanacion',
      provincia: 'Loja',
      subsanarHasta: new Date(ahora.getTime() - 1),
    });
    await request(app.getHttpServer())
      .post(`/api/convocatorias/postulaciones/${fixture.postulacionId}/subsanar`)
      .set(auth(fixture.cuentaId, 'postulante'))
      .expect(409);
    expect((await db.postulacion.findUniqueOrThrow({ where: { id: fixture.postulacionId } })).estado).toBe('no_admitida');
  });

  it('T034: la descarga de documentos de coordinación provincial se limita a su provincia', async () => {
    const fixture = await crearPostulacion({ estado: 'borrador', provincia: 'Loja' });
    const subida = await request(app.getHttpServer())
      .post(`/api/convocatorias/postulaciones/${fixture.postulacionId}/documentos`)
      .set(auth(fixture.cuentaId, 'postulante'))
      .field('tipo', 'dossier')
      .attach('archivo', Buffer.from('%PDF-1.7\nFIAVL'), { filename: 'dossier.pdf', contentType: 'application/pdf' })
      .expect(201);
    const documentoId = subida.body.id as string;
    const ruta = `/api/convocatorias/documentos/${documentoId}/descarga`;
    const propia = await request(app.getHttpServer()).get(ruta).set(auth(provincialLoja, 'coordinación provincial', 'Loja')).expect(200);
    expect(propia.body.url).toEqual(expect.any(String));
    await request(app.getHttpServer()).get(ruta).set(auth(provincialOtra, 'coordinación provincial', 'Pichincha')).expect(403);
    await request(app.getHttpServer()).get(ruta).set(auth(coordinacion, 'coordinación de convocatorias')).expect(200);
  });
});
