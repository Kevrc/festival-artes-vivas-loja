import type { EdicionDto, ElencoDto, FuncionDto, ObraDto, SedeDto } from '@fiavl/contracts';
import type { z } from 'zod';
import type { NivelGuardado, TipoAcceso } from '../domain/tipos';

export const REPOSITORIO_CARTELERA = Symbol('RepositorioCartelera');
export const LECTURA_CARTELERA = Symbol('LecturaCartelera');
export const REVALIDADOR = Symbol('Revalidador');
export const RELOJ = Symbol('Reloj');

export type Reloj = () => Date;

export interface Horario {
  inicio: string;
  fin: string;
  sedeId: string;
}

export interface FuncionGuardada {
  versionOrigen: number;
  diaFestival: string;
  diaFin: string;
  continua: boolean;
  obraId: string;
  sedeId: string;
  elencoId: string;
  tipoAcceso: TipoAcceso;
  disponibilidadActualizadaEn: Date | null;
}

/** Escrituras de la proyección dentro de una transacción. */
export interface EscrituraProyeccion {
  asegurarEdicion(edicionId: string, diaReferencia: string): Promise<void>;
  publicarEdicion(edicion: z.infer<typeof EdicionDto>): Promise<void>;
  funcion(id: string): Promise<FuncionGuardada | null>;
  guardarFuncion(
    edicionId: string,
    datos: {
      funcion: z.infer<typeof FuncionDto>;
      obra: z.infer<typeof ObraDto>;
      elenco: z.infer<typeof ElencoDto>;
      sede: z.infer<typeof SedeDto>;
    },
    dias: { diaFestival: string; diaFin: string; nivel: NivelGuardado },
  ): Promise<void>;
  guardarSede(sede: z.infer<typeof SedeDto>): Promise<void>;
  reprogramar(
    id: string,
    version: number,
    anterior: Horario,
    nuevo: Horario,
    dias: { diaFestival: string; diaFin: string },
  ): Promise<void>;
  cancelar(id: string, version: number): Promise<void>;
  guardarDisponibilidad(
    id: string,
    d: { lugaresRestantes: number; aforoHabilitado: number; nivel: NivelGuardado; calculadoEn: Date },
  ): Promise<void>;
}

export interface RepositorioCartelera {
  /**
   * Ejecuta `trabajo` una sola vez por evento (idempotencia, ADR-0003) en una transacción.
   * Devuelve null si el evento ya se había procesado.
   */
  procesarUnaVez<T>(eventoId: string, tipo: string, trabajo: (w: EscrituraProyeccion) => Promise<T>): Promise<T | null>;
}

export interface Revalidador {
  revalidar(etiquetas: string[]): Promise<void>;
}
