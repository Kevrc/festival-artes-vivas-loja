import type { RolPersonal } from '../eventos/identidad';

/**
 * Contrato IdentidadPublica (spec 004, contracts/identidad-publica.md, FR-020).
 * Los módulos dependen de este contrato, nunca del código de `modules/identidad`.
 */
export const IDENTIDAD_PUBLICA = Symbol.for('fiavl.IdentidadPublica');

/** Nombre de la cookie de sesión (ADR-0009). */
export const COOKIE_SESION = 'fiavl_sesion';

export type { RolPersonal };

export interface AlcanceRol {
  tipo: 'sede' | 'provincia' | 'disciplina';
  /** Id de sede, código de provincia o disciplina. */
  valor: string;
}

export interface RolConAlcance {
  rol: RolPersonal;
  alcance: AlcanceRol | null;
}

export interface ContextoIdentidad {
  cuentaId: string;
  sesionId: string;
  correo: string;
  /** FR-015. */
  correoVerificado: boolean;
  /** US12: acreditación vigente a la fecha. */
  estudianteAcreditado: boolean;
  /** Personal: false ⇒ solo puede configurar o verificar el segundo factor. */
  segundoFactorOk: boolean;
  /** US11-AS4: hay una versión nueva de la política sin aceptar ⇒ solo puede aceptarla (o ver o borrar sus datos). */
  politicaPendiente?: boolean;
  roles: RolConAlcance[];
}

export interface PeticionConCabeceras {
  headers: Record<string, string | string[] | undefined>;
}

export interface IdentidadPublica {
  /**
   * Lee la cookie `fiavl_sesion`. Devuelve null si no hay sesión válida, está vencida o revocada,
   * o la cuenta no está activa. Falla cerrado: cualquier error interno ⇒ null.
   */
  resolverSesion(req: PeticionConCabeceras): Promise<ContextoIdentidad | null>;
}

/** ¿El contexto tiene `rol`, y si se pide un alcance, ese alcance exacto? (RN-009) */
export function tieneRol(ctx: ContextoIdentidad, rol: RolPersonal, alcance?: AlcanceRol): boolean {
  return ctx.roles.some(
    (r) =>
      r.rol === rol &&
      (!alcance || (r.alcance !== null && r.alcance.tipo === alcance.tipo && r.alcance.valor === alcance.valor)),
  );
}
