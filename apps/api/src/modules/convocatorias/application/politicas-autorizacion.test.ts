import { describe, expect, it } from 'vitest';
import type { ContextoConvocatorias } from './puertos';
import { puedeCoordinarProvincia, puedeGestionarAsignacion } from './politicas-autorizacion';

const contexto = (rol: ContextoConvocatorias['roles'][number]['rol'], provincia?: string): ContextoConvocatorias => ({
  cuentaId: 'cuenta-1', correoVerificado: true,
  roles: [{ rol, ...(provincia ? { alcance: { provincia } } : {}) }],
});

describe('políticas anticorrupción de autorización', () => {
  it('limita la coordinación provincial a su provincia y reserva acciones globales a coordinación', () => {
    expect(puedeCoordinarProvincia(contexto('coordinación de convocatorias'), 'Loja')).toBe(true);
    expect(puedeCoordinarProvincia(contexto('coordinación provincial', 'Loja'), 'Loja')).toBe(true);
    expect(puedeCoordinarProvincia(contexto('coordinación provincial', 'Pichincha'), 'Loja')).toBe(false);
    expect(puedeCoordinarProvincia(contexto('postulante'), 'Loja')).toBe(false);
  });
  it('restringe al curador a asignaciones cuyo propietario es la cuenta autenticada', () => {
    expect(puedeGestionarAsignacion(contexto('curador'), 'cuenta-1')).toBe(true);
    expect(puedeGestionarAsignacion(contexto('curador'), 'cuenta-2')).toBe(false);
  });
});
