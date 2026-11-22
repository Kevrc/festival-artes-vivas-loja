import { Prisma } from '../../../generated/prisma/index.js';
import { transaccionActual } from '../../../common/datos/transaccion';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { EdicionGuardar, RepositorioMaestros, SedeGuardar } from '../application/puertos';

type Tx = Prisma.TransactionClient | PrismaService;
const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
const json = (v: unknown) => (v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue));

/** Ediciones y sedes del esquema `operacion` (US6). El control optimista va por `version`. */
export class PrismaMaestrosRepository implements RepositorioMaestros {
  constructor(private readonly db: PrismaService) {}

  private get tx(): Tx {
    return transaccionActual() ?? this.db;
  }

  async anioOcupado(anio: number, exceptoId?: string): Promise<boolean> {
    return (await this.tx.edicionOperacion.count({ where: { anio, ...(exceptoId ? { id: { not: exceptoId } } : {}) } })) > 0;
  }

  async crearEdicion(id: string, e: EdicionGuardar, edicionBaseId: string | null): Promise<void> {
    await this.tx.edicionOperacion.create({
      data: {
        id, numero: e.numero, anio: e.anio, fechaInicio: fecha(e.fechaInicio), fechaFin: fecha(e.fechaFin), paisInvitado: e.paisInvitado,
        precioCentavos: e.precioCentavos, maxPagadasPersona: e.maxPagadasPersona, maxReservasPersona: e.maxReservasPersona, edicionBaseId,
      },
    });
  }

  async actualizarEdicion(id: string, versionEsperada: number, e: EdicionGuardar): Promise<boolean> {
    const { count } = await this.tx.edicionOperacion.updateMany({
      where: { id, version: versionEsperada },
      data: {
        numero: e.numero, anio: e.anio, fechaInicio: fecha(e.fechaInicio), fechaFin: fecha(e.fechaFin), paisInvitado: e.paisInvitado,
        precioCentavos: e.precioCentavos, maxPagadasPersona: e.maxPagadasPersona, maxReservasPersona: e.maxReservasPersona, version: { increment: 1 },
      },
    });
    return count > 0;
  }

  async crearSede(id: string, edicionId: string, s: SedeGuardar, sedeOrigenId: string | null): Promise<void> {
    await this.tx.sedeOperacion.create({
      data: {
        id, edicionId, sedeOrigenId, nombre: s.nombre, tipo: s.tipo, direccion: s.direccion, lat: s.lat, lng: s.lng, recorrido: json(s.recorrido),
        aforo: s.aforo, accesibilidad: s.accesibilidad, montajeMin: s.montajeMin, horarioTaquilla: json(s.horarioTaquilla), activa: s.activa,
      },
    });
  }

  async actualizarSede(id: string, versionEsperada: number, s: SedeGuardar): Promise<boolean> {
    const { count } = await this.tx.sedeOperacion.updateMany({
      where: { id, version: versionEsperada },
      data: {
        nombre: s.nombre, tipo: s.tipo, direccion: s.direccion, lat: s.lat, lng: s.lng, recorrido: s.recorrido === null ? Prisma.DbNull : json(s.recorrido),
        aforo: s.aforo, accesibilidad: s.accesibilidad, montajeMin: s.montajeMin, horarioTaquilla: s.horarioTaquilla === null ? Prisma.DbNull : json(s.horarioTaquilla),
        activa: s.activa, version: { increment: 1 },
      },
    });
    return count > 0;
  }

  async eliminarSede(id: string): Promise<void> {
    await this.tx.sedeOperacion.delete({ where: { id } });
  }

  async nombreOcupado(edicionId: string, nombre: string, exceptoId?: string): Promise<boolean> {
    return (await this.tx.sedeOperacion.count({ where: { edicionId, nombre: { equals: nombre, mode: 'insensitive' }, ...(exceptoId ? { id: { not: exceptoId } } : {}) } })) > 0;
  }

  async usoDeSede(sedeId: string, ahora: Date): Promise<{ total: number; futuras: number; aforoMaximo: number | null }> {
    const [total, futuras, maximo] = await Promise.all([
      this.tx.funcionOperacion.count({ where: { sedeId } }),
      this.tx.funcionOperacion.count({ where: { sedeId, estado: { not: 'cancelada' }, fin: { gt: ahora } } }),
      this.tx.funcionOperacion.aggregate({ where: { sedeId, estado: { not: 'cancelada' } }, _max: { aforoHabilitado: true } }),
    ]);
    return { total: total + (await this.tx.incidencia.count({ where: { sedeId } })), futuras, aforoMaximo: maximo._max.aforoHabilitado };
  }
}
