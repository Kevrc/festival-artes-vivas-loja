import type { ContextoIdentidad } from '@fiavl/contracts';
import { describe, expect, it } from 'vitest';
import { AutorizacionIdentidadAdapter, aContextoBoleteria } from './autorizacion-identidad.adapter';

const base: ContextoIdentidad = {
  cuentaId: '0b6f0c1e-6a3e-4c2a-9d1e-000000000001', sesionId: 's', correo: 'ana@fiavl.test',
  correoVerificado: true, estudianteAcreditado: true, segundoFactorOk: true, roles: [],
};

describe('T088 · ContextoIdentidad → ContextoUsuario de Boletería', () => {
  it('toda cuenta es asistente; el personal pasa con su sede; los demás roles se ignoran', () => {
    const ctx = aContextoBoleteria({
      ...base,
      roles: [
        { rol: 'validador', alcance: { tipo: 'sede', valor: 'bolivar' } },
        { rol: 'programador', alcance: null },
        { rol: 'curador', alcance: { tipo: 'disciplina', valor: 'teatro' } },
        { rol: 'direccion', alcance: null },
      ],
    });
    expect(ctx).toEqual({
      cuentaId: base.cuentaId, correo: base.correo, correoVerificado: true, estudianteAcreditado: true,
      roles: [{ rol: 'asistente' }, { rol: 'validador', sedeId: 'bolivar' }, { rol: 'programador' }],
    });
  });

  it('sin segundo factor no autoriza', () => {
    expect(aContextoBoleteria({ ...base, segundoFactorOk: false })).toBeNull();
  });

  it('con cookie manda Identidad; sin cookie, el puente de desarrollo', async () => {
    const dev = { resolverDesdePeticion: async () => ({ cuentaId: 'dev', correoVerificado: true, estudianteAcreditado: false, roles: [] }) };
    const nadie = { resolverSesion: async () => null };
    const adaptador = new AutorizacionIdentidadAdapter(nadie, dev);
    expect(await adaptador.resolverDesdePeticion({ headers: { cookie: 'fiavl_sesion=x' } })).toBeNull();
    expect((await adaptador.resolverDesdePeticion({ headers: {} }))?.cuentaId).toBe('dev');
    expect(await new AutorizacionIdentidadAdapter(nadie, null).resolverDesdePeticion({ headers: {} })).toBeNull();
  });
});
