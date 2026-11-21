import type { EventoPublicadoOperacion } from '@fiavl/contracts';
import type { z } from 'zod';

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

/** Un consumidor de eventos de otro módulo; el procesamiento es idempotente por `evento.id`. */
export interface ManejadorEvento<E extends { id: string; tipo: string } = { id: string; tipo: string; correlacionId: string }> {
  /** Tipo de evento y módulo dueño (para el nombre de cola `operacion.<tipo>`). */
  readonly tipo: string;
  readonly esquema: z.ZodType<E>;
  manejar(evento: E): Promise<void>;
}
