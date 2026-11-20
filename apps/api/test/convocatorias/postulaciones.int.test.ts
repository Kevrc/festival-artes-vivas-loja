import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { PostulacionesServicio } from '../../src/modules/convocatorias/application/postulaciones/postulaciones.servicio';
import { PostulacionesPrismaRepository } from '../../src/modules/convocatorias/infrastructure/postulaciones-prisma.repository';
import { GuardarDocumento } from '../../src/modules/convocatorias/application/guardar-documento';
import { FalsoEscanerAntivirus } from '../../src/modules/convocatorias/infrastructure/escaner-antivirus-falso';
import { MemoriaAlmacenamientoDocumentos } from '../../src/modules/convocatorias/infrastructure/almacenamiento-memoria.adapter';
import { validarDocumento } from '../../src/modules/convocatorias/domain/documentos';

const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
const publicador = { publicar: async () => undefined };
afterAll(async () => db.$disconnect());

const datos = (convocatoriaId: string, titulo = `Obra ${randomUUID()}`) => ({
  convocatoriaId,
  elenco: { nombre: 'Colectivo prueba', responsable: 'Ana', correoContacto: 'ana@example.ec', provinciaPais: 'Loja, Ecuador', trayectoria: 'Trayectoria artística', integrantes: ['Ana'] },
  obra: { titulo, disciplina: 'teatro', sinopsis: 'Una obra completa', duracionMin: 60, publico: 'todo público', fichaTecnica: { montaje: 'liviano', integrantesEnGira: 5 }, videoUrl: 'https://youtu.be/abc123' },
});

async function nuevaConvocatoria(cierraEn: Date) {
  const id = randomUUID();
  await db.convocatoria.create({ data: {
    id, edicionId: randomUUID(), codigo: `PN-${id.slice(0, 4)}-2026`, componente: 'nacional', abreEn: new Date('2026-06-01T05:00:00.000Z'),
    cierraEn, maxObrasPorElenco: 3, estado: 'abierta',
  } });
  return id;
}

async function completar(repo: PostulacionesPrismaRepository, almacenamiento: MemoriaAlmacenamientoDocumentos, id: string) {
  const bytes = Buffer.from('%PDF-1.7\nDocumento demo');
  const useCase = new GuardarDocumento(new FalsoEscanerAntivirus('limpio'), almacenamiento, repo);
  for (const tipo of ['dossier', 'ficha_tecnica']) {
    await useCase.ejecutar({ id: randomUUID(), postulacionId: id, tipo, nombreOriginal: `${tipo}.pdf`, objectKey: randomUUID(), mimeType: 'application/pdf', bytes: bytes.length, sha256: 'a'.repeat(64), contenido: bytes });
  }
}

describe('US1 · flujo de postulaciones sobre PostgreSQL', () => {
  it('US1-AS1/AS3/AS4/AS5: asigna folios únicos, mantiene el folio al retirar y respeta el cierre de Loja', async () => {
    const cierre = new Date('2026-08-01T04:59:59.999Z');
    const convocatoriaId = await nuevaConvocatoria(cierre);
    const repo = new PostulacionesPrismaRepository(db, publicador);
    const storage = new MemoriaAlmacenamientoDocumentos();
    let ahora = new Date('2026-08-01T04:59:30.000Z'); // 31 de julio, 23:59:30 America/Guayaquil
    const servicio = new PostulacionesServicio(repo, () => ahora);
    const cuentaA = randomUUID();
    const cuentaB = randomUUID();
    const a = await servicio.crear(cuentaA, datos(convocatoriaId));
    const b = await servicio.crear(cuentaB, datos(convocatoriaId));
    await completar(repo, storage, a.id);
    await completar(repo, storage, b.id);
    const enviadoA = await servicio.enviar(a.id, cuentaA);
    const enviadoB = await servicio.enviar(b.id, cuentaB);
    expect(enviadoA.estado).toBe('enviada');
    expect(enviadoA.numero).toMatch(/^PN-.*-2026-0001$/);
    expect(enviadoB.numero).not.toBe(enviadoA.numero);

    await servicio.retirar(a.id, cuentaA);
    const reenvio = await servicio.enviar(a.id, cuentaA);
    expect(reenvio.numero).toBe(enviadoA.numero);
    await db.convocatoria.update({ where: { id: convocatoriaId }, data: { cierraEn: new Date('2026-08-01T04:59:30.000Z') } });
    ahora = new Date('2026-08-01T05:00:01.000Z'); // 1 de agosto, 00:00:01 America/Guayaquil
    await expect(servicio.enviar(a.id, cuentaA)).rejects.toThrow('no está abierta');
    await expect(servicio.editar(a.id, cuentaA, datos(convocatoriaId))).rejects.toThrow('no está abierta');
  });

  it('US1-AS2/FR-004: conserva el borrador si faltan documentos y detecta duplicado de obra', async () => {
    const convocatoriaId = await nuevaConvocatoria(new Date('2027-01-01T00:00:00.000Z'));
    const repo = new PostulacionesPrismaRepository(db, publicador);
    const servicio = new PostulacionesServicio(repo, () => new Date('2026-11-20T12:00:00.000Z'));
    const cuenta = randomUUID();
    const draft = await servicio.crear(cuenta, datos(convocatoriaId, 'Obra no duplicada'));
    await expect(servicio.enviar(draft.id, cuenta)).rejects.toThrow('incompleta');
    expect((await repo.obtenerPostulacion(draft.id))?.estado).toBe('borrador');
    await expect(servicio.crear(randomUUID(), datos(convocatoriaId, 'Obra no duplicada'))).rejects.toThrow();
    await expect(servicio.crear(cuenta, { ...datos(convocatoriaId), obra: { ...datos(convocatoriaId).obra, videoUrl: 'http://example.com/video' } })).rejects.toThrow('HTTPS');
  });

  it('FR-004/edge case: impide enviar otra obra después de alcanzar el máximo del elenco', async () => {
    const convocatoriaId = await nuevaConvocatoria(new Date('2027-01-01T00:00:00.000Z'));
    await db.convocatoria.update({ where: { id: convocatoriaId }, data: { maxObrasPorElenco: 1 } });
    const repo = new PostulacionesPrismaRepository(db, publicador);
    const storage = new MemoriaAlmacenamientoDocumentos();
    const servicio = new PostulacionesServicio(repo, () => new Date('2026-11-20T12:00:00.000Z'));
    const cuenta = randomUUID();
    const primera = await servicio.crear(cuenta, datos(convocatoriaId, 'Primera obra'));
    const segunda = await servicio.crear(cuenta, datos(convocatoriaId, 'Segunda obra'));
    await completar(repo, storage, primera.id);
    await completar(repo, storage, segunda.id);
    await servicio.enviar(primera.id, cuenta);
    await expect(servicio.enviar(segunda.id, cuenta)).rejects.toThrow('máximo');
  });

  it('US1-AS2/FR-004: rechaza firma/MIME incorrectos y valida el límite decimal exacto', async () => {
    expect(validarDocumento('dossier.pdf', 'application/pdf', Buffer.from('%PDF-1.7'))).toMatchObject({ valido: true });
    expect(validarDocumento('dossier.pdf', 'image/png', Buffer.from('%PDF-1.7'))).toMatchObject({ valido: false });
    const limite = Buffer.alloc(10_000_000); limite.write('%PDF-1.7');
    const sobreLimite = Buffer.alloc(10_000_001); sobreLimite.write('%PDF-1.7');
    expect(validarDocumento('dossier.pdf', 'application/pdf', limite)).toMatchObject({ valido: true });
    expect(validarDocumento('dossier.pdf', 'application/pdf', sobreLimite)).toMatchObject({ valido: false });
    const storage = new MemoriaAlmacenamientoDocumentos();
    const repo = new PostulacionesPrismaRepository(db, publicador);
    const useCase = new GuardarDocumento(new FalsoEscanerAntivirus('infectado'), storage, repo);
    const content = Buffer.from('%PDF-1.7');
    await expect(useCase.ejecutar({ id: randomUUID(), postulacionId: randomUUID(), tipo: 'dossier', nombreOriginal: 'd.pdf', objectKey: 'infectado', mimeType: 'application/pdf', bytes: content.length, sha256: 'b'.repeat(64), contenido: content })).rejects.toThrow();
    await expect(storage.leer('infectado')).rejects.toThrow();
  });
});
