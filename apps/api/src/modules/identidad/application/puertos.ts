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
