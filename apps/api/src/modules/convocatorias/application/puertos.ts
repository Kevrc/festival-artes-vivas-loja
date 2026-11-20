import type { EventoPublicadoConvocatorias } from '@fiavl/contracts';

export const ROLES_IDENTIDAD = [
  'asistente', 'postulante', 'curador', 'coordinación de convocatorias', 'coordinación provincial',
  'programador', 'jefe de sala', 'taquilla', 'validador', 'dirección', 'administrador',
] as const;
export type RolIdentidad = (typeof ROLES_IDENTIDAD)[number];
export interface ContextoConvocatorias {
  cuentaId: string;
  correoVerificado: boolean;
  correo?: string;
  roles: Array<{ rol: RolIdentidad; alcance?: { provincia?: string; disciplina?: string; sedeId?: string } }>;
}

export const REPOSITORIO_CONVOCATORIAS = Symbol('REPOSITORIO_CONVOCATORIAS');
export const ALMACENAMIENTO_DOCUMENTOS = Symbol('ALMACENAMIENTO_DOCUMENTOS');
export const ESCANER_ANTIVIRUS = Symbol('ESCANER_ANTIVIRUS');
export const AUTORIZACION_CONVOCATORIAS = Symbol('AUTORIZACION_CONVOCATORIAS');
export const RELOJ_CONVOCATORIAS = Symbol('RELOJ_CONVOCATORIAS');
export const PUBLICADOR_CONVOCATORIAS = Symbol('PUBLICADOR_CONVOCATORIAS');

export interface AlmacenamientoDocumentosPort {
  guardar(objectKey: string, contenido: Buffer): Promise<void>;
  leer(objectKey: string): Promise<Buffer>;
  eliminar(objectKey: string): Promise<void>;
  crearUrlDescarga(objectKey: string, venceEn: Date): Promise<string>;
}

export interface EscanerAntivirusPort {
  escanear(contenido: Buffer): Promise<{ limpio: boolean; motivo?: string }>;
}

export interface AutorizacionConvocatoriasPort {
  resolverDesdePeticion(req: { headers: Record<string, string | string[] | undefined> }): Promise<ContextoConvocatorias | null>;
}

export interface RepositorioConvocatoriasPort {
  ejecutar<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
  obtenerPostulacion(id: string): Promise<{ id: string; cuentaPropietariaId: string } | null>;
}

export type RelojConvocatorias = () => Date;
export interface PublicadorConvocatoriasPort {
  publicar(evento: EventoPublicadoConvocatorias, opciones?: { singletonKey?: string }): Promise<void>;
}
