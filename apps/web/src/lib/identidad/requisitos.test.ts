import { describe, expect, it } from 'vitest';
import { requisitosContrasena } from './requisitos';

describe('requisitos de contraseña visibles (US7-AS4)', () => {
  it('marca la longitud mínima por caracteres, no por bytes', () => {
    expect(requisitosContrasena('corta', 'ana@fiavl.test')[0]).toEqual({ texto: 'Al menos 10 caracteres', cumple: false });
    expect(requisitosContrasena('ñandúñandú', 'ana@fiavl.test')[0]!.cumple).toBe(true);
  });

  it('avisa si la contraseña contiene el usuario del correo', () => {
    expect(requisitosContrasena('anatorres-2026', 'anatorres@fiavl.test')[2]!.cumple).toBe(false);
    expect(requisitosContrasena('Teatro-en-Loja-2026', 'anatorres@fiavl.test')[2]!.cumple).toBe(true);
    expect(requisitosContrasena('', 'ana@fiavl.test')[2]!.cumple).toBe(false);
  });

  it('marca el máximo de 128', () => {
    expect(requisitosContrasena('a'.repeat(129), 'x@y.z')[1]!.cumple).toBe(false);
  });
});

describe('destino tras iniciar sesión (rutas-web: ?volver= solo relativo)', () => {
  it('acepta rutas del sitio y rechaza otros dominios', async () => {
    const { destinoSeguro } = await import('./requisitos');
    expect(destinoSeguro('/mis-entradas')).toBe('/mis-entradas');
    expect(destinoSeguro(null)).toBe('/mi-cuenta');
    expect(destinoSeguro('https://malicioso.example')).toBe('/mi-cuenta');
    expect(destinoSeguro('//malicioso.example')).toBe('/mi-cuenta');
    expect(destinoSeguro('/\\malicioso.example')).toBe('/mi-cuenta');
  });
});
