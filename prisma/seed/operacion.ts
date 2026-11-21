import { randomUUID } from 'node:crypto';
import type { EventoCartelera } from '@fiavl/contracts';
import type { PrismaClient } from '../../apps/api/src/generated/prisma/index.js';
import { bloquesDe } from '../../apps/api/src/modules/operacion/domain/agenda';
import { EDICION_2026, eventosEdicion2026 } from './edicion-2026';

/**
 * Semilla del esquema `operacion` (spec 004, T027) con la misma edición 2026 y los mismos ids que
 * ya usan Cartelera y Boletería: se deriva de `eventosEdicion2026()`, que sigue siendo la fuente.
 * Es aditiva: no cambia la semilla de 001 ni de 002 (sus proyecciones se siguen cargando igual).
 * Idempotente: se puede ejecutar varias veces.
 */
const CREADOR_SEMILLA = '00000000-0000-4000-8000-000000000004';
const MONTAJE_POR_DEFECTO = 30;

/** Cifras públicas de la edición X (docs/investigacion-festival.md); el desglose no se publicó. */
const CIFRAS_2025 = { anio: 2025, actividades: 313, elencos: 116, obras: 125, paises: 18, asistenciaTotal: 163_162 };

type Programada = Extract<EventoCartelera, { tipo: 'FuncionProgramada' }>;

const rango = (i: { desde: Date; hasta: Date }) => `[${i.desde.toISOString()},${i.hasta.toISOString()})`;

/** Bloques de ocupación con la misma regla que la aplicación (op/domain/agenda.ts, research R1). */
const bloques = (inicio: Date, fin: Date, continua: boolean, montajeMin: number) =>
  bloquesDe({ inicio, fin, continua, montajeMin }).map((b) => ({ rangoSede: rango(b.sede), rangoElenco: rango(b.elenco) }));

export async function seedOperacion(db: PrismaClient): Promise<{ funciones: number }> {
  const eventos = eventosEdicion2026();
  const publicada = eventos.find((e) => e.tipo === 'ProgramacionPublicada');
  if (!publicada || publicada.tipo !== 'ProgramacionPublicada') throw new Error('La semilla 2026 no trae ProgramacionPublicada');
  const ed = publicada.datos.edicion;

  await db.edicionOperacion.upsert({
    where: { id: EDICION_2026 },
    create: {
      id: EDICION_2026, numero: ed.numero, anio: ed.anio, fechaInicio: new Date(ed.fechaInicio), fechaFin: new Date(ed.fechaFin),
      paisInvitado: ed.paisInvitado ?? null, precioCentavos: 500, maxPagadasPersona: 6, maxReservasPersona: 4, estado: 'publicada',
    },
    update: {},
  });

  const programadas = eventos.filter((e): e is Programada => e.tipo === 'FuncionProgramada');
  for (const { datos } of programadas) {
    const { sede, obra, elenco, funcion } = datos;
    await db.sedeOperacion.upsert({
      where: { id: sede.id },
      create: {
        id: sede.id, edicionId: EDICION_2026, nombre: sede.nombre, tipo: sede.tipo, direccion: sede.direccion, lat: sede.lat, lng: sede.lng,
        recorrido: sede.recorrido ?? undefined, aforo: sede.aforo ?? null, accesibilidad: sede.accesibilidad, montajeMin: MONTAJE_POR_DEFECTO,
      },
      update: {},
    });
    await db.elencoOperacion.upsert({
      where: { id: elenco.id },
      create: { id: elenco.id, nombre: elenco.nombre, pais: elenco.pais, ciudad: elenco.ciudad ?? null, origen: 'invitado' },
      update: {},
    });
    await db.obraOperacion.upsert({
      where: { id: obra.id },
      create: {
        id: obra.id, edicionId: EDICION_2026, elencoId: elenco.id, titulo: obra.titulo, sinopsis: obra.sinopsis, disciplina: obra.disciplina,
        componente: obra.componente, duracionMin: obra.duracionMin, edadMinima: obra.edadMinima, idioma: obra.idioma ?? null,
        imagenes: obra.imagenes, fichaArtistica: obra.fichaArtistica, origen: 'invitado',
      },
      update: {},
    });
    const existe = await db.funcionOperacion.findUnique({ where: { id: funcion.id }, select: { id: true } });
    if (existe) continue;
    const inicio = new Date(funcion.inicio);
    const fin = new Date(funcion.fin);
    await db.$transaction(async (tx) => {
      await tx.funcionOperacion.create({
        data: {
          id: funcion.id, edicionId: EDICION_2026, obraId: obra.id, sedeId: sede.id, elencoId: elenco.id, inicio, fin,
          continua: funcion.continua, tipoAcceso: funcion.tipoAcceso, publico: funcion.publico, aforoHabilitado: funcion.aforoHabilitado,
          estado: 'programada', version: funcion.version, publicadaEn: new Date(publicada.ocurridoEn), creadaPor: CREADOR_SEMILLA,
        },
      });
      for (const b of bloques(inicio, fin, funcion.continua, MONTAJE_POR_DEFECTO)) {
        await tx.$executeRawUnsafe(
          `INSERT INTO operacion.bloque_ocupacion (id, funcion_id, sede_id, elenco_id, rango_sede, rango_elenco)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::tstzrange, $6::tstzrange)`,
          randomUUID(), funcion.id, sede.id, elenco.id, b.rangoSede, b.rangoElenco,
        );
      }
    });
  }

  // Estados de demostración (cancelada, reprogramada), con su historial y bloques coherentes.
  for (const e of eventos) {
    if (e.tipo === 'FuncionCancelada') {
      const f = await db.funcionOperacion.findUniqueOrThrow({ where: { id: e.datos.funcionId } });
      if (f.estado === 'cancelada') continue;
      await db.$transaction([
        db.funcionOperacion.update({ where: { id: f.id }, data: { estado: 'cancelada', version: e.datos.version } }),
        db.bloqueOcupacion.updateMany({ where: { funcionId: f.id }, data: { activo: false } }),
        db.cambioFuncion.create({
          data: { id: randomUUID(), funcionId: f.id, tipo: 'cancelacion', anterior: { estado: f.estado }, nuevo: { estado: 'cancelada' }, motivo: 'Demostración', autorId: CREADOR_SEMILLA },
        }),
      ]);
    }
    if (e.tipo === 'FuncionReprogramada') {
      const f = await db.funcionOperacion.findUniqueOrThrow({ where: { id: e.datos.funcionId }, include: { sede: true } });
      if (f.estado === 'reprogramada') continue;
      const inicio = new Date(e.datos.nuevo.inicio);
      const fin = new Date(e.datos.nuevo.fin);
      await db.$transaction(async (tx) => {
        await tx.bloqueOcupacion.deleteMany({ where: { funcionId: f.id } });
        await tx.funcionOperacion.update({ where: { id: f.id }, data: { estado: 'reprogramada', version: e.datos.version, inicio, fin } });
        for (const b of bloques(inicio, fin, f.continua, f.sede.montajeMin)) {
          await tx.$executeRawUnsafe(
            `INSERT INTO operacion.bloque_ocupacion (id, funcion_id, sede_id, elenco_id, rango_sede, rango_elenco)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::tstzrange, $6::tstzrange)`,
            randomUUID(), f.id, f.sedeId, f.elencoId, b.rangoSede, b.rangoElenco,
          );
        }
        await tx.cambioFuncion.create({
          data: {
            id: randomUUID(), funcionId: f.id, tipo: 'reprogramacion', anterior: e.datos.anterior, nuevo: e.datos.nuevo,
            motivo: e.datos.motivo, autorId: CREADOR_SEMILLA,
          },
        });
      });
    }
  }

  await db.cifrasHistoricas.upsert({ where: { anio: CIFRAS_2025.anio }, create: CIFRAS_2025, update: CIFRAS_2025 });
  return { funciones: programadas.length };
}
