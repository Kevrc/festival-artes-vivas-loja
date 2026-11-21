import type { EstadoEvaluacion, EstadoPostulacion, EstadoAsignacion } from '../../domain/estados';

export interface CalificacionInput { criterioId: string; puntaje: number }
export interface EvaluacionInput { calificaciones: CalificacionInput[]; observaciones?: string | null }

/** Puntajes siempre como texto con dos decimales ("79.00"); nunca como número flotante. */
export interface AsignacionResumen {
  asignacionId: string;
  estado: EstadoAsignacion;
  bloqueada: boolean;
  motivoBloqueo: string | null;
  postulacion: { id: string; numero: string; tituloObra: string; disciplina: string; estado: EstadoPostulacion };
  evaluacion: { estado: EstadoEvaluacion; puntaje: string | null } | null;
}

export interface EvaluacionPropia {
  id: string;
  estado: EstadoEvaluacion;
  puntaje: string | null;
  observaciones: string | null;
  calificaciones: CalificacionInput[];
}

export interface DetalleAsignacion {
  asignacionId: string;
  estado: EstadoAsignacion;
  bloqueada: boolean;
  motivoBloqueo: string | null;
  postulacion: {
    id: string; numero: string; tituloObra: string; disciplina: string; estado: EstadoPostulacion; sinopsis: string;
    duracionMin: number; publico: string; videoUrl: string | null;
    elenco: { nombre: string; trayectoria: string };
    documentos: Array<{ id: string; tipo: string; nombreOriginal: string; bytes: number }>;
  };
  criterios: Array<{ id: string; nombre: string; descripcion: string; peso: number }>;
  evaluacion: EvaluacionPropia | null;
  /** Solo se informa después de enviar la evaluación propia; antes es `null` (FR-009). Sin identificar al curador. */
  otrasEvaluaciones: Array<{ puntaje: string }> | null;
}

export interface ResultadoEnvio {
  evaluacion: { id: string; estado: EstadoEvaluacion; puntaje: string };
  postulacion: { id: string; estado: EstadoPostulacion; puntajeFinal: string | null };
}

export interface ResumenEvaluacionPostulacion {
  postulacionId: string;
  numero: string;
  tituloObra: string;
  estado: EstadoPostulacion;
  provincia: string | null;
  puntajeFinal: string | null;
  deliberacion: boolean;
  pendientes: number;
  evaluaciones: Array<{ evaluacionId: string | null; asignacionId: string; curadorCuentaId: string; estado: EstadoEvaluacion | 'sin_iniciar'; puntaje: string | null }>;
}

export interface ResultadoReapertura {
  evaluacion: { id: string; estado: EstadoEvaluacion };
  postulacion: { id: string; estado: EstadoPostulacion; puntajeFinal: string | null };
}

export interface EvaluacionesRepositorioPort {
  listarAsignaciones(cuentaId: string): Promise<AsignacionResumen[]>;
  obtenerAsignacion(cuentaId: string, asignacionId: string): Promise<DetalleAsignacion>;
  guardarEvaluacion(cuentaId: string, asignacionId: string, input: EvaluacionInput): Promise<EvaluacionPropia>;
  enviarEvaluacion(cuentaId: string, asignacionId: string, ahora: Date): Promise<ResultadoEnvio>;
  reabrirEvaluacion(input: {
    evaluacionId: string; actorCuentaId: string; motivo: string; ahora: Date; provinciaPermitida: (provincia: string | null) => boolean;
  }): Promise<ResultadoReapertura>;
  listarEvaluacionesPanel(): Promise<ResumenEvaluacionPostulacion[]>;
  obtenerAgregado(postulacionId: string): Promise<ResumenEvaluacionPostulacion | null>;
}
