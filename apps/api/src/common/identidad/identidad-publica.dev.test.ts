import { describe, expect, it } from 'vitest';
import { IdentidadPublicaDevProvider, leerRolDev } from './identidad-publica.dev';

const cuenta = '0b7a3c1e-1111-4111-8111-111111111111';
const sede = '7d1c2a5e-0000-5000-a000-000000000001';

describe('IdentidadPublicaDevProvider (solo development/test)', () => {
  it('lee cuenta, roles con alcance y banderas de las cabeceras', async () => {
    const ctx = await new IdentidadPublicaDevProvider('test').resolverSesion({
      headers: { 'x-cuenta-dev': cuenta, 'x-roles-dev': `validador@sede:${sede}, programador`, 'x-segundo-factor-dev': 'false' },
    });
    expect(ctx).toMatchObject({
      cuentaId: cuenta,
      correoVerificado: true,
      estudianteAcreditado: false,
      segundoFactorOk: false,
      roles: [
        { rol: 'validador', alcance: { tipo: 'sede', valor: sede } },
        { rol: 'programador', alcance: null },
      ],
    });
  });

  it('por defecto es asistente', async () => {
    const ctx = await new IdentidadPublicaDevProvider('development').resolverSesion({ headers: { 'x-cuenta-dev': cuenta } });
    expect(ctx?.roles).toEqual([{ rol: 'asistente', alcance: null }]);
  });

  it('falla cerrado: fuera de development/test, sin cuenta válida o con un rol desconocido', async () => {
    const headers = { 'x-cuenta-dev': cuenta, 'x-roles-dev': 'administrador' };
    expect(await new IdentidadPublicaDevProvider('production').resolverSesion({ headers })).toBeNull();
    expect(await new IdentidadPublicaDevProvider('staging').resolverSesion({ headers })).toBeNull();
    expect(await new IdentidadPublicaDevProvider('test').resolverSesion({ headers: { 'x-cuenta-dev': 'no-uuid' } })).toBeNull();
    expect(await new IdentidadPublicaDevProvider('test').resolverSesion({ headers: { 'x-cuenta-dev': cuenta, 'x-roles-dev': 'root' } })).toBeNull();
  });

  it('rechaza alcances mal formados', () => {
    expect(leerRolDev('taquilla@sede:')).toBeNull();
    expect(leerRolDev('taquilla@ciudad:Loja')).toBeNull();
    expect(leerRolDev('taquilla@sede')).toBeNull();
    expect(leerRolDev('coordinacion_provincial@provincia:Loja')).toEqual({
      rol: 'coordinacion_provincial',
      alcance: { tipo: 'provincia', valor: 'Loja' },
    });
  });
});
