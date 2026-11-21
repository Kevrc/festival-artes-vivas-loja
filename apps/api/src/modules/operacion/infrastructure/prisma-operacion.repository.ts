import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/index.js';
import { enTransaccion, transaccionActual } from '../../../common/datos/transaccion';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  CruceEnBaseDeDatos,
  type DatosFuncion,
  type DatosObra,
  type EdicionVista,
  type ElencoVista,
  type FiltroObras,
  type FuncionVista,
  type ObraVista,
  type RepositorioOperacion,
  type SedeVista,
} from '../application/puertos';
import type { Bloque, FuncionAgenda } from '../domain/agenda';
import { normalizarAccesibilidad } from '../domain/tipos';

type Tx = Prisma.TransactionClient | PrismaService;

const incluirObra = { elenco: true } as const;
type ObraFila = Prisma.ObraOperacionGetPayload<{ include: typeof incluirObra }>;
const incluirFuncion = { obra: { select: { titulo: true } } } as const;
type FuncionFila = Prisma.FuncionOperacionGetPayload<{ include: typeof incluirFuncion }>;

/** Postgres 23P01 = exclusion_violation (restricciones `bloque_sin_cruce_*`, ADR-0010). */
const esCruce = (e: unknown) => e instanceof Error && /23P01|bloque_sin_cruce|exclusion constraint/i.test(e.message);

const aSede = (s: Prisma.SedeOperacionGetPayload<object>): SedeVista => ({
  id: s.id,
  edicionId: s.edicionId,
  nombre: s.nombre,
  tipo: s.tipo,
  direccion: s.direccion,
  lat: s.lat,
  lng: s.lng,
  recorrido: s.recorrido,
  aforo: s.aforo,
  accesibilidad: normalizarAccesibilidad(s.accesibilidad),
  montajeMin: s.montajeMin,
  horarioTaquilla: s.horarioTaquilla,
  activa: s.activa,
  version: s.version,
});

const aElenco = (e: ObraFila['elenco']): ElencoVista => ({ id: e.id, nombre: e.nombre, pais: e.pais, ciudad: e.ciudad });

const aObra = (o: ObraFila): ObraVista => ({
  id: o.id,
  edicionId: o.edicionId,
  titulo: o.titulo,
  sinopsis: o.sinopsis,
  disciplina: o.disciplina,
  componente: o.componente,
  duracionMin: o.duracionMin,
  edadMinima: o.edadMinima,
  idioma: o.idioma,
  imagenes: (o.imagenes as string[] | null) ?? [],
  fichaArtistica: (o.fichaArtistica as { rol: string; nombre: string }[] | null) ?? [],
  fichaTecnica: (o.fichaTecnica as Record<string, unknown> | null) ?? {},
  estado: o.estado,
  origen: o.origen,
  version: o.version,
  elenco: aElenco(o.elenco),
});

const datosObra = (d: DatosObra) => ({
  titulo: d.titulo,
  sinopsis: d.sinopsis,
  disciplina: d.disciplina,
  componente: d.componente,
  duracionMin: d.duracionMin,
  edadMinima: d.edadMinima,
  idioma: d.idioma,
  imagenes: d.imagenes,
  fichaArtistica: d.fichaArtistica,
  fichaTecnica: d.fichaTecnica as Prisma.InputJsonValue,
});

export class PrismaOperacionRepository implements RepositorioOperacion {
  constructor(private readonly db: PrismaService) {}

  private get tx(): Tx {
    return transaccionActual() ?? this.db;
  }

  enTransaccion<T>(fn: () => Promise<T>): Promise<T> {
    return enTransaccion(this.db, () => fn());
  }

  async edicion(id: string): Promise<EdicionVista | null> {
    return this.tx.edicionOperacion.findUnique({ where: { id }, select: { id: true, anio: true, estado: true } });
  }

  async sede(id: string): Promise<SedeVista | null> {
    const s = await this.tx.sedeOperacion.findUnique({ where: { id } });
    return s && aSede(s);
  }

  async sedesDeEdicion(edicionId: string, soloActivas: boolean): Promise<SedeVista[]> {
    const filas = await this.tx.sedeOperacion.findMany({
      where: { edicionId, ...(soloActivas ? { activa: true } : {}) },
      orderBy: { nombre: 'asc' },
    });
    return filas.map(aSede);
  }

  async obra(id: string): Promise<ObraVista | null> {
    const o = await this.tx.obraOperacion.findUnique({ where: { id }, include: incluirObra });
    return o && aObra(o);
  }

  async buscarObras(edicionId: string, f: FiltroObras): Promise<ObraVista[]> {
    const filas = await this.tx.obraOperacion.findMany({
      where: {
        edicionId,
        ...(f.origen ? { origen: f.origen } : {}),
        ...(f.incluirDesistidas ? {} : { estado: 'disponible' }),
        ...(f.q
          ? { OR: [{ titulo: { contains: f.q, mode: 'insensitive' } }, { elenco: { nombre: { contains: f.q, mode: 'insensitive' } } }] }
          : {}),
      },
      include: incluirObra,
      orderBy: { titulo: 'asc' },
    });
    return filas.map(aObra);
  }

  async crearObra(
    edicionId: string,
    d: DatosObra,
    elenco: Omit<ElencoVista, 'id'> & { id?: string },
    origen: 'invitado' | 'convocatoria',
    postulacionId?: string,
    obraId?: string,
  ): Promise<ObraVista> {
    const elencoId = elenco.id ?? randomUUID();
    await this.tx.elencoOperacion.upsert({
      where: { id: elencoId },
      create: { id: elencoId, nombre: elenco.nombre, pais: elenco.pais, ciudad: elenco.ciudad, origen, postulacionId: postulacionId ?? null },
      update: {},
    });
    const o = await this.tx.obraOperacion.create({
      data: { id: obraId ?? randomUUID(), edicionId, elencoId, ...datosObra(d), origen, postulacionId: postulacionId ?? null },
      include: incluirObra,
    });
    return aObra(o);
  }

  async actualizarObra(id: string, versionEsperada: number, d: DatosObra): Promise<ObraVista | null> {
    const { count } = await this.tx.obraOperacion.updateMany({
      where: { id, version: versionEsperada },
      data: { ...datosObra(d), version: { increment: 1 } },
    });
    return count === 0 ? null : this.obra(id);
  }

  async funcion(id: string): Promise<FuncionVista | null> {
    const f = await this.tx.funcionOperacion.findUnique({ where: { id }, include: incluirFuncion });
    return f ? (await this.conEntradas([f]))[0]! : null;
  }

  async funcionesDeObra(obraId: string): Promise<FuncionVista[]> {
    const filas = await this.tx.funcionOperacion.findMany({ where: { obraId }, include: incluirFuncion, orderBy: { inicio: 'asc' } });
    return this.conEntradas(filas);
  }

  async agendaVecina(f: { sedeId: string; elencoId: string; desde: Date; hasta: Date }): Promise<FuncionAgenda[]> {
    const filas = await this.tx.funcionOperacion.findMany({
      where: {
        estado: { not: 'cancelada' },
        OR: [{ sedeId: f.sedeId }, { elencoId: f.elencoId }],
        inicio: { lt: f.hasta },
        fin: { gt: f.desde },
      },
      include: { obra: { select: { titulo: true } }, sede: { select: { nombre: true, montajeMin: true } } },
    });
    return filas.map((x) => ({
      id: x.id,
      sedeId: x.sedeId,
      sedeNombre: x.sede.nombre,
      montajeMin: x.sede.montajeMin,
      elencoId: x.elencoId,
      obraTitulo: x.obra.titulo,
      inicio: x.inicio,
      fin: x.fin,
      continua: x.continua,
      activa: true,
    }));
  }

  async funcionesEntre(edicionId: string, desde: Date, hasta: Date): Promise<FuncionVista[]> {
    const filas = await this.tx.funcionOperacion.findMany({
      where: { edicionId, inicio: { lt: hasta }, fin: { gt: desde } },
      include: incluirFuncion,
      orderBy: [{ inicio: 'asc' }],
    });
    return this.conEntradas(filas);
  }

  async crearFuncion(id: string, edicionId: string, d: DatosFuncion, bloques: Bloque[], creadaPor: string): Promise<FuncionVista> {
    try {
      const f = await this.tx.funcionOperacion.create({
        data: { id, edicionId, ...d, estado: 'borrador', creadaPor },
        include: incluirFuncion,
      });
      await this.escribirBloques(id, d, bloques);
      return (await this.conEntradas([f]))[0]!;
    } catch (e) {
      if (esCruce(e)) throw new CruceEnBaseDeDatos();
      throw e;
    }
  }

  async actualizarFuncion(id: string, versionEsperada: number, d: DatosFuncion, bloques: Bloque[]): Promise<FuncionVista | null> {
    try {
      const { count } = await this.tx.funcionOperacion.updateMany({
        where: { id, version: versionEsperada },
        data: { ...d, version: { increment: 1 } },
      });
      if (count === 0) return null;
      await this.tx.bloqueOcupacion.deleteMany({ where: { funcionId: id } });
      await this.escribirBloques(id, d, bloques);
      return this.funcion(id);
    } catch (e) {
      if (esCruce(e)) throw new CruceEnBaseDeDatos();
      throw e;
    }
  }

  async eliminarFuncion(id: string, versionEsperada: number): Promise<boolean> {
    const { count } = await this.tx.funcionOperacion.deleteMany({ where: { id, version: versionEsperada, estado: 'borrador' } });
    return count > 0;
  }

  /** Los rangos `tstzrange` se escriben con SQL: Prisma no los modela. */
  private async escribirBloques(funcionId: string, d: DatosFuncion, bloques: Bloque[]) {
    for (const b of bloques) {
      await this.tx.$executeRawUnsafe(
        `INSERT INTO operacion.bloque_ocupacion (id, funcion_id, sede_id, elenco_id, rango_sede, rango_elenco)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, tstzrange($5::timestamptz, $6::timestamptz, '[)'), tstzrange($7::timestamptz, $8::timestamptz, '[)'))`,
        randomUUID(), funcionId, d.sedeId, d.elencoId,
        b.sede.desde.toISOString(), b.sede.hasta.toISOString(), b.elenco.desde.toISOString(), b.elenco.hasta.toISOString(),
      );
    }
  }

  /** Entradas activas = emitidas − reembolsadas, según la proyección de Boletería (research R7). */
  private async conEntradas(filas: FuncionFila[]): Promise<FuncionVista[]> {
    const metricas = await this.tx.metricaFuncion.findMany({ where: { funcionId: { in: filas.map((f) => f.id) } } });
    const activas = new Map(metricas.map((m) => [m.funcionId, m.entradasEmitidas - m.entradasReembolsadas]));
    return filas.map((f) => ({
      id: f.id,
      edicionId: f.edicionId,
      obraId: f.obraId,
      obraTitulo: f.obra.titulo,
      sedeId: f.sedeId,
      elencoId: f.elencoId,
      inicio: f.inicio,
      fin: f.fin,
      continua: f.continua,
      tipoAcceso: f.tipoAcceso,
      publico: f.publico,
      aforoHabilitado: f.aforoHabilitado,
      estado: f.estado,
      version: f.version,
      entradasActivas: activas.get(f.id) ?? 0,
    }));
  }
}
