import type { NivelDisponibilidad, TipoAcceso } from '../domain/tipos';

/** Formas de respuesta del OpenAPI (contracts/api-cartelera.openapi.yaml). */
export interface SedeResumen {
  id: string;
  nombre: string;
  tipo: string;
  coordenadas: { lat: number; lng: number };
}
export interface ObraResumen {
  id: string;
  titulo: string;
  disciplina: string;
  componente: string;
  edadMinima: number;
  imagen?: string;
  elenco: { id: string; nombre: string; pais: string };
}
export interface FuncionResumen {
  id: string;
  inicio: string;
  fin: string;
  continua: boolean;
  tipoAcceso: TipoAcceso;
  publico: string;
  estado: string;
  horarioAnterior?: { inicio: string; fin: string; sedeId: string };
  obra: ObraResumen;
  sede: SedeResumen;
}
export interface Edicion {
  id: string;
  anio: number;
  numero: string;
  fechaInicio: string;
  fechaFin: string;
  paisInvitado?: string;
}
export interface Disponibilidad {
  funcionId: string;
  nivel: NivelDisponibilidad;
  actualizadaEn?: string;
}
