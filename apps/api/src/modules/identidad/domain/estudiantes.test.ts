import { describe, expect, it } from 'vitest';
import { dominioDeCorreo, finDelDiaEnLoja, normalizarDominio } from './estudiantes';

describe('estudiantes', () => {
  it('RN-012: la acreditación vence al terminar el último día en hora de Loja', () => {
    expect(finDelDiaEnLoja('2026-11-22').toISOString()).toBe('2026-11-23T04:59:59.999Z');
  });

  it('extrae y normaliza dominios', () => {
    expect(dominioDeCorreo(' Ana@Estudiantes.UTPL.edu.ec ')).toBe('estudiantes.utpl.edu.ec');
    expect(dominioDeCorreo('sin-arroba')).toBeNull();
    expect(dominioDeCorreo('a@localhost')).toBeNull();
    expect(normalizarDominio('@UNL.edu.ec')).toBe('unl.edu.ec');
    expect(normalizarDominio('no es dominio')).toBeNull();
    expect(normalizarDominio('edu')).toBeNull();
  });
});
