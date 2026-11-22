import { createHash } from 'node:crypto';
import type { PrismaClient } from '../../apps/api/src/generated/prisma/index.js';
import type { AlmacenamientoDocumentosPort } from '../../apps/api/src/modules/convocatorias/application/puertos.js';
import { calcularObraFingerprint } from '../../apps/api/src/modules/convocatorias/domain/reglas-convocatoria.js';
import { idDe } from './ids';

export const SEED_CONVOCATORIA_ID = '11111111-1111-4111-8111-111111111111';
// Spec 004 (eventos §5.3): la misma edición 2026 que siembra Operación.
const edicionId = idDe('edicion-2026');
const criterios = [
  { id: '33333333-3333-4333-8333-333333333331', nombre: 'Propuesta artística', descripcion: 'Originalidad y coherencia', peso: 50 },
  { id: '33333333-3333-4333-8333-333333333332', nombre: 'Calidad técnica', descripcion: 'Solidez de la ejecución', peso: 30 },
  { id: '33333333-3333-4333-8333-333333333333', nombre: 'Vinculación', descripcion: 'Relación con el territorio', peso: 20 },
];
const elencos = [
  { id: '44444444-4444-4444-8444-444444444441', cuentaId: '55555555-5555-4555-8555-555555555551', nombre: 'Colectivo Umbral', estado: 'enviada', titulo: 'Cartografía del agua' },
  { id: '44444444-4444-4444-8444-444444444442', cuentaId: '55555555-5555-4555-8555-555555555552', nombre: 'La Trama', estado: 'requiere_subsanacion', titulo: 'Voces del camino' },
  { id: '44444444-4444-4444-8444-444444444443', cuentaId: '55555555-5555-4555-8555-555555555553', nombre: 'Teatro Nómada', estado: 'admitida', titulo: 'Los días posibles' },
  { id: '44444444-4444-4444-8444-444444444444', cuentaId: '55555555-5555-4555-8555-555555555554', nombre: 'Ensamble Sur', estado: 'en_evaluacion', titulo: 'Cuerpos de montaña' },
] as const;
const curadores = [
  { id: '66666666-6666-4666-8666-666666666661', cuentaId: '77777777-7777-4777-8777-777777777771' },
  { id: '66666666-6666-4666-8666-666666666662', cuentaId: '77777777-7777-4777-8777-777777777772' },
] as const;
const pdf = Buffer.from('%PDF-1.7\nFIAVL demo document\n');

export async function seedConvocatorias(db: PrismaClient, almacenamiento: AlmacenamientoDocumentosPort): Promise<void> {
  await db.convocatoria.upsert({
    where: { id: SEED_CONVOCATORIA_ID },
    create: {
      id: SEED_CONVOCATORIA_ID, edicionId, codigo: 'PN-2026', componente: 'nacional', abreEn: new Date('2026-06-01T05:00:00Z'),
      cierraEn: new Date('2027-08-01T04:59:59Z'), maxObrasPorElenco: 3, estado: 'abierta',
    },
    update: { estado: 'abierta' },
  });
  const convocatoriaActual = await db.convocatoria.findUniqueOrThrow({ where: { id: SEED_CONVOCATORIA_ID } });
  if (convocatoriaActual.siguienteNumero < elencos.length + 1) {
    await db.convocatoria.update({ where: { id: SEED_CONVOCATORIA_ID }, data: { siguienteNumero: elencos.length + 1 } });
  }
  for (const criterio of criterios) {
    await db.criterio.upsert({ where: { id: criterio.id }, create: { ...criterio, convocatoriaId: SEED_CONVOCATORIA_ID }, update: criterio });
  }
  for (const elenco of elencos) {
    const fingerprint = calcularObraFingerprint({ titulo: elenco.titulo, disciplina: 'teatro', duracionMin: 60, sinopsis: `Propuesta de ${elenco.nombre}` });
    await db.elenco.upsert({
      where: { id: elenco.id },
      create: {
        id: elenco.id, cuentaId: elenco.cuentaId, nombre: elenco.nombre, responsable: `Responsable ${elenco.nombre}`,
        correoContacto: 'demo@fiavl.ec', provinciaPais: 'Loja, Ecuador', integrantes: [], trayectoria: 'Elenco de demostración FIAVL',
      },
      update: { nombre: elenco.nombre },
    });
    const postulacionId = `${elenco.id.slice(0, 8)}-aaaa-4aaa-8aaa-${elenco.id.slice(-12)}`;
    const numero = `PN-2026-${String(elencos.indexOf(elenco) + 1).padStart(4, '0')}`;
    await db.postulacion.upsert({
      where: { id: postulacionId },
      create: {
        id: postulacionId, convocatoriaId: SEED_CONVOCATORIA_ID, elencoId: elenco.id, numero, obraFingerprint: fingerprint,
        tituloObra: elenco.titulo, disciplina: 'teatro', sinopsis: `Propuesta de ${elenco.nombre}`, duracionMin: 60,
        publico: 'todo público', fichaTecnica: { elenco: elenco.nombre, integrantes: [] }, estado: elenco.estado,
        enviadaEn: new Date('2026-11-01T12:00:00Z'), primeraEnviadaEn: new Date('2026-11-01T12:00:00Z'),
        ...(elenco.estado === 'requiere_subsanacion' ? { subsanarHasta: new Date('2026-12-01T12:00:00Z') } : {}),
      },
      update: { estado: elenco.estado },
    });
    const objectKey = `seed/${postulacionId}/dossier.pdf`;
    const documentoId = `${elenco.id.slice(0, 8)}-bbbb-4bbb-8bbb-${elenco.id.slice(-12)}`;
    await almacenamiento.guardar(objectKey, pdf);
    await db.documento.upsert({
      where: { id: documentoId },
      create: {
        id: documentoId, postulacionId, tipo: 'dossier', nombreOriginal: 'dossier-demo.pdf', objectKey,
        mimeType: 'application/pdf', bytes: pdf.length, sha256: createHash('sha256').update(pdf).digest('hex'),
      },
      update: { objectKey, bytes: pdf.length },
    });
    if (elenco.estado === 'en_evaluacion') {
      for (const curador of curadores) {
        await db.curador.upsert({
          where: { id: curador.id },
          create: { ...curador, disciplinas: ['teatro'], conflictos: [] },
          update: { disciplinas: ['teatro'], conflictos: [] },
        });
        // Los ids de curador comparten prefijo: el sufijo evita que dos asignaciones de la misma postulación colisionen.
        const asignacionId = `${curador.id.slice(0, 8)}-cccc-4ccc-8ccc-${curador.id.slice(-4)}${postulacionId.slice(-8)}`;
        await db.asignacion.upsert({
          where: { postulacionId_curadorId: { postulacionId, curadorId: curador.id } },
          create: { id: asignacionId, postulacionId, curadorId: curador.id, estado: 'asignada' },
          update: { postulacionId, curadorId: curador.id, estado: 'asignada' },
        });
      }
    }
  }
  const historialFingerprint = calcularObraFingerprint({ titulo: 'Camino antiguo', disciplina: 'danza', duracionMin: 45, sinopsis: 'Obra previa Camino a Loja' });
  await db.historialObraCamino.upsert({
    where: { obraFingerprint: historialFingerprint },
    create: { id: '88888888-8888-4888-8888-888888888888', obraFingerprint: historialFingerprint, edicionAnio: 2025, referenciaFuente: 'historial-curado-fiavl-demo' },
    update: { edicionAnio: 2025 },
  });
  await seedCuraduria(db, almacenamiento);
}

/**
 * Convocatoria cerrada `EV-2026` para curaduría (US3): una postulación en evaluación por escenario de demostración/E2E
 * (los proyectos móvil y escritorio no comparten datos) y una con conflicto de interés declarado después de asignar.
 * Es una convocatoria aparte para no alterar la de ejemplo ni aparecer en la lista pública de abiertas.
 */
export const SEED_CURADURIA_CONVOCATORIA_ID = '99999999-9999-4999-8999-999999999990';
export const SEED_CURADOR_CONFLICTO_CUENTA_ID = '77777777-7777-4777-8777-777777777773';
const escenariosCuraduria = [
  { clave: 'movil', n: 1, nombre: 'Elenco Curaduría Móvil', titulo: 'Evaluación móvil' },
  { clave: 'escritorio', n: 2, nombre: 'Elenco Curaduría Escritorio', titulo: 'Evaluación escritorio' },
  { clave: 'conflicto', n: 3, nombre: 'Colectivo Conflicto', titulo: 'Obra con conflicto' },
] as const;

async function seedCuraduria(db: PrismaClient, almacenamiento: AlmacenamientoDocumentosPort): Promise<void> {
  await db.convocatoria.upsert({
    where: { id: SEED_CURADURIA_CONVOCATORIA_ID },
    create: {
      id: SEED_CURADURIA_CONVOCATORIA_ID, edicionId, codigo: 'EV-2026', componente: 'nacional', abreEn: new Date('2026-01-01T05:00:00Z'),
      cierraEn: new Date('2026-06-01T04:59:59Z'), maxObrasPorElenco: 3, estado: 'cerrada', siguienteNumero: escenariosCuraduria.length + 1,
    },
    update: {},
  });
  for (const [indice, criterio] of criterios.entries()) {
    const id = `99999999-9999-4999-8999-99999999991${indice + 1}`;
    await db.criterio.upsert({
      where: { id }, create: { ...criterio, id, convocatoriaId: SEED_CURADURIA_CONVOCATORIA_ID }, update: { nombre: criterio.nombre, peso: criterio.peso },
    });
  }
  const curadoresSeed = [
    ...curadores.map((curador) => ({ ...curador, conflictos: [] as string[] })),
    { id: '66666666-6666-4666-8666-666666666663', cuentaId: SEED_CURADOR_CONFLICTO_CUENTA_ID, conflictos: ['Colectivo Conflicto'] },
  ];
  for (const curador of curadoresSeed) {
    await db.curador.upsert({
      where: { id: curador.id },
      create: { ...curador, disciplinas: ['teatro'] },
      update: { disciplinas: ['teatro'], ...(curador.conflictos.length ? { conflictos: curador.conflictos } : {}) },
    });
  }
  for (const esc of escenariosCuraduria) {
    const elencoId = `99999999-9999-4999-8999-99999999992${esc.n}`;
    const postulacionId = `99999999-9999-4999-8999-99999999993${esc.n}`;
    await db.elenco.upsert({
      where: { id: elencoId },
      create: {
        id: elencoId, cuentaId: `99999999-9999-4999-8999-99999999994${esc.n}`, nombre: esc.nombre, responsable: `Responsable ${esc.nombre}`,
        correoContacto: 'demo@fiavl.ec', provinciaPais: 'Loja, Ecuador', integrantes: [], trayectoria: 'Elenco de demostración de curaduría',
      },
      update: { nombre: esc.nombre },
    });
    const fingerprint = calcularObraFingerprint({ titulo: esc.titulo, disciplina: 'teatro', duracionMin: 60, sinopsis: `Propuesta de ${esc.nombre}` });
    await db.postulacion.upsert({
      where: { id: postulacionId },
      create: {
        id: postulacionId, convocatoriaId: SEED_CURADURIA_CONVOCATORIA_ID, elencoId, numero: `EV-2026-000${esc.n}`, obraFingerprint: fingerprint,
        tituloObra: esc.titulo, disciplina: 'teatro', sinopsis: `Propuesta de ${esc.nombre}`, duracionMin: 60, publico: 'todo público',
        fichaTecnica: {}, estado: 'en_evaluacion', enviadaEn: new Date('2026-05-01T12:00:00Z'), primeraEnviadaEn: new Date('2026-05-01T12:00:00Z'),
      },
      update: { tituloObra: esc.titulo },
    });
    const objectKey = `seed/${postulacionId}/dossier.pdf`;
    await almacenamiento.guardar(objectKey, pdf);
    await db.documento.upsert({
      where: { id: `99999999-9999-4999-8999-99999999995${esc.n}` },
      create: {
        id: `99999999-9999-4999-8999-99999999995${esc.n}`, postulacionId, tipo: 'dossier', nombreOriginal: 'dossier-demo.pdf', objectKey,
        mimeType: 'application/pdf', bytes: pdf.length, sha256: createHash('sha256').update(pdf).digest('hex'),
      },
      update: { objectKey, bytes: pdf.length },
    });
    const asignados = esc.clave === 'conflicto' ? [curadoresSeed[2]!] : [curadoresSeed[0]!, curadoresSeed[1]!];
    for (const curador of asignados) {
      const id = `${curador.id.slice(0, 8)}-dddd-4ddd-8ddd-${curador.id.slice(-4)}${postulacionId.slice(-8)}`;
      await db.asignacion.upsert({
        where: { postulacionId_curadorId: { postulacionId, curadorId: curador.id } },
        create: { id, postulacionId, curadorId: curador.id, estado: 'asignada' },
        update: { postulacionId, curadorId: curador.id },
      });
    }
  }
}
