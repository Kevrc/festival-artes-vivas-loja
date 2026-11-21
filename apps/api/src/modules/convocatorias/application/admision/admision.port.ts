import type { DecisionAdmisibilidad } from '../../domain/admisibilidad';
import type { EstadoPostulacion } from '../../domain/estados';

export interface PostulacionAdmision {
  id: string;
  convocatoriaId: string;
  elencoId: string;
  numero: string;
  obraFingerprint: string;
  estado: EstadoPostulacion;
  subsanarHasta: Date | null;
  convocatoria: {
    id: string;
    edicionId: string;
    codigo: string;
    componente: string;
    provincia: string | null;
  };
  elenco: { cuentaId: string };
}

export interface ResolverAdmisibilidadInput {
  postulacionId: string;
  actorCuentaId?: string | null;
  decision: DecisionAdmisibilidad;
  motivo?: string | null;
  detalle?: string | null;
  ahora: Date;
}

export interface ReenviarSubsanacionInput {
  postulacionId: string;
  cuentaId: string;
  ahora: Date;
}

export interface ReenvioSubsanacion {
  postulacion: PostulacionAdmision;
  vencida: boolean;
}

export interface ListarAdmisionInput {
  estados?: EstadoPostulacion[];
  provincia?: string;
}

export interface PostulacionAdmisionResumen {
  id: string;
  numero: string;
  estado: EstadoPostulacion;
  tituloObra: string;
  disciplina: string;
  enviadaEn: Date | null;
  subsanarHasta: Date | null;
  convocatoria: { id: string; codigo: string; componente: string; provincia: string | null };
  elenco: { nombre: string; responsable: string; provinciaPais: string };
  documentos: Array<{ id: string; tipo: string; nombreOriginal: string; bytes: number }>;
}

export interface AdmisionRepositorioPort {
  resolverAdmisibilidad(input: ResolverAdmisibilidadInput): Promise<PostulacionAdmision>;
  reenviarSubsanacion(input: ReenviarSubsanacionInput): Promise<ReenvioSubsanacion>;
  expirarSubsanacionesVencidas(ahora: Date): Promise<number>;
  existeObraEnHistorialCamino(obraFingerprint: string): Promise<boolean>;
  listarParaAdmision(input: ListarAdmisionInput): Promise<PostulacionAdmisionResumen[]>;
}
