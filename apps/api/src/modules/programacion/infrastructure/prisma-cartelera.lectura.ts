import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../../generated/prisma/index.js';
import { normalizarBusqueda } from '../domain/busqueda';
import { ordenarDia } from '../domain/reglas-dia';
import type { Edicion, FuncionResumen, ObraResumen, SedeResumen } from '../application/vistas';

const VISIBLE = { estado: { in: ['publicada', 'cerrada'] } } satisfies Prisma.EdicionCarteleraWhereInput;
const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const dia = (d: Date) => d.toISOString().slice(0, 10);

const conRelaciones = { obra: true, sede: true } satisfies Prisma.FuncionCarteleraInclude;
type FilaFuncion = Prisma.FuncionCarteleraGetPayload<{ include: typeof conRelaciones }>;
type FilaObra = Prisma.ObraCarteleraGetPayload<object>;
type FilaSede = Prisma.SedeCarteleraGetPayload<object>;
type FilaEdicion = Prisma.EdicionCarteleraGetPayload<object>;

export const aEdicion = (e: FilaEdicion): Edicion => ({
  id: e.id,
  anio: e.anio,
  numero: e.numero,
  fechaInicio: dia(e.fechaInicio),
  fechaFin: dia(e.fechaFin),
  ...(e.paisInvitado ? { paisInvitado: e.paisInvitado } : {}),
});

export const aSede = (s: FilaSede): SedeResumen => ({ id: s.id, nombre: s.nombre, tipo: s.tipo, coordenadas: { lat: s.lat, lng: s.lng } });

export const aObra = (o: FilaObra): ObraResumen => {
  const imagen = (o.imagenes as string[])[0];
  return {
    id: o.id,
    titulo: o.titulo,
    disciplina: o.disciplina,
    componente: o.componente,
    edadMinima: o.edadMinima,
    ...(imagen ? { imagen } : {}),
    elenco: { id: o.elencoId, nombre: o.elencoNombre, pais: o.elencoPais },
  };
};

/** Estado visible: una función programada cuya hora de fin pasó se muestra finalizada (data-model). */
export const aFuncion = (f: FilaFuncion, ahora: Date): FuncionResumen => ({
  id: f.id,
  inicio: f.inicio.toISOString(),
  fin: f.fin.toISOString(),
  continua: f.continua,
  tipoAcceso: f.tipoAcceso,
  publico: f.publico,
  estado: f.estado !== 'cancelada' && !f.continua && f.fin < ahora ? 'finalizada' : f.estado,
  ...(f.horarioAnterior ? { horarioAnterior: f.horarioAnterior as unknown as FuncionResumen['horarioAnterior'] } : {}),
  obra: aObra(f.obra),
  sede: aSede(f.sede),
});

/** Huella de la programación (no de la disponibilidad) para avisar cambios (research R5). */
export const versionDe = (fs: { id: string; versionOrigen: number; estado: string }[]) =>
  createHash('sha1')
    .update(fs.map((f) => `${f.id}:${f.versionOrigen}:${f.estado}`).sort().join('|'))
    .digest('hex')
    .slice(0, 16);

/** Consultas de lectura de la cartelera: solo ediciones visibles (RN-001). */
export class PrismaCarteleraLectura {
  constructor(private readonly db: PrismaClient) {}

  edicionesVisibles() {
    return this.db.edicionCartelera.findMany({ where: VISIBLE, orderBy: { fechaInicio: 'asc' } });
  }

  async facetas(edicionId: string) {
    const fs = await this.db.funcionCartelera.findMany({ where: { edicionId }, include: conRelaciones });
    const unicos = <T>(xs: T[]) => [...new Set(xs)].sort((a, b) => String(a).localeCompare(String(b), 'es'));
    const sedes = new Map(fs.map((f) => [f.sede.id, aSede(f.sede)]));
    return {
      sedes: [...sedes.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      disciplinas: unicos(fs.map((f) => f.obra.disciplina)),
      paises: unicos(fs.map((f) => f.obra.elencoPais)),
      componentes: unicos(fs.map((f) => f.obra.componente)),
    };
  }

  /** Funciones visibles de un día, incluidas las continuas que lo abarcan. */
  async funcionesDelDia(d: string) {
    const f = fecha(d);
    return this.db.funcionCartelera.findMany({
      where: {
        edicion: VISIBLE,
        OR: [{ diaFestival: f }, { continua: true, diaFestival: { lte: f }, diaFin: { gte: f } }],
      },
      include: conRelaciones,
    });
  }

  async edicionQueContiene(d: string) {
    const f = fecha(d);
    return this.db.edicionCartelera.findFirst({ where: { ...VISIBLE, fechaInicio: { lte: f }, fechaFin: { gte: f } } });
  }

  async enVentana(desde: Date, hasta: Date) {
    const fs = await this.db.funcionCartelera.findMany({
      where: { edicion: VISIBLE, estado: { not: 'cancelada' }, inicio: { lte: hasta }, fin: { gte: desde } },
      include: conRelaciones,
    });
    return ordenarDia(fs.map((f) => ({ ...f, inicio: f.inicio })));
  }

  /** FR-004: coincidencias parciales sin tildes, ordenadas por similitud (pg_trgm). */
  async buscar(q: string) {
    const n = normalizarBusqueda(q);
    const filas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT o.id FROM programacion.obra_cartelera o
      JOIN programacion.edicion_cartelera e ON e.id = o.edicion_id
      WHERE e.estado IN ('publicada', 'cerrada')
        AND (o.texto_busqueda LIKE '%' || ${n} || '%' OR similarity(o.texto_busqueda, ${n}) > 0.3)
      ORDER BY similarity(o.texto_busqueda, ${n}) DESC, o.titulo
      LIMIT 20`;
    const ids = filas.map((f) => f.id);
    const obras = await this.db.obraCartelera.findMany({
      where: { id: { in: ids } },
      include: { funciones: { include: conRelaciones, orderBy: { inicio: 'asc' } } },
    });
    return ids.map((id) => obras.find((o) => o.id === id)!).filter(Boolean);
  }

  obra(id: string) {
    return this.db.obraCartelera.findFirst({
      where: { id, edicion: VISIBLE },
      include: { funciones: { include: conRelaciones, orderBy: { inicio: 'asc' } } },
    });
  }

  obrasDeElenco(elencoId: string) {
    return this.db.obraCartelera.findMany({ where: { elencoId, edicion: VISIBLE }, orderBy: { titulo: 'asc' } });
  }

  async sede(id: string) {
    const sede = await this.db.sedeCartelera.findUnique({ where: { id } });
    if (!sede) return null;
    const funciones = await this.db.funcionCartelera.findMany({
      where: { sedeId: id, edicion: VISIBLE },
      include: conRelaciones,
      orderBy: { inicio: 'asc' },
    });
    return { sede, funciones };
  }

  funcion(id: string) {
    return this.db.funcionCartelera.findFirst({ where: { id, edicion: VISIBLE }, include: conRelaciones });
  }
}
