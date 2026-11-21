import type { AlcanceRol, RolPersonal } from '@fiavl/contracts';

/** Tipo de alcance que exige cada rol (research R16); null = rol global, sin alcance. */
export const ALCANCE_REQUERIDO: Readonly<Record<RolPersonal, AlcanceRol['tipo'] | null>> = {
  asistente: null,
  postulante: null,
  curador: 'disciplina',
  coordinacion_convocatorias: null,
  coordinacion_provincial: 'provincia',
  programador: null,
  jefe_sala: 'sede',
  taquilla: 'sede',
  validador: 'sede',
  direccion: null,
  administrador: null,
};

export type ResultadoAsignacion =
  | { ok: true }
  | { ok: false; codigo: 'alcance_requerido' | 'alcance_invalido' | 'alcance_no_aplica' };

/** Caso borde de la spec: un rol que exige alcance no se guarda sin él (taquilla sin sede). */
export function validarAsignacion(rol: RolPersonal, alcance: AlcanceRol | null): ResultadoAsignacion {
  const requerido = ALCANCE_REQUERIDO[rol];
  if (requerido === null) return alcance === null ? { ok: true } : { ok: false, codigo: 'alcance_no_aplica' };
  if (alcance === null) return { ok: false, codigo: 'alcance_requerido' };
  if (alcance.tipo !== requerido || alcance.valor.trim() === '') return { ok: false, codigo: 'alcance_invalido' };
  return { ok: true };
}

const ROLES_PUBLICO: readonly RolPersonal[] = ['asistente', 'postulante'];

export const esRolDePersonal = (rol: RolPersonal): boolean => !ROLES_PUBLICO.includes(rol);

/** `cuenta.es_personal`: fija la sesión de 8 h y exige segundo factor (FR-018). */
export const esPersonal = (roles: readonly RolPersonal[]): boolean => roles.some(esRolDePersonal);
