import type { AlcanceRol, EventoPublicadoIdentidad, RolPersonal } from '@fiavl/contracts';
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

/** Lo necesario para iniciar sesión; el hash nunca sale del caso de uso de sesión. */
export interface CuentaAcceso extends CuentaVista {
  bloqueadaHasta: Date | null;
  esPersonal: boolean;
  hashContrasena: string | null;
}

export interface RolVista {
  rol: RolPersonal;
  alcance: AlcanceRol | null;
}

export interface SesionVista {
  id: string;
  cuentaId: string;
  dispositivo: string;
  segundoFactorOk: boolean;
  creadaEn: Date;
  ultimaActividadEn: Date;
  expiraEn: Date;
  revocadaEn: Date | null;
}

/** Sesión con la cuenta y sus roles leídos en ese momento (ADR-0009: estado al día). */
export interface SesionConCuenta extends SesionVista {
  cuenta: CuentaVista & { esPersonal: boolean; preferencias: { novedades: boolean } };
  roles: RolVista[];
  estudianteAcreditado: boolean;
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

  // Sesiones (US8, research R12) ------------------------------------------------------------
  cuentaAcceso(correo: string): Promise<CuentaAcceso | null>;
  registrarIntento(correo: string, exito: boolean, ahora: Date): Promise<void>;
  /** Fallos del correo desde `desde` y posteriores al último acierto. */
  contarFallos(correo: string, desde: Date): Promise<number>;
  bloquear(cuentaId: string, hasta: Date): Promise<void>;
  actualizarContrasena(cuentaId: string, hash: string): Promise<void>;
  crearSesion(s: { id: string; cuentaId: string; hash: Buffer; dispositivo: string; segundoFactorOk: boolean; expiraEn: Date; ahora: Date }): Promise<void>;
  sesionPorHash(hash: Buffer, ahora: Date): Promise<SesionConCuenta | null>;
  renovarSesion(id: string, ahora: Date, expiraEn: Date): Promise<void>;
  /** Solo si es de `cuentaId`; false si no existe, es de otra cuenta o ya estaba revocada. */
  revocarSesion(id: string, cuentaId: string, ahora: Date): Promise<boolean>;
  revocarSesionesDe(cuentaId: string, ahora: Date, excepto?: string): Promise<number>;
  sesionesActivas(cuentaId: string, ahora: Date): Promise<SesionVista[]>;
  versionAceptada(cuentaId: string, documento: DocumentoLegalTipo): Promise<number | null>;
  actualizarNombre(cuentaId: string, nombre: string): Promise<void>;
  /** FR-022: la preferencia de novedades se guarda como consentimiento (aceptado o retirado). */
  cambiarNovedades(cuentaId: string, acepta: boolean, version: number, ahora: Date): Promise<void>;
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
