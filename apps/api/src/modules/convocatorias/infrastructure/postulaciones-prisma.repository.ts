import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { enTransaccion } from '../../../common/datos/transaccion';
import type { PublicadorConvocatoriasPort } from '../application/puertos';
import type { AdmisionRepositorioPort, PostulacionAdmision, ReenvioSubsanacion } from '../application/admision/admision.port';
import type { DatosElenco, DatosObra, DatosPostulacion, PostulacionesRepositorioPort } from '../application/postulaciones/postulaciones.port';
import { calcularVencimientoSubsanacion, esCaminoALoja, puedeSubsanar, type DecisionAdmisibilidad } from '../domain/admisibilidad';
import { transicionarPostulacion, type EstadoPostulacion } from '../domain/estados';
import { calcularObraFingerprint } from '../domain/reglas-convocatoria';

export class PostulacionesPrismaRepository implements PostulacionesRepositorioPort, AdmisionRepositorioPort {
  constructor(private readonly db: PrismaClient, private readonly publicador: PublicadorConvocatoriasPort) {}

  listarAbiertas(ahora: Date) {
    return this.db.convocatoria.findMany({
      where: { estado: 'abierta', abreEn: { lte: ahora }, cierraEn: { gte: ahora } },
      orderBy: { cierraEn: 'asc' },
      select: { id: true, edicionId: true, codigo: true, componente: true, provincia: true, abreEn: true, cierraEn: true, estado: true, maxObrasPorElenco: true,
        criterios: { select: { id: true, nombre: true, descripcion: true, peso: true } } },
    }).then((items) => items.map((item) => ({ ...item, requisitos: ['dossier', 'ficha_tecnica'] })));
  }

  async obtenerConvocatoria(id: string) {
    const convocatoria = await this.db.convocatoria.findUnique({ where: { id }, include: { criterios: true } });
    return convocatoria ? { ...convocatoria, requisitos: ['dossier', 'ficha_tecnica'] } : null;
  }

  async crearBorrador(cuentaId: string, datos: DatosPostulacion) {
    try { return await enTransaccion(this.db, async (tx) => {
      const convocatoria = await tx.convocatoria.findUniqueOrThrow({ where: { id: datos.convocatoriaId } });
      const elencoExistente = await tx.elenco.findFirst({ where: { cuentaId } });
      const elenco = elencoExistente
        ? await tx.elenco.update({ where: { id: elencoExistente.id }, data: this.datosElenco(datos.elenco) })
        : await tx.elenco.create({ data: { id: randomUUID(), cuentaId, ...this.datosElenco(datos.elenco) } });
      const numero = `BORRADOR-${randomUUID()}`;
      const obraFingerprint = calcularObraFingerprint({ titulo: datos.obra.titulo, disciplina: datos.obra.disciplina, duracionMin: datos.obra.duracionMin, sinopsis: datos.obra.sinopsis });
      const enviadas = await tx.postulacion.count({ where: { convocatoriaId: datos.convocatoriaId, elencoId: elenco.id, primeraEnviadaEn: { not: null } } });
      if (enviadas >= convocatoria.maxObrasPorElenco) throw new ConflictException('El elenco alcanzó el máximo de obras para esta convocatoria');
      return tx.postulacion.create({ data: {
        id: randomUUID(), convocatoriaId: convocatoria.id, elencoId: elenco.id, numero, obraFingerprint,
        ...this.datosObra(datos.obra), estado: 'borrador',
      }, include: { convocatoria: true, elenco: true, documentos: true } });
    }); } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException('La misma obra ya está postulada a esta convocatoria');
      throw error;
    }
  }

  obtenerPostulacion(id: string) {
    return this.db.postulacion.findUnique({ where: { id }, include: { convocatoria: true, elenco: true, documentos: true } });
  }

  editarBorrador(id: string, cuentaId: string, datos: Omit<DatosPostulacion, 'convocatoriaId'>, ahora: Date) {
    return enTransaccion(this.db, async (tx) => {
      const p = await tx.postulacion.findUniqueOrThrow({ where: { id }, include: { convocatoria: true, elenco: true } });
      if (p.elenco.cuentaId !== cuentaId) throw new ForbiddenException('La postulación pertenece a otra cuenta');
      if (p.estado !== 'borrador') throw new ConflictException('Solo se puede editar un borrador');
      if (ahora > p.convocatoria.cierraEn) throw new ConflictException('La convocatoria está cerrada');
      await tx.elenco.update({ where: { id: p.elencoId }, data: this.datosElenco(datos.elenco) });
      return tx.postulacion.update({ where: { id }, data: {
        ...this.datosObra(datos.obra),
        obraFingerprint: calcularObraFingerprint({ titulo: datos.obra.titulo, disciplina: datos.obra.disciplina, duracionMin: datos.obra.duracionMin, sinopsis: datos.obra.sinopsis }),
      }, include: { convocatoria: true, elenco: true, documentos: true } });
    });
  }

  enviar(id: string, cuentaId: string, ahora: Date) {
    return enTransaccion(this.db, async (tx) => {
      const p = await tx.postulacion.findUniqueOrThrow({ where: { id }, include: { convocatoria: true, elenco: true, documentos: true } });
      if (p.elenco.cuentaId !== cuentaId) throw new ForbiddenException('La postulación pertenece a otra cuenta');
      if (p.estado !== 'borrador') throw new ConflictException('Solo se puede enviar un borrador');
      if (p.convocatoria.estado !== 'abierta' || ahora < p.convocatoria.abreEn || ahora > p.convocatoria.cierraEn) throw new ConflictException('La convocatoria no está abierta');
      const primera = p.primeraEnviadaEn === null;
      const siguiente = primera ? await tx.convocatoria.update({ where: { id: p.convocatoriaId }, data: { siguienteNumero: { increment: 1 } }, select: { siguienteNumero: true } }) : null;
      if (primera) {
        const yaEnviadas = await tx.postulacion.count({ where: { convocatoriaId: p.convocatoriaId, elencoId: p.elencoId, primeraEnviadaEn: { not: null } } });
        if (yaEnviadas >= p.convocatoria.maxObrasPorElenco) throw new ConflictException('El elenco alcanzó el máximo de obras para esta convocatoria');
      }
      const prefijo = /-\d{4}$/.test(p.convocatoria.codigo) ? p.convocatoria.codigo : `${p.convocatoria.codigo}-${ahora.getUTCFullYear()}`;
      const numero = primera ? `${prefijo}-${String((siguiente!.siguienteNumero) - 1).padStart(4, '0')}` : p.numero;
      const actualizado = await tx.postulacion.update({ where: { id }, data: { estado: 'enviada', numero, enviadaEn: ahora, ...(primera ? { primeraEnviadaEn: ahora } : {}) }, include: { convocatoria: true, elenco: true, documentos: true } });
      const correlacionId = randomUUID();
      await tx.auditoria.create({ data: { id: randomUUID(), postulacionId: id, actorCuentaId: cuentaId, accion: 'postulacion_enviada', estadoAnterior: 'borrador', estadoNuevo: 'enviada', correlacionId } });
      const ocurridoEn = ahora.toISOString();
      await this.publicador.publicar({ id: randomUUID(), tipo: 'PostulacionEnviada', version: 1, ocurridoEn, edicionId: p.convocatoria.edicionId, correlacionId, datos: { postulacionId: id, convocatoriaId: p.convocatoriaId, cuentaPostulanteId: cuentaId, numero, enviadaEn: ocurridoEn } }, { singletonKey: `postulacion:${id}:${ahora.getTime()}` });
      return actualizado;
    });
  }

  retirar(id: string, cuentaId: string, ahora: Date) {
    return enTransaccion(this.db, async (tx) => {
      const p = await tx.postulacion.findUniqueOrThrow({ where: { id }, include: { convocatoria: true, elenco: true } });
      if (p.elenco.cuentaId !== cuentaId) throw new ForbiddenException('La postulación pertenece a otra cuenta');
      if (p.estado !== 'enviada' || ahora >= p.convocatoria.cierraEn) throw new ConflictException('Solo se puede retirar antes del cierre');
      const result = await tx.postulacion.update({ where: { id }, data: { estado: 'borrador' }, include: { convocatoria: true, elenco: true, documentos: true } });
      await tx.auditoria.create({ data: { id: randomUUID(), postulacionId: id, actorCuentaId: cuentaId, accion: 'postulacion_retirada', estadoAnterior: 'enviada', estadoNuevo: 'borrador' } });
      return result;
    });
  }

  obtenerDocumento(id: string) {
    return this.db.documento.findUnique({ where: { id }, include: { postulacion: { include: { elenco: true, convocatoria: true, asignaciones: { include: { curador: true } } } } } });
  }
  obtenerDocumentoPorKey(objectKey: string) { return this.db.documento.findUnique({ where: { objectKey } }); }
  listarDocumentos(postulacionId: string) { return this.db.documento.findMany({ where: { postulacionId }, select: { tipo: true } }); }
  registrarDocumento(input: { id: string; postulacionId: string; tipo: string; nombreOriginal: string; objectKey: string; mimeType: string; bytes: number; sha256: string }) {
    return this.db.documento.create({ data: input }).then(() => undefined);
  }

  resolverAdmisibilidad(input: {
    postulacionId: string;
    actorCuentaId?: string | null;
    decision: DecisionAdmisibilidad;
    motivo?: string | null;
    detalle?: string | null;
    ahora: Date;
  }): Promise<PostulacionAdmision> {
    return enTransaccion(this.db, async (tx) => {
      const postulacion = await tx.postulacion.findUniqueOrThrow({
        where: { id: input.postulacionId },
        include: { convocatoria: true, elenco: true },
      });
      const correlacionId = randomUUID();
      const estadoAnterior = postulacion.estado as EstadoPostulacion;
      let estadoNuevo: EstadoPostulacion;
      let motivoAuditoria = input.motivo ?? null;
      let subsanarHasta: Date | null = null;

      if (input.decision === 'admitir') {
        estadoNuevo = transicionarPostulacion(estadoAnterior, 'admitir');
        if (esCaminoALoja(postulacion.convocatoria.componente)) {
          const historial = await tx.historialObraCamino.findUnique({
            where: { obraFingerprint: postulacion.obraFingerprint },
          });
          if (historial) {
            estadoNuevo = transicionarPostulacion(estadoAnterior, 'no_admitir');
            motivoAuditoria = `RN-005: obra ya presentada en Camino a Loja (edición ${historial.edicionAnio})`;
          }
        }
      } else if (input.decision === 'no_admitir') {
        estadoNuevo = transicionarPostulacion(estadoAnterior, 'no_admitir');
      } else {
        estadoNuevo = transicionarPostulacion(estadoAnterior, 'pedir_subsanacion');
        subsanarHasta = calcularVencimientoSubsanacion(input.ahora);
        motivoAuditoria = input.detalle ?? null;
      }

      const actualizada = await tx.postulacion.update({
        where: { id: postulacion.id },
        data: { estado: estadoNuevo, subsanarHasta },
        include: { convocatoria: true, elenco: true },
      });
      await this.auditar(tx, {
        postulacionId: postulacion.id,
        actorCuentaId: input.actorCuentaId ?? null,
        accion:
          input.decision === 'subsanar'
            ? 'subsanacion_solicitada'
            : estadoNuevo === 'no_admitida'
              ? 'postulacion_no_admitida'
              : 'postulacion_admitida',
        estadoAnterior,
        estadoNuevo,
        motivo: motivoAuditoria,
        correlacionId,
      });

      if (input.decision === 'subsanar') {
        await this.publicador.publicar(
          {
            id: randomUUID(),
            tipo: 'SubsanacionSolicitada',
            version: 1,
            ocurridoEn: input.ahora.toISOString(),
            edicionId: postulacion.convocatoria.edicionId,
            correlacionId,
            datos: {
              postulacionId: postulacion.id,
              convocatoriaId: postulacion.convocatoriaId,
              cuentaPostulanteId: postulacion.elenco.cuentaId,
              numero: postulacion.numero,
              detalle: input.detalle ?? '',
              venceEn: subsanarHasta!.toISOString(),
            },
          },
          { singletonKey: `subsanacion:${postulacion.id}:${subsanarHasta!.getTime()}` },
        );
      }

      return this.mapearAdmision(actualizada);
    });
  }

  reenviarSubsanacion(input: { postulacionId: string; cuentaId: string; ahora: Date }): Promise<ReenvioSubsanacion> {
    return enTransaccion(this.db, async (tx) => {
      const postulacion = await tx.postulacion.findUniqueOrThrow({
        where: { id: input.postulacionId },
        include: { convocatoria: true, elenco: true },
      });
      if (postulacion.elenco.cuentaId !== input.cuentaId) {
        throw new ForbiddenException('La postulación pertenece a otra cuenta');
      }
      if (postulacion.estado !== 'requiere_subsanacion') {
        throw new ConflictException('La postulación no requiere subsanación');
      }
      if (!postulacion.subsanarHasta) {
        throw new ConflictException('La postulación no tiene plazo de subsanación');
      }
      const correlacionId = randomUUID();

      if (!puedeSubsanar(input.ahora, postulacion.subsanarHasta)) {
        const actualizada = await tx.postulacion.update({
          where: { id: postulacion.id },
          data: { estado: 'no_admitida' },
          include: { convocatoria: true, elenco: true },
        });
        await this.auditar(tx, {
          postulacionId: postulacion.id,
          actorCuentaId: input.cuentaId,
          accion: 'subsanacion_vencida',
          estadoAnterior: 'requiere_subsanacion',
          estadoNuevo: 'no_admitida',
          motivo: 'Plazo de subsanación vencido',
          correlacionId,
        });
        return { postulacion: this.mapearAdmision(actualizada), vencida: true };
      }

      const actualizada = await tx.postulacion.update({
        where: { id: postulacion.id },
        data: { estado: 'enviada', subsanarHasta: null, enviadaEn: input.ahora },
        include: { convocatoria: true, elenco: true },
      });
      await this.auditar(tx, {
        postulacionId: postulacion.id,
        actorCuentaId: input.cuentaId,
        accion: 'subsanacion_reenviada',
        estadoAnterior: 'requiere_subsanacion',
        estadoNuevo: 'enviada',
        motivo: null,
        correlacionId,
      });
      await this.publicador.publicar(
        {
          id: randomUUID(),
          tipo: 'PostulacionEnviada',
          version: 1,
          ocurridoEn: input.ahora.toISOString(),
          edicionId: postulacion.convocatoria.edicionId,
          correlacionId,
          datos: {
            postulacionId: postulacion.id,
            convocatoriaId: postulacion.convocatoriaId,
            cuentaPostulanteId: postulacion.elenco.cuentaId,
            numero: postulacion.numero,
            enviadaEn: input.ahora.toISOString(),
          },
        },
        { singletonKey: `postulacion:${postulacion.id}:${input.ahora.getTime()}` },
      );
      return { postulacion: this.mapearAdmision(actualizada), vencida: false };
    });
  }

  expirarSubsanacionesVencidas(ahora: Date): Promise<number> {
    return enTransaccion(this.db, async (tx) => {
      const vencidas = await tx.postulacion.findMany({
        where: { estado: 'requiere_subsanacion', subsanarHasta: { lte: ahora } },
        select: { id: true },
      });
      let expiradas = 0;
      for (const vencida of vencidas) {
        const actualizacion = await tx.postulacion.updateMany({
          where: { id: vencida.id, estado: 'requiere_subsanacion' },
          data: { estado: 'no_admitida' },
        });
        if (actualizacion.count !== 1) continue;
        await this.auditar(tx, {
          postulacionId: vencida.id,
          actorCuentaId: null,
          accion: 'subsanacion_vencida',
          estadoAnterior: 'requiere_subsanacion',
          estadoNuevo: 'no_admitida',
          motivo: 'Plazo de subsanación vencido',
          correlacionId: randomUUID(),
        });
        expiradas += 1;
      }
      return expiradas;
    });
  }

  async existeObraEnHistorialCamino(obraFingerprint: string): Promise<boolean> {
    return (await this.db.historialObraCamino.count({ where: { obraFingerprint } })) > 0;
  }

  private async auditar(
    tx: Prisma.TransactionClient,
    input: {
      postulacionId: string;
      actorCuentaId?: string | null;
      accion: string;
      estadoAnterior?: string | null;
      estadoNuevo?: string | null;
      motivo?: string | null;
      correlacionId?: string | null;
    },
  ): Promise<void> {
    await tx.auditoria.create({ data: { id: randomUUID(), ...input } });
  }

  private mapearAdmision(postulacion: {
    id: string;
    convocatoriaId: string;
    elencoId: string;
    numero: string;
    obraFingerprint: string;
    estado: string;
    subsanarHasta: Date | null;
    convocatoria: { id: string; edicionId: string; codigo: string; componente: string; provincia: string | null };
    elenco: { cuentaId: string };
  }): PostulacionAdmision {
    return {
      id: postulacion.id,
      convocatoriaId: postulacion.convocatoriaId,
      elencoId: postulacion.elencoId,
      numero: postulacion.numero,
      obraFingerprint: postulacion.obraFingerprint,
      estado: postulacion.estado as EstadoPostulacion,
      subsanarHasta: postulacion.subsanarHasta,
      convocatoria: {
        id: postulacion.convocatoria.id,
        edicionId: postulacion.convocatoria.edicionId,
        codigo: postulacion.convocatoria.codigo,
        componente: postulacion.convocatoria.componente,
        provincia: postulacion.convocatoria.provincia,
      },
      elenco: { cuentaId: postulacion.elenco.cuentaId },
    };
  }

  private datosElenco(e: DatosElenco) { return { nombre: e.nombre, responsable: e.responsable, correoContacto: e.correoContacto, provinciaPais: e.provinciaPais, trayectoria: e.trayectoria, integrantes: e.integrantes as object[] }; }
  private datosObra(o: DatosObra) { return { tituloObra: o.titulo, disciplina: o.disciplina, sinopsis: o.sinopsis, duracionMin: o.duracionMin, publico: o.publico, fichaTecnica: o.fichaTecnica as Prisma.InputJsonValue, videoUrl: o.videoUrl ?? null }; }
}
