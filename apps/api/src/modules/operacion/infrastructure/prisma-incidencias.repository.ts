import type { Prisma } from '../../../generated/prisma/index.js';
import { transaccionActual } from '../../../common/datos/transaccion';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { ConteoVista, IncidenciaVista, RepositorioIncidencias } from '../application/puertos';

type Tx = Prisma.TransactionClient | PrismaService;

/** Incidencias y conteos estimados del esquema `operacion` (US4). */
export class PrismaIncidenciasRepository implements RepositorioIncidencias {
  constructor(private readonly db: PrismaService) {}

  private get tx(): Tx {
    return transaccionActual() ?? this.db;
  }

  async crearIncidencia(i: Omit<IncidenciaVista, 'estado'> & { eventoOrigenId?: string | null }) {
    const { count } = await this.tx.incidencia.createMany({ data: [{ ...i, eventoOrigenId: i.eventoOrigenId ?? null }], skipDuplicates: true });
    const fila = i.eventoOrigenId
      ? await this.tx.incidencia.findUniqueOrThrow({ where: { eventoOrigenId: i.eventoOrigenId } })
      : await this.tx.incidencia.findUniqueOrThrow({ where: { id: i.id } });
    return { incidencia: fila as IncidenciaVista, nueva: count > 0 };
  }

  async incidencia(id: string) {
    return (await this.tx.incidencia.findUnique({ where: { id } })) as IncidenciaVista | null;
  }

  async atender(id: string) {
    await this.tx.incidencia.updateMany({ where: { id }, data: { estado: 'atendida' } });
    return this.incidencia(id);
  }

  async incidencias(edicionId: string, f: { sedeIds?: string[]; desde?: Date; hasta?: Date; estado?: 'abierta' | 'atendida' }) {
    const filas = await this.tx.incidencia.findMany({
      where: {
        edicionId,
        ...(f.sedeIds ? { sedeId: { in: f.sedeIds } } : {}),
        ...(f.estado ? { estado: f.estado } : {}),
        ...(f.desde || f.hasta ? { ocurridaEn: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lt: f.hasta } : {}) } } : {}),
      },
      orderBy: { ocurridaEn: 'desc' },
      take: 500,
    });
    return filas as IncidenciaVista[];
  }

  async crearConteo(c: ConteoVista) {
    const { count } = await this.tx.conteoEstimado.createMany({ data: [c], skipDuplicates: true });
    return { conteo: (await this.tx.conteoEstimado.findUniqueOrThrow({ where: { id: c.id } })) as ConteoVista, nuevo: count > 0 };
  }

  async marcarObraDesistida(obraId: string) {
    const { count } = await this.tx.obraOperacion.updateMany({ where: { id: obraId, estado: { not: 'desistida' } }, data: { estado: 'desistida', version: { increment: 1 } } });
    return count > 0;
  }
}
