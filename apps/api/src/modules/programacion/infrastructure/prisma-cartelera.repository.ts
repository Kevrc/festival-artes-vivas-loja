import { Prisma, type PrismaClient } from '../../../generated/prisma/index.js';
import { normalizarBusqueda } from '../domain/busqueda';
import type { EscrituraProyeccion, FuncionGuardada, RepositorioCartelera } from '../application/puertos';

type Tx = Prisma.TransactionClient;
const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Escrituras de la proyección sobre el esquema `programacion` (data-model.md). */
class EscrituraPrisma implements EscrituraProyeccion {
  constructor(private readonly tx: Tx) {}

  async asegurarEdicion(edicionId: string, diaReferencia: string) {
    const ref = fecha(diaReferencia);
    // Marcador hasta que llegue ProgramacionPublicada (secuencia al publicar)
    await this.tx.edicionCartelera.upsert({
      where: { id: edicionId },
      update: {},
      create: { id: edicionId, anio: ref.getUTCFullYear(), numero: '—', fechaInicio: ref, fechaFin: ref, estado: 'borrador' },
    });
  }

  async publicarEdicion(e: Parameters<EscrituraProyeccion['publicarEdicion']>[0]) {
    const datos = {
      anio: e.anio,
      numero: e.numero,
      fechaInicio: fecha(e.fechaInicio),
      fechaFin: fecha(e.fechaFin),
      paisInvitado: e.paisInvitado ?? null,
      estado: 'publicada' as const,
    };
    await this.tx.edicionCartelera.upsert({ where: { id: e.id }, update: datos, create: { id: e.id, ...datos } });
  }

  async funcion(id: string): Promise<FuncionGuardada | null> {
    const f = await this.tx.funcionCartelera.findUnique({ where: { id }, include: { obra: { select: { elencoId: true } } } });
    if (!f) return null;
    return {
      versionOrigen: f.versionOrigen,
      diaFestival: dia(f.diaFestival),
      diaFin: dia(f.diaFin),
      continua: f.continua,
      obraId: f.obraId,
      sedeId: f.sedeId,
      elencoId: f.obra.elencoId,
      tipoAcceso: f.tipoAcceso,
      disponibilidadActualizadaEn: f.disponibilidadActualizadaEn,
    };
  }

  async guardarSede(s: Parameters<EscrituraProyeccion['guardarSede']>[0]) {
    const datos = {
      nombre: s.nombre,
      tipo: s.tipo,
      direccion: s.direccion,
      lat: s.lat,
      lng: s.lng,
      recorrido: s.recorrido ?? Prisma.DbNull,
      aforo: s.aforo ?? null,
      accesibilidad: s.accesibilidad,
    };
    await this.tx.sedeCartelera.upsert({ where: { id: s.id }, update: datos, create: { id: s.id, ...datos } });
  }

  async guardarFuncion(
    edicionId: string,
    { funcion: f, obra: o, elenco: el, sede }: Parameters<EscrituraProyeccion['guardarFuncion']>[1],
    dias: Parameters<EscrituraProyeccion['guardarFuncion']>[2],
  ) {
    await this.guardarSede(sede);
    const obra = {
      edicionId,
      titulo: o.titulo,
      sinopsis: o.sinopsis,
      disciplina: o.disciplina,
      duracionMin: o.duracionMin,
      edadMinima: o.edadMinima,
      idioma: o.idioma ?? null,
      imagenes: o.imagenes,
      fichaArtistica: o.fichaArtistica,
      elencoId: el.id,
      elencoNombre: el.nombre,
      elencoPais: el.pais,
      elencoCiudad: el.ciudad ?? null,
      componente: o.componente,
      textoBusqueda: normalizarBusqueda(`${o.titulo} ${el.nombre}`),
    };
    await this.tx.obraCartelera.upsert({ where: { id: o.id }, update: obra, create: { id: o.id, ...obra } });
    const funcion = {
      edicionId,
      obraId: o.id,
      sedeId: sede.id,
      inicio: new Date(f.inicio),
      fin: new Date(f.fin),
      diaFestival: fecha(dias.diaFestival),
      diaFin: fecha(dias.diaFin),
      continua: f.continua,
      tipoAcceso: f.tipoAcceso,
      publico: f.publico,
      aforoHabilitado: f.aforoHabilitado,
      versionOrigen: f.version,
    };
    await this.tx.funcionCartelera.upsert({
      where: { id: f.id },
      update: funcion,
      create: { id: f.id, ...funcion, disponibilidad: dias.nivel },
    });
  }

  async reprogramar(
    id: string,
    version: number,
    anterior: Parameters<EscrituraProyeccion['reprogramar']>[2],
    nuevo: Parameters<EscrituraProyeccion['reprogramar']>[3],
    dias: Parameters<EscrituraProyeccion['reprogramar']>[4],
  ) {
    // Solo si la versión guardada es menor: dos eventos de la misma función procesados en paralelo
    // no se pisan (la fila se bloquea y el WHERE se vuelve a evaluar tras el otro commit).
    await this.tx.funcionCartelera.updateMany({
      where: { id, versionOrigen: { lt: version } },
      data: {
        estado: 'reprogramada',
        horarioAnterior: { ...anterior },
        inicio: new Date(nuevo.inicio),
        fin: new Date(nuevo.fin),
        sedeId: nuevo.sedeId,
        diaFestival: fecha(dias.diaFestival),
        diaFin: fecha(dias.diaFin),
        versionOrigen: version,
      },
    });
  }

  async cancelar(id: string, version: number) {
    await this.tx.funcionCartelera.updateMany({ where: { id, versionOrigen: { lt: version } }, data: { estado: 'cancelada', versionOrigen: version } });
  }

  async guardarDisponibilidad(id: string, d: Parameters<EscrituraProyeccion['guardarDisponibilidad']>[1]) {
    await this.tx.funcionCartelera.update({
      where: { id },
      data: {
        lugaresRestantes: d.lugaresRestantes,
        aforoHabilitado: d.aforoHabilitado,
        disponibilidad: d.nivel,
        disponibilidadActualizadaEn: d.calculadoEn,
      },
    });
  }
}

export class PrismaCarteleraRepository implements RepositorioCartelera {
  constructor(private readonly db: PrismaClient) {}

  async procesarUnaVez<T>(eventoId: string, tipo: string, trabajo: (w: EscrituraProyeccion) => Promise<T>) {
    return this.db.$transaction(async (tx) => {
      const insertados = await tx.$executeRaw`
        INSERT INTO programacion.evento_procesado (evento_id, tipo) VALUES (${eventoId}::uuid, ${tipo})
        ON CONFLICT DO NOTHING`;
      if (insertados === 0) return null;
      return trabajo(new EscrituraPrisma(tx));
    });
  }
}
