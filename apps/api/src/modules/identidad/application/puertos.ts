import type { EventoPublicadoIdentidad } from '@fiavl/contracts';
import type { z } from 'zod';

/** Puertos del módulo Identidad (spec 004, Parte B). El dominio no conoce Prisma, SMTP ni pg-boss. */

export const RELOJ_IDENTIDAD = Symbol('RELOJ_IDENTIDAD');
export const PUBLICADOR_IDENTIDAD = Symbol('PUBLICADOR_IDENTIDAD');
export const AUDITORIA_IDENTIDAD = Symbol('AUDITORIA_IDENTIDAD');
export const PROVEEDOR_CORREO = Symbol('PROVEEDOR_CORREO');
export const CIFRADOR = Symbol('CIFRADOR');
export const MANEJADORES_IDENTIDAD = Symbol('MANEJADORES_IDENTIDAD');

export type RelojIdentidad = () => Date;

export interface PublicadorIdentidad {
  publicar(evento: EventoPublicadoIdentidad): Promise<void>;
}

export interface CorreoSaliente {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

/** Proveedor de correo intercambiable (ADR-0011): SMTP con nodemailer, memoria en pruebas. */
export interface ProveedorCorreo {
  enviar(correo: CorreoSaliente): Promise<void>;
}

/** Cifrado simétrico autenticado de secretos TOTP (research R13). */
export interface Cifrador {
  cifrar(claro: Buffer): Buffer;
  descifrar(cifrado: Buffer): Buffer;
}

export const REPOSITORIO_IDENTIDAD = Symbol('REPOSITORIO_IDENTIDAD');
export const LISTA_FILTRADAS = Symbol('LISTA_FILTRADAS');

/** RN-008: ¿la contraseña (en minúsculas) está en la lista local de filtradas? */
export type ListaFiltradas = (contrasenaMinusculas: string) => boolean;

export type EstadoCuenta = 'pendiente_verificacion' | 'verificada' | 'desactivada' | 'eliminada';
export type DocumentoLegalTipo = 'politica_privacidad' | 'novedades';

export interface CuentaVista {
  id: string;
  nombre: string;
  correo: string;
  estado: EstadoCuenta;
  verificadaEn: Date | null;
}

export interface TokenVista {
  id: string;
  cuentaId: string;
  tipo: 'verificacion' | 'recuperacion' | 'estudiante';
  expiraEn: Date;
  usadoEn: Date | null;
}

export interface DocumentoLegal {
  documento: DocumentoLegalTipo;
  version: number;
  url: string;
  vigenteDesde: Date;
}

export interface RepositorioIdentidad {
  enTransaccion<T>(fn: () => Promise<T>): Promise<T>;
  cuenta(id: string): Promise<CuentaVista | null>;
  /** Por correo normalizado. */
  cuentaPorCorreo(correo: string): Promise<CuentaVista | null>;
  crearCuenta(c: { id: string; nombre: string; correo: string; hashContrasena: string; consentimientos: { documento: DocumentoLegalTipo; version: number }[] }): Promise<void>;
  marcarVerificada(cuentaId: string, ahora: Date): Promise<boolean>;
  crearToken(t: { cuentaId: string; tipo: TokenVista['tipo']; hash: Buffer; expiraEn: Date; dato?: unknown }): Promise<void>;
  contarTokens(cuentaId: string, tipo: TokenVista['tipo'], desde: Date): Promise<number>;
  tokenPorHash(hash: Buffer): Promise<TokenVista | null>;
  /** Marca el token como usado; false si ya lo estaba (un solo uso, también bajo concurrencia). */
  usarToken(id: string, ahora: Date): Promise<boolean>;
  documentoVigente(documento: DocumentoLegalTipo, ahora: Date): Promise<DocumentoLegal | null>;
  /** Edición vigente para el sobre de los eventos de Identidad (research: `edicionId` del sobre). */
  edicionVigente(): Promise<string | null>;
  guardarEdicionVigente(edicionId: string, fechaFin: string): Promise<void>;
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

/** Bitácora inmutable (FR-024). */
export interface AuditoriaIdentidad {
  registrar(entrada: EntradaAuditoria): Promise<void>;
}

export interface ManejadorEvento<E extends { id: string; tipo: string } = { id: string; tipo: string; correlacionId: string }> {
  readonly tipo: string;
  readonly esquema: z.ZodType<E>;
  manejar(evento: E): Promise<void>;
}
