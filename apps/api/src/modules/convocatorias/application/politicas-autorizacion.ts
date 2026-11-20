import type { ContextoConvocatorias } from './puertos';

export function puedeCoordinarProvincia(contexto: ContextoConvocatorias, provinciaRecurso: string): boolean {
  return contexto.roles.some(({ rol, alcance }) =>
    rol === 'coordinación de convocatorias' || (rol === 'coordinación provincial' && alcance?.provincia === provinciaRecurso),
  );
}

export function puedeGestionarAsignacion(contexto: ContextoConvocatorias, cuentaCuradorAsignada: string): boolean {
  return contexto.roles.some(({ rol }) => rol === 'curador') && contexto.cuentaId === cuentaCuradorAsignada;
}
