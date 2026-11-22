import type { RolAsignado } from './api';

/** Roles de FR-019 con su nombre para personas y el alcance que exige cada uno (research R16). */
export const ROLES_PERSONAL = [
  { rol: 'programador', nombre: 'Programación', alcance: null },
  { rol: 'direccion', nombre: 'Dirección', alcance: null },
  { rol: 'administrador', nombre: 'Administración', alcance: null },
  { rol: 'jefe_sala', nombre: 'Jefatura de sala', alcance: 'sede' },
  { rol: 'taquilla', nombre: 'Taquilla', alcance: 'sede' },
  { rol: 'validador', nombre: 'Validación de entradas', alcance: 'sede' },
  { rol: 'curador', nombre: 'Curaduría', alcance: 'disciplina' },
  { rol: 'coordinacion_convocatorias', nombre: 'Coordinación de convocatorias', alcance: null },
  { rol: 'coordinacion_provincial', nombre: 'Coordinación provincial (Camino a Loja)', alcance: 'provincia' },
] as const;

export type TipoAlcance = 'sede' | 'provincia' | 'disciplina';

export const DISCIPLINAS = ['teatro', 'danza', 'circo', 'musica', 'titeres', 'exposicion', 'taller', 'calle', 'cine'] as const;

export function alcanceDeRol(rol: string): TipoAlcance | null {
  return ROLES_PERSONAL.find((r) => r.rol === rol)?.alcance ?? null;
}

export function nombreDeRol(rol: string): string {
  return ROLES_PERSONAL.find((r) => r.rol === rol)?.nombre ?? rol;
}

/** "Validación de entradas · Teatro Bolívar": el alcance de sede se muestra con el nombre de la sede. */
export function describirRol(r: RolAsignado, nombresSede: ReadonlyMap<string, string> = new Map()): string {
  if (!r.alcance) return nombreDeRol(r.rol);
  const valor = r.alcance.tipo === 'sede' ? (nombresSede.get(r.alcance.valor) ?? 'sede desconocida') : r.alcance.valor;
  return `${nombreDeRol(r.rol)} · ${valor}`;
}

/** Arma el rol del formulario; null si falta el alcance que el rol exige. */
export function armarRol(rol: string, valorAlcance: string): RolAsignado | null {
  const tipo = alcanceDeRol(rol);
  if (!tipo) return { rol, alcance: null };
  const valor = valorAlcance.trim();
  return valor ? { rol, alcance: { tipo, valor } } : null;
}

export const mismoRol = (a: RolAsignado, b: RolAsignado) => a.rol === b.rol && (a.alcance?.valor ?? '') === (b.alcance?.valor ?? '');
