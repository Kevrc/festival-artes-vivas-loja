import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/index.js';
import { enTransaccion, transaccionActual } from '../../../common/datos/transaccion';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  type CambioFuncion,
  type CambioRegistro,
  CruceEnBaseDeDatos,
  InterbloqueoEnBaseDeDatos,
  type DatosFuncion,
  type DatosObra,
  type EdicionDetalle,
  type EdicionVista,
  type ElencoVista,
  type FiltroObras,
  type FuncionCompleta,
  type FuncionVista,
  type ObraVista,
  type RepositorioOperacion,
  type SedeVista,
} from '../application/puertos';
import type { Bloque, FuncionAgenda } from '../domain/agenda';
import { type EstadoFuncionGuardado, normalizarAccesibilidad } from '../domain/tipos';

type Tx = Prisma.TransactionClient | PrismaService;

const incluirObra = { elenco: true } as const;
type ObraFila = Prisma.ObraOperacionGetPayload<{ include: typeof incluirObra }>;
const incluirFuncion = { obra: { select: { titulo: true } } } as const;
type FuncionFila = Prisma.FuncionOperacionGetPayload<{ include: typeof incluirFuncion }>;

/** Postgres 23P01 = exclusion_violation (restricciones `bloque_sin_cruce_*`, ADR-0010). */
const esCruce = (e: unknown) => e instanceof Error && /23P01|bloque_sin_cruce|exclusion constraint/i.test(e.message);
/** 40P01 = deadlock_detected; Prisma lo informa también como P2034 (conflicto de escritura o interbloqueo). */
const esInterbloqueo = (e: unknown) => e instanceof Error && /40P01|deadlock|P2034/i.test(`${(e as { code?: string }).code ?? ''} ${e.message}`);

/** Traduce los rechazos de la base por concurrencia a errores del puerto. */
function traducir(e: unknown): never {
  if (esInterbloqueo(e)) throw new InterbloqueoEnBaseDeDatos();
  if (esCruce(e)) throw new CruceEnBaseDeDatos();
  throw e;
}

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
  imagenes: Array.isArray(o.imagenes) ? (o.imagenes as string[]) : [],
  fichaArtistica: Array.isArray(o.fichaArtistica) ? (o.fichaArtistica as { rol: string; nombre: string }[]) : [],
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

  async enTransaccion<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await enTransaccion(this.db, () => fn());
    } catch (e) {
      // Si el interbloqueo aborta la transacción al confirmar, también llega aquí.
      if (esInterbloqueo(e)) throw new InterbloqueoEnBaseDeDatos();
      throw e;
    }
  }

  async bloquearAgenda(claves: string[]): Promise<void> {
    if (!transaccionActual()) throw new Error('bloquearAgenda requiere una transacción');
    for (const clave of [...new Set(claves)].sort()) {
      await this.tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `operacion:${clave}`);
    }
  }

  async edicion(id: string): Promise<EdicionVista | null> {
    return this.tx.edicionOperacion.findUnique({ where: { id }, select: { id: true, anio: true, estado: true } });
  }

  async ediciones(): Promise<EdicionDetalle[]> {
    const filas = await this.tx.edicionOperacion.findMany({ orderBy: { anio: 'desc' } });
    return filas.map((e) => ({
      id: e.id,
      anio: e.anio,
      estado: e.estado,
      numero: e.numero,
      fechaInicio: e.fechaInicio.toISOString().slice(0, 10),
      fechaFin: e.fechaFin.toISOString().slice(0, 10),
      paisInvitado: e.paisInvitado,
      precioCentavos: e.precioCentavos,
      maxPagadasPersona: e.maxPagadasPersona,
      maxReservasPersona: e.maxReservasPersona,
      version: e.version,
    }));
  }

  async edicionDetalle(id: string): Promise<EdicionDetalle | null> {
    return (await this.ediciones()).find((e) => e.id === id) ?? null;
  }

  async marcarEdicionPublicada(id: string): Promise<void> {
    await this.tx.edicionOperacion.updateMany({ where: { id, estado: 'planificacion' }, data: { estado: 'publicada', version: { increment: 1 } } });
  }

  async funcionesCompletas(edicionId: string, f: { estados?: EstadoFuncionGuardado[]; ids?: string[] }): Promise<FuncionCompleta[]> {
    const filas = await this.tx.funcionOperacion.findMany({
      where: { edicionId, ...(f.estados ? { estado: { in: f.estados } } : {}), ...(f.ids ? { id: { in: f.ids } } : {}) },
      include: { ...incluirFuncion, sede: true },
      orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
    });
    const obras = new Map(
      (await this.tx.obraOperacion.findMany({ where: { id: { in: [...new Set(filas.map((x) => x.obraId))] } }, include: incluirObra })).map((o) => [o.id, aObra(o)]),
    );
    const vistas = await this.conEntradas(filas);
    return filas.map((x, i) => ({ funcion: vistas[i]!, obra: obras.get(x.obraId)!, sede: aSede(x.sede) }));
  }

  async agendaPublicada(edicionId: string): Promise<FuncionAgenda[]> {
    const filas = await this.tx.funcionOperacion.findMany({
      where: { edicionId, estado: { in: ['programada', 'reprogramada'] } },
      include: { obra: { select: { titulo: true } }, sede: { select: { nombre: true, montajeMin: true } } },
    });
    return filas.map((x) => ({
      id: x.id, sedeId: x.sedeId, sedeNombre: x.sede.nombre, montajeMin: x.sede.montajeMin, elencoId: x.elencoId,
      obraTitulo: x.obra.titulo, inicio: x.inicio, fin: x.fin, continua: x.continua, activa: true,
    }));
  }

  async marcarFuncionPublicada(id: string, versionEsperada: number, versionNueva: number, publicadaEn: Date): Promise<FuncionVista | null> {
    const { count } = await this.tx.funcionOperacion.updateMany({
      where: { id, version: versionEsperada, estado: 'borrador' },
      data: { estado: 'programada', version: versionNueva, publicadaEn },
    });
    return count === 0 ? null : this.funcion(id);
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
      traducir(e);
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
      traducir(e);
    }
  }

  async eliminarFuncion(id: string, versionEsperada: number): Promise<boolean> {
    const { count } = await this.tx.funcionOperacion.deleteMany({ where: { id, version: versionEsperada, estado: 'borrador' } });
    return count > 0;
  }

  async aplicarCambio(id: string, versionEsperada: number, c: CambioFuncion): Promise<FuncionVista | null> {
    try {
      const { count } = await this.tx.funcionOperacion.updateMany({
        where: { id, version: versionEsperada },
        data: { ...c.datos, version: c.version },
      });
      if (count === 0) return null;
      if (c.bloques === 'desactivar') {
        await this.tx.bloqueOcupacion.updateMany({ where: { funcionId: id }, data: { activo: false } });
      } else if (c.bloques) {
        const f = await this.tx.funcionOperacion.findUniqueOrThrow({ where: { id } });
        await this.tx.bloqueOcupacion.deleteMany({ where: { funcionId: id } });
        await this.escribirBloques(id, f, c.bloques);
      }
      return this.funcion(id);
    } catch (e) {
      traducir(e);
    }
  }

  async registrarCambio(c: Omit<CambioRegistro, 'id' | 'registradoEn'>): Promise<void> {
    await this.tx.cambioFuncion.create({
      data: {
        id: randomUUID(),
        funcionId: c.funcionId,
        tipo: c.tipo,
        anterior: c.anterior as Prisma.InputJsonValue,
        nuevo: c.nuevo as Prisma.InputJsonValue,
        motivo: c.motivo,
        excesoConfirmado: c.excesoConfirmado,
        autorId: c.autorId,
      },
    });
  }

  async cambios(funcionId: string): Promise<CambioRegistro[]> {
    const filas = await this.tx.cambioFuncion.findMany({ where: { funcionId }, orderBy: { registradoEn: 'asc' } });
    return filas.map((c) => ({
      id: c.id,
      funcionId: c.funcionId,
      tipo: c.tipo,
      anterior: c.anterior as Record<string, unknown>,
      nuevo: c.nuevo as Record<string, unknown>,
      motivo: c.motivo,
      excesoConfirmado: c.excesoConfirmado,
      autorId: c.autorId,
      registradoEn: c.registradoEn,
    }));
  }

  async registrarPedido(p: { pedidoId: string; funcionId: string; tipo: 'compra' | 'reserva'; canal: string; cantidad: number; importeCentavos: number }): Promise<boolean> {
    const { count } = await this.tx.pedidoRegistrado.createMany({ data: [p], skipDuplicates: true });
    return count > 0;
  }

  async reembolsarPedido(pedidoId: string) {
    const pedido = await this.tx.pedidoRegistrado.findUnique({ where: { pedidoId } });
    if (!pedido || pedido.reembolsado) return null;
    await this.tx.pedidoRegistrado.update({ where: { pedidoId }, data: { reembolsado: true } });
    return { funcionId: pedido.funcionId, cantidad: pedido.cantidad, importeCentavos: pedido.importeCentavos, tipo: pedido.tipo };
  }

  async registrarIngreso(i: { ingresoId: string; funcionId: string; escaneadoEn: Date }): Promise<boolean> {
    const { count } = await this.tx.ingresoRegistrado.createMany({ data: [i], skipDuplicates: true });
    return count > 0;
  }

  async sumarMetrica(funcionId: string, d: { emitidas?: number; reembolsadas?: number; ingresos?: number; recaudacionCentavos?: number }): Promise<void> {
    const v = { emitidas: d.emitidas ?? 0, reembolsadas: d.reembolsadas ?? 0, ingresos: d.ingresos ?? 0, recaudacion: d.recaudacionCentavos ?? 0 };
    await this.tx.metricaFuncion.upsert({
      where: { funcionId },
      create: { funcionId, entradasEmitidas: v.emitidas, entradasReembolsadas: v.reembolsadas, ingresosValidados: v.ingresos, recaudacionCentavos: v.recaudacion },
      update: {
        entradasEmitidas: { increment: v.emitidas },
        entradasReembolsadas: { increment: v.reembolsadas },
        ingresosValidados: { increment: v.ingresos },
        recaudacionCentavos: { increment: v.recaudacion },
      },
    });
  }

  /** Los rangos `tstzrange` se escriben con SQL: Prisma no los modela. */
  private async escribirBloques(funcionId: string, d: Pick<DatosFuncion, 'sedeId' | 'elencoId'>, bloques: Bloque[]) {
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
