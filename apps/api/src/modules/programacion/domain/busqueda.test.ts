import { describe, expect, it } from 'vitest';
import { normalizarBusqueda } from './busqueda';

describe('normalizarBusqueda (research R2)', () => {
  it('quita tildes y mayúsculas', () => expect(normalizarBusqueda('ZOMBÍ Manifiesto')).toBe('zombi manifiesto'));
  it('conserva la ñ como n y compacta espacios', () => expect(normalizarBusqueda('  Niño   Año ')).toBe('nino ano'));
});
