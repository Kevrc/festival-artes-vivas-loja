import type { EventoPublicadoOperacion } from '@fiavl/contracts';
import type { z } from 'zod';
import type { Bloque, FuncionAgenda } from '../domain/agenda';
import type {
  Accesibilidad,
  ComponenteObra,
  DisciplinaObra,
  EstadoEdicion,
  EstadoFuncionGuardado,
  EstadoObra,
  PublicoFuncion,
  TipoAccesoFuncion,
  TipoSedeOperacion,
} from '../domain/tipos';

/** Puertos del módulo Operación (spec 004, Parte A). El dominio no conoce Prisma ni pg-boss. */

export const RELOJ_OPERACION = Symbol('RELOJ_OPERACION');
export const PUBLICADOR_OPERACION = Symbol('PUBLICADOR_OPERACION');
export const AUDITORIA_OPERACION = Symbol('AUDITORIA_OPERACION');
export const MANEJADORES_OPERACION = Symbol('MANEJADORES_OPERACION');

/** Hora actual; respeta FIAVL_AHORA fuera de producción (reprogramación, cierre). */
export type RelojOperacion = () => Date;

export interface PublicadorOperacion {
  /** Publica dentro de la transacción ambiente: el cambio y su evento se confirman juntos (ADR-0003). */
  publicar(evento: EventoPublicadoOperacion): Promise<void>;
}

export interface EntradaAuditoria {
  accion: string;
  actorId: string | null;
  rol?: string | null;
  entidad: string;
  entidadId?: string | null;
  anterior?: unknown;
  nuevo?: unknown;
  correlacionId?: string | null;
}

/** Bitácora inmutable (FR-012, Constitución IX). */
export interface AuditoriaOperacion {
  registrar(entrada: EntradaAuditoria): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Repositorio (esquema `operacion`). Las vistas son lo que necesitan los casos de uso.
// ---------------------------------------------------------------------------------------------

export const REPOSITORIO_OPERACION = Symbol('REPOSITORIO_OPERACION');

export interface EdicionVista {
  id: string;
  anio: number;
  estado: EstadoEdicion;
}

export interface EdicionDetalle extends EdicionVista {
  numero: string;
  fechaInicio: string;
  fechaFin: string;
  paisInvitado: string | null;
  precioCentavos: number;
  maxPagadasPersona: number;
  maxReservasPersona: number;
  version: number;
}

export interface SedeVista {
  id: string;
  edicionId: string;
  nombre: string;
  tipo: TipoSedeOperacion;
  direccion: string;
  lat: number;
  lng: number;
  recorrido: unknown;
  aforo: number | null;
  accesibilidad: Accesibilidad;
  montajeMin: number;
  horarioTaquilla: unknown;
  activa: boolean;
  version: number;
}

export interface ElencoVista {
  id: string;
  nombre: string;
  pais: string;
  ciudad: string | null;
}

export interface ObraVista {
  id: string;
  edicionId: string;
  titulo: string;
  sinopsis: string;
  disciplina: DisciplinaObra;
  componente: ComponenteObra;
  duracionMin: number;
  edadMinima: number;
  idioma: string | null;
  imagenes: string[];
  fichaArtistica: { rol: string; nombre: string }[];
  fichaTecnica: Record<string, unknown>;
  estado: EstadoObra;
  origen: 'invitado' | 'convocatoria';
  version: number;
  elenco: ElencoVista;
}

export interface FuncionVista {
  id: string;
  edicionId: string;
  obraId: string;
  obraTitulo: string;
  sedeId: string;
  elencoId: string;
  inicio: Date;
  fin: Date;
  continua: boolean;
  /** null en un borrador: se exige al publicar (US2-AS2). */
  tipoAcceso: TipoAccesoFuncion | null;
  publico: PublicoFuncion;
  aforoHabilitado: number | null;
  estado: EstadoFuncionGuardado;
  version: number;
  entradasActivas: number;
}

export interface DatosFuncion {
  obraId: string;
  sedeId: string;
  elencoId: string;
  inicio: Date;
  fin: Date;
  continua: boolean;
  tipoAcceso: TipoAccesoFuncion | null;
  publico: PublicoFuncion;
  aforoHabilitado: number | null;
}

export interface DatosObra {
  titulo: string;
  sinopsis: string;
  disciplina: DisciplinaObra;
  componente: ComponenteObra;
  duracionMin: number;
  edadMinima: number;
  idioma: string | null;
  imagenes: string[];
  fichaArtistica: { rol: string; nombre: string }[];
  fichaTecnica: Record<string, unknown>;
}

/** Función con su obra y su sede: lo que hace falta para validarla y para armar sus eventos. */
export interface FuncionCompleta {
  funcion: FuncionVista;
  obra: ObraVista;
  sede: SedeVista;
}

export interface FiltroObras {
  q?: string;
  origen?: 'invitado' | 'convocatoria';
  incluirDesistidas: boolean;
}

/** La base rechazó la escritura por la restricción EXCLUDE (carrera entre dos programadores). */
export class CruceEnBaseDeDatos extends Error {
  constructor() {
    super('La agenda cambió mientras se guardaba: hay un cruce');
  }
}

/**
 * PostgreSQL abortó la transacción por un interbloqueo (40P01): dos inserciones simultáneas que
 * chocan en una restricción EXCLUDE pueden esperarse mutuamente. Se reintenta el guardado completo.
 */
export class InterbloqueoEnBaseDeDatos extends Error {
  constructor() {
    super('Interbloqueo al guardar: se reintenta');
  }
}

export interface RepositorioOperacion {
  /** Transacción ambiente: repositorio, auditoría y publicador escriben juntos (ADR-0003). */
  enTransaccion<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Bloqueo consultivo de transacción sobre cada clave (p. ej. `sede:<id>`), tomado en orden fijo:
   * ordena los guardados que compiten por la misma sede o elenco y evita interbloqueos (ADR-0010).
   */
  bloquearAgenda(claves: string[]): Promise<void>;
  edicion(id: string): Promise<EdicionVista | null>;
  /** De la más reciente a la más antigua. */
  ediciones(): Promise<EdicionDetalle[]>;
  edicionDetalle(id: string): Promise<EdicionDetalle | null>;
  /** Pasa la edición a `publicada` (no cambia una edición cerrada). */
  marcarEdicionPublicada(id: string): Promise<void>;
  /** Funciones de la edición con su obra y sede, filtradas por estado o por ids. */
  funcionesCompletas(edicionId: string, filtro: { estados?: EstadoFuncionGuardado[]; ids?: string[] }): Promise<FuncionCompleta[]>;
  /** Funciones publicadas y activas de la edición (programadas o reprogramadas), para los cruces. */
  agendaPublicada(edicionId: string): Promise<FuncionAgenda[]>;
  /** borrador → programada con versión nueva; null si la versión o el estado no coinciden. */
  marcarFuncionPublicada(id: string, versionEsperada: number, versionNueva: number, publicadaEn: Date): Promise<FuncionVista | null>;
  sede(id: string): Promise<SedeVista | null>;
  sedesDeEdicion(edicionId: string, soloActivas: boolean): Promise<SedeVista[]>;
  obra(id: string): Promise<ObraVista | null>;
  buscarObras(edicionId: string, filtro: FiltroObras): Promise<ObraVista[]>;
  crearObra(edicionId: string, datos: DatosObra, elenco: Omit<ElencoVista, 'id'> & { id?: string }, origen: 'invitado' | 'convocatoria', postulacionId?: string, obraId?: string): Promise<ObraVista>;
  /** null si la versión no coincide (412). */
  actualizarObra(id: string, versionEsperada: number, datos: DatosObra): Promise<ObraVista | null>;
  funcion(id: string): Promise<FuncionVista | null>;
  funcionesDeObra(obraId: string): Promise<FuncionVista[]>;
  /** Funciones activas de la misma sede o del mismo elenco que tocan [desde, hasta) — candidatas a cruce. */
  agendaVecina(filtro: { sedeId: string; elencoId: string; desde: Date; hasta: Date }): Promise<FuncionAgenda[]>;
  /** Funciones de la edición que tocan [desde, hasta) (grilla de un día). */
  funcionesEntre(edicionId: string, desde: Date, hasta: Date): Promise<FuncionVista[]>;
  /** Lanza CruceEnBaseDeDatos si la restricción EXCLUDE la rechaza. */
  crearFuncion(id: string, edicionId: string, datos: DatosFuncion, bloques: Bloque[], creadaPor: string): Promise<FuncionVista>;
  /** null si la versión no coincide (412). Lanza CruceEnBaseDeDatos. */
  actualizarFuncion(id: string, versionEsperada: number, datos: DatosFuncion, bloques: Bloque[]): Promise<FuncionVista | null>;
  /** false si la versión no coincide. */
  eliminarFuncion(id: string, versionEsperada: number): Promise<boolean>;
}

/** Un consumidor de eventos de otro módulo; el procesamiento es idempotente por `evento.id`. */
export interface ManejadorEvento<E extends { id: string; tipo: string } = { id: string; tipo: string; correlacionId: string }> {
  /** Tipo de evento y módulo dueño (para el nombre de cola `operacion.<tipo>`). */
  readonly tipo: string;
  readonly esquema: z.ZodType<E>;
  manejar(evento: E): Promise<void>;
}
