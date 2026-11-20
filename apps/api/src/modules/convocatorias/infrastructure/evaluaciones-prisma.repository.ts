import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';
import { enTransaccion } from '../../../common/datos/transaccion';
import type {
  AsignacionResumen, CalificacionInput, DetalleAsignacion, EvaluacionInput, EvaluacionPropia, EvaluacionesRepositorioPort,
  ResultadoEnvio, ResultadoReapertura, ResumenEvaluacionPostulacion,
} from '../application/evaluaciones/evaluaciones.port';
import { detectarConflicto } from '../domain/conflictos';
import {
  transicionarAsignacion, transicionarEvaluacion, transicionarPostulacion,
  type EstadoAsignacion, type EstadoEvaluacion, type EstadoPostulacion,
} from '../domain/estados';
import {
  calcularPuntajePonderado, centesimasDesdeDecimal, formatearPuntaje, hayDispersion, promediarPuntajes, validarCalificacion,
} from '../domain/puntaje';

const ESTADOS_VISIBLES: EstadoPostulacion[] = ['admitida', 'en_evaluacion', 'evaluada', 'requiere_deliberacion'];
const ESTADOS_PANEL: EstadoPostulacion[] = ['en_evaluacion', 'evaluada', 'requiere_deliberacion'];

const texto = (valor: { toString(): string } | null | undefined): string | null =>
  valor == null ? null : formatearPuntaje(centesimasDesdeDecimal(valor));

const incluirAsignacion = {
  curador: true,
  evaluacion: { include: { calificaciones: true } },
  postulacion: {
    include: {
      elenco: true,
      documentos: { orderBy: { cargadoEn: 'asc' as const } },
      convocatoria: { include: { criterios: { orderBy: { nombre: 'asc' as const } } } },
    },
  },
} satisfies Prisma.AsignacionInclude;
type AsignacionCompleta = Prisma.AsignacionGetPayload<{ include: typeof incluirAsignacion }>;

export class EvaluacionesPrismaRepository implements EvaluacionesRepositorioPort {
  constructor(private readonly db: PrismaClient) {}

  async listarAsignaciones(cuentaId: string): Promise<AsignacionResumen[]> {
    const curador = await this.db.curador.findUnique({ where: { cuentaId } });
    if (!curador) return [];
    const filas = await this.db.asignacion.findMany({
      where: { curadorId: curador.id, estado: { not: 'reasignada' }, postulacion: { estado: { in: ESTADOS_VISIBLES } } },
      orderBy: { asignadaEn: 'asc' },
      include: incluirAsignacion,
    });
    return filas.map((fila) => {
      const conflicto = this.conflicto(fila);
      return {
        asignacionId: fila.id,
        estado: fila.estado as EstadoAsignacion,
        bloqueada: conflicto.conflicto,
        motivoBloqueo: conflicto.conflicto ? conflicto.motivo : null,
        postulacion: {
          id: fila.postulacion.id, numero: fila.postulacion.numero, tituloObra: fila.postulacion.tituloObra,
          disciplina: fila.postulacion.disciplina, estado: fila.postulacion.estado as EstadoPostulacion,
        },
        evaluacion: fila.evaluacion ? { estado: fila.evaluacion.estado as EstadoEvaluacion, puntaje: texto(fila.evaluacion.puntaje) } : null,
      };
    });
  }

  async obtenerAsignacion(cuentaId: string, asignacionId: string): Promise<DetalleAsignacion> {
    const fila = await this.propia(this.db, cuentaId, asignacionId);
    const conflicto = this.conflicto(fila);
    let otras: DetalleAsignacion['otrasEvaluaciones'] = null;
    if (fila.evaluacion?.estado === 'enviada') {
      const ajenas = await this.db.evaluacion.findMany({
        where: { estado: 'enviada', asignacion: { postulacionId: fila.postulacionId, estado: { not: 'reasignada' }, id: { not: fila.id } } },
        select: { puntaje: true },
      });
      otras = ajenas.map((e) => ({ puntaje: texto(e.puntaje)! })).sort((a, b) => a.puntaje.localeCompare(b.puntaje));
    }
    const p = fila.postulacion;
    return {
      asignacionId: fila.id,
      estado: fila.estado as EstadoAsignacion,
      bloqueada: conflicto.conflicto,
      motivoBloqueo: conflicto.conflicto ? conflicto.motivo : null,
      // Con conflicto no se entrega el material de la obra.
      postulacion: {
        id: p.id, numero: p.numero, tituloObra: p.tituloObra, disciplina: p.disciplina, estado: p.estado as EstadoPostulacion,
        sinopsis: conflicto.conflicto ? '' : p.sinopsis, duracionMin: p.duracionMin, publico: p.publico,
        videoUrl: conflicto.conflicto ? null : p.videoUrl,
        elenco: conflicto.conflicto ? { nombre: '', trayectoria: '' } : { nombre: p.elenco.nombre, trayectoria: p.elenco.trayectoria },
        documentos: conflicto.conflicto ? [] : p.documentos.map((d) => ({ id: d.id, tipo: d.tipo, nombreOriginal: d.nombreOriginal, bytes: d.bytes })),
      },
      criterios: p.convocatoria.criterios.map((c) => ({ id: c.id, nombre: c.nombre, descripcion: c.descripcion, peso: c.peso })),
      evaluacion: fila.evaluacion ? this.mapearEvaluacion(fila.evaluacion) : null,
      otrasEvaluaciones: otras,
    };
  }

  guardarEvaluacion(cuentaId: string, asignacionId: string, input: EvaluacionInput): Promise<EvaluacionPropia> {
    return enTransaccion(this.db, async (tx) => {
      const fila = await this.propia(tx, cuentaId, asignacionId);
      this.exigirEditable(fila);
      this.validarParcial(input.calificaciones, fila.postulacion.convocatoria.criterios.map((c) => c.id));
      const correlacionId = randomUUID();
      await this.iniciarSiCorresponde(tx, fila, cuentaId, correlacionId);
      const evaluacionId = fila.evaluacion?.id ?? randomUUID();
      if (!fila.evaluacion) {
        await tx.evaluacion.create({ data: { id: evaluacionId, asignacionId: fila.id, estado: 'borrador', observaciones: input.observaciones ?? null } });
      } else {
        await tx.evaluacion.update({ where: { id: evaluacionId }, data: { observaciones: input.observaciones ?? null } });
      }
      await tx.calificacion.deleteMany({ where: { evaluacionId } });
      await tx.calificacion.createMany({
        data: input.calificaciones.map((c) => ({ id: randomUUID(), evaluacionId, criterioId: c.criterioId, puntaje: c.puntaje })),
      });
      const guardada = await tx.evaluacion.findUniqueOrThrow({ where: { id: evaluacionId }, include: { calificaciones: true } });
      return this.mapearEvaluacion(guardada);
    });
  }

  enviarEvaluacion(cuentaId: string, asignacionId: string, ahora: Date): Promise<ResultadoEnvio> {
    return enTransaccion(this.db, async (tx) => {
      const fila = await this.propia(tx, cuentaId, asignacionId);
      this.exigirEditable(fila);
      const evaluacion = fila.evaluacion;
      if (!evaluacion) throw new UnprocessableEntityException('La evaluación debe calificar todos los criterios');
      const criterios = fila.postulacion.convocatoria.criterios;
      let centesimas: number;
      try {
        centesimas = calcularPuntajePonderado(
          evaluacion.calificaciones.map((c) => ({ criterioId: c.criterioId, puntaje: c.puntaje })),
          criterios.map((c) => ({ id: c.id, peso: c.peso })),
        );
      } catch (error) {
        throw new UnprocessableEntityException(error instanceof Error ? error.message : 'Evaluación inválida');
      }
      const correlacionId = randomUUID();
      const estadoAnterior = evaluacion.estado as EstadoEvaluacion;
      const estadoNuevo = transicionarEvaluacion(estadoAnterior, 'enviar');
      await tx.evaluacion.update({ where: { id: evaluacion.id }, data: { estado: estadoNuevo, puntaje: formatearPuntaje(centesimas), enviadaEn: ahora } });
      await tx.asignacion.update({ where: { id: fila.id }, data: { estado: transicionarAsignacion(fila.estado as EstadoAsignacion, 'completar') } });
      await this.auditar(tx, { postulacionId: fila.postulacionId, actorCuentaId: cuentaId, accion: 'evaluacion_enviada', estadoAnterior, estadoNuevo, correlacionId });

      // ¿Ya están todas las evaluaciones activas enviadas? Entonces se calcula el puntaje final (RN-002).
      const activas = await tx.asignacion.findMany({
        where: { postulacionId: fila.postulacionId, estado: { not: 'reasignada' } },
        include: { evaluacion: true },
      });
      const enviadas = activas.filter((a) => a.evaluacion?.estado === 'enviada').map((a) => centesimasDesdeDecimal(a.evaluacion!.puntaje!));
      let estadoPostulacion = fila.postulacion.estado as EstadoPostulacion;
      let puntajeFinal: string | null = null;
      if (enviadas.length === activas.length) {
        puntajeFinal = formatearPuntaje(promediarPuntajes(enviadas));
        const evaluada = transicionarPostulacion(estadoPostulacion, 'evaluar');
        await this.auditar(tx, { postulacionId: fila.postulacionId, actorCuentaId: cuentaId, accion: 'postulacion_evaluada', estadoAnterior: estadoPostulacion, estadoNuevo: evaluada, correlacionId });
        estadoPostulacion = evaluada;
        if (hayDispersion(enviadas)) {
          const dispersion = formatearPuntaje(Math.max(...enviadas) - Math.min(...enviadas));
          const deliberacion = transicionarPostulacion(estadoPostulacion, 'deliberar');
          await this.auditar(tx, {
            postulacionId: fila.postulacionId, actorCuentaId: cuentaId, accion: 'deliberacion_requerida',
            estadoAnterior: estadoPostulacion, estadoNuevo: deliberacion, motivo: `Dispersión de ${dispersion} puntos (> 25)`, correlacionId,
          });
          estadoPostulacion = deliberacion;
        }
        await tx.postulacion.update({ where: { id: fila.postulacionId }, data: { estado: estadoPostulacion, puntajeFinal } });
      }
      return {
        evaluacion: { id: evaluacion.id, estado: estadoNuevo, puntaje: formatearPuntaje(centesimas) },
        postulacion: { id: fila.postulacionId, estado: estadoPostulacion, puntajeFinal },
      };
    });
  }

  reabrirEvaluacion(input: {
    evaluacionId: string; actorCuentaId: string; motivo: string; ahora: Date; provinciaPermitida: (provincia: string | null) => boolean;
  }): Promise<ResultadoReapertura> {
    return enTransaccion(this.db, async (tx) => {
      const evaluacion = await tx.evaluacion.findUnique({
        where: { id: input.evaluacionId },
        include: { asignacion: { include: { postulacion: { include: { convocatoria: true } } } } },
      });
      if (!evaluacion) throw new NotFoundException('Evaluación inexistente');
      const postulacion = evaluacion.asignacion.postulacion;
      if (!input.provinciaPermitida(postulacion.convocatoria.provincia)) throw new ForbiddenException('La evaluación está fuera de su alcance provincial');
      if (evaluacion.estado !== 'enviada') throw new ConflictException('Solo se puede reabrir una evaluación enviada');
      const correlacionId = randomUUID();
      const estadoNuevo = transicionarEvaluacion('enviada', 'reabrir');
      await tx.evaluacion.update({ where: { id: evaluacion.id }, data: { estado: estadoNuevo } });
      await tx.asignacion.update({ where: { id: evaluacion.asignacionId }, data: { estado: transicionarAsignacion(evaluacion.asignacion.estado as EstadoAsignacion, 'reabrir') } });
      await this.auditar(tx, {
        postulacionId: postulacion.id, actorCuentaId: input.actorCuentaId, accion: 'evaluacion_reabierta',
        estadoAnterior: 'enviada', estadoNuevo, motivo: input.motivo, correlacionId,
      });
      let estadoPostulacion = postulacion.estado as EstadoPostulacion;
      if (estadoPostulacion !== 'en_evaluacion') {
        const nuevo = transicionarPostulacion(estadoPostulacion, 'reabrir_evaluacion');
        await this.auditar(tx, {
          postulacionId: postulacion.id, actorCuentaId: input.actorCuentaId, accion: 'postulacion_en_evaluacion',
          estadoAnterior: estadoPostulacion, estadoNuevo: nuevo, motivo: input.motivo, correlacionId,
        });
        estadoPostulacion = nuevo;
      }
      await tx.postulacion.update({ where: { id: postulacion.id }, data: { estado: estadoPostulacion, puntajeFinal: null } });
      return { evaluacion: { id: evaluacion.id, estado: estadoNuevo }, postulacion: { id: postulacion.id, estado: estadoPostulacion, puntajeFinal: null } };
    });
  }

  async listarEvaluacionesPanel(): Promise<ResumenEvaluacionPostulacion[]> {
    const filas = await this.db.postulacion.findMany({
      where: { estado: { in: ESTADOS_PANEL } },
      orderBy: [{ estado: 'asc' }, { numero: 'asc' }],
      take: 200,
      include: { convocatoria: true, asignaciones: { where: { estado: { not: 'reasignada' } }, orderBy: [{ asignadaEn: 'asc' }, { id: 'asc' }], include: { curador: true, evaluacion: true } } },
    });
    return filas.map((fila) => this.resumir(fila));
  }

  async obtenerAgregado(postulacionId: string): Promise<ResumenEvaluacionPostulacion | null> {
    const fila = await this.db.postulacion.findUnique({
      where: { id: postulacionId },
      include: { convocatoria: true, asignaciones: { where: { estado: { not: 'reasignada' } }, orderBy: [{ asignadaEn: 'asc' }, { id: 'asc' }], include: { curador: true, evaluacion: true } } },
    });
    return fila ? this.resumir(fila) : null;
  }

  /** Alta de una asignación bloqueada por RN-004. No es un endpoint de P1: las asignaciones vienen del seed. */
  async asignarCurador(postulacionId: string, curadorId: string, actorCuentaId: string | null = null) {
    return enTransaccion(this.db, async (tx) => {
      const postulacion = await tx.postulacion.findUnique({ where: { id: postulacionId }, include: { elenco: true } });
      if (!postulacion) throw new NotFoundException('Postulación inexistente');
      const curador = await tx.curador.findUnique({ where: { id: curadorId } });
      if (!curador) throw new NotFoundException('Curador inexistente');
      if (!['admitida', 'en_evaluacion'].includes(postulacion.estado)) throw new ConflictException('La postulación no admite asignaciones');
      if (await tx.asignacion.findUnique({ where: { postulacionId_curadorId: { postulacionId, curadorId } } })) {
        throw new ConflictException('El curador ya está asignado a la postulación');
      }
      const resultado = detectarConflicto(
        { cuentaId: curador.cuentaId, conflictos: curador.conflictos },
        { cuentaId: postulacion.elenco.cuentaId, nombre: postulacion.elenco.nombre, responsable: postulacion.elenco.responsable, integrantes: postulacion.elenco.integrantes },
      );
      if (resultado.conflicto) throw new ConflictException(resultado.motivo);
      const asignacion = await tx.asignacion.create({ data: { id: randomUUID(), postulacionId, curadorId, estado: 'asignada' } });
      if (postulacion.estado === 'admitida') {
        const nuevo = transicionarPostulacion('admitida', 'iniciar_evaluacion');
        await tx.postulacion.update({ where: { id: postulacionId }, data: { estado: nuevo } });
        await this.auditar(tx, { postulacionId, actorCuentaId, accion: 'evaluacion_iniciada', estadoAnterior: 'admitida', estadoNuevo: nuevo, correlacionId: randomUUID() });
      }
      return asignacion;
    });
  }

  // ——— internos ———

  private async propia(client: Prisma.TransactionClient | PrismaClient, cuentaId: string, asignacionId: string): Promise<AsignacionCompleta> {
    const fila = await client.asignacion.findUnique({ where: { id: asignacionId }, include: incluirAsignacion });
    if (!fila) throw new NotFoundException('Asignación inexistente');
    if (fila.curador.cuentaId !== cuentaId) throw new ForbiddenException('La asignación pertenece a otro curador');
    return fila;
  }

  private conflicto(fila: AsignacionCompleta) {
    const e = fila.postulacion.elenco;
    return detectarConflicto(
      { cuentaId: fila.curador.cuentaId, conflictos: fila.curador.conflictos },
      { cuentaId: e.cuentaId, nombre: e.nombre, responsable: e.responsable, integrantes: e.integrantes },
    );
  }

  /** Conflicto, asignación vigente y evaluación todavía editable (RN-004, US3-AS6). */
  private exigirEditable(fila: AsignacionCompleta): void {
    const conflicto = this.conflicto(fila);
    if (conflicto.conflicto) throw new ForbiddenException(conflicto.motivo);
    if (!['asignada', 'en_evaluacion'].includes(fila.estado)) throw new ConflictException('La asignación no admite cambios');
    if (!['admitida', 'en_evaluacion'].includes(fila.postulacion.estado)) throw new ConflictException('La postulación no está en evaluación');
    if (fila.evaluacion && !['borrador', 'reabierta'].includes(fila.evaluacion.estado)) {
      throw new ConflictException('La evaluación enviada solo puede reabrirla la coordinación');
    }
  }

  private validarParcial(calificaciones: CalificacionInput[], criterioIds: string[]): void {
    const vistos = new Set<string>();
    for (const { criterioId, puntaje } of calificaciones) {
      try { validarCalificacion(puntaje); } catch (error) { throw new UnprocessableEntityException((error as Error).message); }
      if (!criterioIds.includes(criterioId)) throw new UnprocessableEntityException('Un criterio no pertenece a la convocatoria');
      if (vistos.has(criterioId)) throw new UnprocessableEntityException('Hay criterios repetidos en la evaluación');
      vistos.add(criterioId);
    }
  }

  /** Primer guardado: la asignación entra en evaluación y la postulación admitida pasa a `en_evaluacion`. */
  private async iniciarSiCorresponde(tx: Prisma.TransactionClient, fila: AsignacionCompleta, actorCuentaId: string, correlacionId: string): Promise<void> {
    if (fila.estado === 'asignada') {
      await tx.asignacion.update({ where: { id: fila.id }, data: { estado: transicionarAsignacion('asignada', 'iniciar') } });
    }
    if (fila.postulacion.estado === 'admitida') {
      const nuevo = transicionarPostulacion('admitida', 'iniciar_evaluacion');
      await tx.postulacion.update({ where: { id: fila.postulacionId }, data: { estado: nuevo } });
      await this.auditar(tx, { postulacionId: fila.postulacionId, actorCuentaId, accion: 'evaluacion_iniciada', estadoAnterior: 'admitida', estadoNuevo: nuevo, correlacionId });
    }
  }

  private mapearEvaluacion(e: { id: string; estado: string; puntaje: { toString(): string } | null; observaciones: string | null; calificaciones: Array<{ criterioId: string; puntaje: number }> }): EvaluacionPropia {
    return {
      id: e.id, estado: e.estado as EstadoEvaluacion, puntaje: texto(e.puntaje), observaciones: e.observaciones,
      calificaciones: e.calificaciones.map((c) => ({ criterioId: c.criterioId, puntaje: c.puntaje })),
    };
  }

  private resumir(fila: Prisma.PostulacionGetPayload<{ include: { convocatoria: true; asignaciones: { include: { curador: true; evaluacion: true } } } }>): ResumenEvaluacionPostulacion {
    const evaluaciones = fila.asignaciones.map((a) => ({
      evaluacionId: a.evaluacion?.id ?? null,
      asignacionId: a.id,
      curadorCuentaId: a.curador.cuentaId,
      estado: (a.evaluacion?.estado ?? 'sin_iniciar') as EstadoEvaluacion | 'sin_iniciar',
      puntaje: texto(a.evaluacion?.puntaje),
    }));
    return {
      postulacionId: fila.id, numero: fila.numero, tituloObra: fila.tituloObra, estado: fila.estado as EstadoPostulacion,
      provincia: fila.convocatoria.provincia, puntajeFinal: texto(fila.puntajeFinal),
      deliberacion: fila.estado === 'requiere_deliberacion',
      pendientes: evaluaciones.filter((e) => e.estado !== 'enviada').length,
      evaluaciones,
    };
  }

  private auditar(
    tx: Prisma.TransactionClient,
    input: { postulacionId: string; actorCuentaId?: string | null; accion: string; estadoAnterior?: string | null; estadoNuevo?: string | null; motivo?: string | null; correlacionId: string },
  ) {
    return tx.auditoria.create({
      data: {
        id: randomUUID(), postulacionId: input.postulacionId, actorCuentaId: input.actorCuentaId ?? null, accion: input.accion,
        estadoAnterior: input.estadoAnterior ?? null, estadoNuevo: input.estadoNuevo ?? null, motivo: input.motivo ?? null, correlacionId: input.correlacionId,
      },
    });
  }
}
