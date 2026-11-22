import type { Prisma } from '../../../generated/prisma/index.js';
import { transaccionActual } from '../../../common/datos/transaccion';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { FiltroIndicadores, InformeGuardado, RepositorioEstadisticas } from '../application/puertos';
import { diaFestival, rangoDelDia } from '../domain/agenda';
import type { DatoFuncion } from '../domain/indicadores';

type Tx = Prisma.TransactionClient | PrismaService;

/**
 * Lecturas para estadísticas (US5, research R7): función × sede × obra × elenco con su métrica
 * (proyección de Boletería) y el último conteo estimado. Una consulta por edición: el festival
 * tiene cientos de funciones, no millones.
 */
export class PrismaEstadisticasRepository implements RepositorioEstadisticas {
  constructor(private readonly db: PrismaService) {}

  private get tx(): Tx {
    return transaccionActual() ?? this.db;
  }

  async datos(edicionId: string, f: FiltroIndicadores): Promise<DatoFuncion[]> {
    const desde = f.desde ? rangoDelDia(f.desde).desde : undefined;
    const hasta = f.hasta ? rangoDelDia(f.hasta).hasta : undefined;
    const filas = await this.tx.funcionOperacion.findMany({
      where: {
        edicionId,
        estado: { not: 'borrador' },
        ...(desde || hasta ? { inicio: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lt: hasta } : {}) } } : {}),
        ...(f.sedeId ? { sedeId: f.sedeId } : {}),
        obra: {
          ...(f.disciplina ? { disciplina: f.disciplina as never } : {}),
          ...(f.componente ? { componente: f.componente as never } : {}),
          ...(f.pais ? { elenco: { pais: f.pais } } : {}),
        },
      },
      include: {
        sede: { select: { nombre: true } },
        obra: { select: { titulo: true, disciplina: true, componente: true, elencoId: true, elenco: { select: { pais: true } } } },
        conteos: { orderBy: { registradoEn: 'desc' }, take: 1, select: { cantidad: true } },
      },
    });
    const metricas = new Map(
      (await this.tx.metricaFuncion.findMany({ where: { funcionId: { in: filas.map((x) => x.id) } } })).map((m) => [m.funcionId, m]),
    );
    return filas.map((x) => {
      const m = metricas.get(x.id);
      return {
        funcionId: x.id,
        titulo: x.obra.titulo,
        dia: diaFestival(x.inicio),
        sedeId: x.sedeId,
        sedeNombre: x.sede.nombre,
        disciplina: x.obra.disciplina,
        componente: x.obra.componente,
        pais: x.obra.elenco.pais,
        obraId: x.obraId,
        elencoId: x.obra.elencoId,
        estado: x.estado,
        fin: x.fin,
        aforoHabilitado: x.aforoHabilitado,
        emitidas: m?.entradasEmitidas ?? 0,
        reembolsadas: m?.entradasReembolsadas ?? 0,
        ingresos: m?.ingresosValidados ?? 0,
        recaudacionCentavos: m?.recaudacionCentavos ?? 0,
        estimado: x.conteos[0]?.cantidad ?? 0,
      };
    });
  }

  async ultimaActualizacion(edicionId: string): Promise<Date | null> {
    const m = await this.tx.metricaFuncion.findFirst({ where: { funcionId: { in: (await this.tx.funcionOperacion.findMany({ where: { edicionId }, select: { id: true } })).map((x) => x.id) } }, orderBy: { actualizadoEn: 'desc' }, select: { actualizadoEn: true } });
    return m?.actualizadoEn ?? null;
  }

  async cifrasHistoricas(anio: number) {
    return this.tx.cifrasHistoricas.findUnique({ where: { anio } });
  }

  async informe(edicionId: string): Promise<InformeGuardado | null> {
    const i = await this.tx.informeCierre.findUnique({ where: { edicionId } });
    return i ? { edicionId: i.edicionId, generadoEn: i.generadoEn, datos: i.datos as Record<string, unknown> } : null;
  }

  async informeDelAnio(anio: number): Promise<InformeGuardado | null> {
    const e = await this.tx.edicionOperacion.findUnique({ where: { anio }, select: { id: true } });
    return e ? this.informe(e.id) : null;
  }

  async guardarInforme(edicionId: string, generadoEn: Date, datos: Record<string, unknown>): Promise<void> {
    const json = datos as Prisma.InputJsonValue;
    await this.tx.informeCierre.upsert({ where: { edicionId }, create: { edicionId, generadoEn, datos: json }, update: { generadoEn, datos: json } });
  }

  async edicionesPublicadas(): Promise<{ id: string; anio: number; fechaFin: string; ultimoFin: Date | null }[]> {
    const eds = await this.tx.edicionOperacion.findMany({ where: { estado: 'publicada' }, select: { id: true, anio: true, fechaFin: true } });
    const res = [];
    for (const e of eds) {
      const ultima = await this.tx.funcionOperacion.findFirst({ where: { edicionId: e.id, estado: { notIn: ['borrador', 'cancelada'] } }, orderBy: { fin: 'desc' }, select: { fin: true } });
      res.push({ id: e.id, anio: e.anio, fechaFin: e.fechaFin.toISOString().slice(0, 10), ultimoFin: ultima?.fin ?? null });
    }
    return res;
  }

  async cerrarEdicion(edicionId: string): Promise<boolean> {
    const { count } = await this.tx.edicionOperacion.updateMany({ where: { id: edicionId, estado: 'publicada' }, data: { estado: 'cerrada', version: { increment: 1 } } });
    return count > 0;
  }
}
