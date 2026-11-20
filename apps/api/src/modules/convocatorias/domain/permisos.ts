export type RolDocumento = 'postulante' | 'coordinación de convocatorias' | 'coordinación provincial' | 'curador' | string;

export function puedeDescargarDocumento(input: {
  postulanteCuentaId: string; actorCuentaId: string; rol: RolDocumento; curadorAsignado: boolean;
}): boolean {
  if (input.rol === 'postulante') return input.actorCuentaId === input.postulanteCuentaId;
  if (input.rol === 'coordinación de convocatorias' || input.rol === 'coordinación provincial') return true;
  return input.rol === 'curador' && input.curadorAsignado;
}
