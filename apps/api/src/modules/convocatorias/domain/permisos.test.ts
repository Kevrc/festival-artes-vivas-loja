import { describe, expect, it } from 'vitest';
import { puedeDescargarDocumento } from './permisos';

describe('permisos de documentos', () => {
  const data = { postulanteCuentaId: 'owner', actorCuentaId: 'owner', rol: 'postulante' as const, curadorAsignado: false };
  it('permite dueño, coordinación y curador asignado; deniega terceros', () => {
    expect(puedeDescargarDocumento(data)).toBe(true);
    expect(puedeDescargarDocumento({ ...data, actorCuentaId: 'coord', rol: 'coordinación de convocatorias' })).toBe(true);
    expect(puedeDescargarDocumento({ ...data, actorCuentaId: 'curator', rol: 'curador', curadorAsignado: true })).toBe(true);
    expect(puedeDescargarDocumento({ ...data, actorCuentaId: 'other' })).toBe(false);
    expect(puedeDescargarDocumento({ ...data, actorCuentaId: 'curator', rol: 'curador' })).toBe(false);
  });
});
