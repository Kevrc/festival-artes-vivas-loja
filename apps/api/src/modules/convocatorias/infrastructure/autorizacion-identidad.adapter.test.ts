import type { ContextoIdentidad } from '@fiavl/contracts';
import { describe, expect, it } from 'vitest';
import { AutorizacionConvocatoriasIdentidadAdapter, aContextoConvocatorias } from './autorizacion-identidad.adapter';

const base: ContextoIdentidad = {
  cuentaId: '0b6f0c1e-6a3e-4c2a-9d1e-000000000002', sesionId: 's', correo: 'luis@fiavl.test',
  correoVerificado: false, estudianteAcreditado: false, segundoFactorOk: true, roles: [],
};

describe('T090 · ContextoIdentidad → ContextoConvocatorias', () => {
  it('traduce códigos a los nombres de FR-019 y el alcance a su forma; el público es asistente y postulante', () => {
    const ctx = aContextoConvocatorias({
      ...base,
      roles: [
        { rol: 'coordinacion_provincial', alcance: { tipo: 'provincia', valor: 'Zamora Chinchipe' } },
        { rol: 'curador', alcance: { tipo: 'disciplina', valor: 'danza' } },
        { rol: 'jefe_sala', alcance: { tipo: 'sede', valor: 'bolivar' } },
        { rol: 'postulante', alcance: null },
      ],
    });
    expect(ctx).toEqual({
      cuentaId: base.cuentaId, correo: base.correo, correoVerificado: false,
      roles: [
        { rol: 'coordinación provincial', alcance: { provincia: 'Zamora Chinchipe' } },
        { rol: 'curador', alcance: { disciplina: 'danza' } },
        { rol: 'jefe de sala', alcance: { sedeId: 'bolivar' } },
        { rol: 'asistente' },
        { rol: 'postulante' },
      ],
    });
  });

  it('sin segundo factor no autoriza; con cookie no cae al puente', async () => {
    expect(aContextoConvocatorias({ ...base, segundoFactorOk: false })).toBeNull();
    const dev = { resolverDesdePeticion: async () => ({ cuentaId: 'dev', correoVerificado: true, roles: [] }) };
    const adaptador = new AutorizacionConvocatoriasIdentidadAdapter({ resolverSesion: async () => null }, dev);
    expect(await adaptador.resolverDesdePeticion({ headers: { cookie: 'a=1; fiavl_sesion=x' } })).toBeNull();
    expect((await adaptador.resolverDesdePeticion({ headers: {} }))?.cuentaId).toBe('dev');
  });
});
