import type { RequisitosPostulacion } from './reglas-borrador';

export type DatosElenco = RequisitosPostulacion['elenco'];
export type DatosObra = RequisitosPostulacion['obra'];
export interface DatosPostulacion { convocatoriaId: string; elenco: DatosElenco; obra: DatosObra }

export interface ElencoPostulacion extends DatosElenco { id: string; cuentaId: string }
export interface ConvocatoriaPostulacion {
  id: string; edicionId: string; codigo: string; componente: string; provincia: string | null;
  abreEn: Date; cierraEn: Date; estado: string; maxObrasPorElenco: number;
  criterios?: Array<{ id: string; nombre: string; descripcion: string; peso: number }>;
  requisitos?: string[];
}
export interface DocumentoPostulacion { id: string; tipo: string; nombreOriginal: string; objectKey: string; mimeType: string; bytes: number }
export interface PostulacionRegistro {
  id: string; convocatoriaId: string; elencoId: string; numero: string; obraFingerprint: string;
  tituloObra: string; disciplina: string; sinopsis: string; duracionMin: number; publico: string;
  fichaTecnica: unknown; videoUrl: string | null; estado: string; enviadaEn: Date | null;
  primeraEnviadaEn: Date | null; subsanarHasta: Date | null; convocatoria: ConvocatoriaPostulacion; elenco: ElencoPostulacion;
  documentos: DocumentoPostulacion[];
}
export interface PostulacionConAsignaciones extends PostulacionRegistro {
  asignaciones: Array<{ curador: { cuentaId: string } }>;
}
export interface ConvocatoriaPublica extends Omit<ConvocatoriaPostulacion, 'edicionId' | 'estado'> {
  criterios: Array<{ id: string; nombre: string; descripcion: string; peso: number }>;
  requisitos: string[];
}

export interface PostulacionesRepositorioPort {
  listarAbiertas(ahora: Date): Promise<ConvocatoriaPublica[]>;
  obtenerConvocatoria(id: string): Promise<ConvocatoriaPostulacion | null>;
  crearBorrador(cuentaId: string, datos: DatosPostulacion): Promise<PostulacionRegistro>;
  obtenerPostulacion(id: string): Promise<PostulacionRegistro | null>;
  editarBorrador(id: string, cuentaId: string, datos: Omit<DatosPostulacion, 'convocatoriaId'>, ahora: Date): Promise<PostulacionRegistro>;
  enviar(id: string, cuentaId: string, ahora: Date): Promise<PostulacionRegistro>;
  retirar(id: string, cuentaId: string, ahora: Date): Promise<PostulacionRegistro>;
  obtenerDocumento(id: string): Promise<{ objectKey: string; mimeType: string; nombreOriginal: string; postulacion: Pick<PostulacionConAsignaciones, 'elenco' | 'asignaciones'> } | null>;
  obtenerDocumentoPorKey(objectKey: string): Promise<DocumentoPostulacion | null>;
  listarDocumentos(postulacionId: string): Promise<Array<{ tipo: string }>>;
  registrarDocumento(input: { id: string; postulacionId: string; tipo: string; nombreOriginal: string; objectKey: string; mimeType: string; bytes: number; sha256: string }): Promise<void>;
}
