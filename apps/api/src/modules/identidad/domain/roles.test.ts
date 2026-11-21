import { describe, expect, it } from 'vitest';
import { ALCANCE_REQUERIDO, esRolDePersonal, esPersonal, validarAsignacion } from './roles';

const sede = { tipo: 'sede' as const, valor: '7d1c2a5e-0000-5000-a000-000000000001' };

describe('roles y alcance (FR-019, RN-009, research R16)', () => {
  it('taquilla, validador y jefe de sala exigen alcance de sede', () => {
    for (const rol of ['taquilla', 'validador', 'jefe_sala'] as const) {
      expect(ALCANCE_REQUERIDO[rol]).toBe('sede');
      expect(validarAsignacion(rol, sede)).toEqual({ ok: true });
    }
  });

  it('caso borde: un rol sin el alcance que exige no se puede guardar', () => {
    expect(validarAsignacion('taquilla', null)).toEqual({ ok: false, codigo: 'alcance_requerido' });
    expect(validarAsignacion('coordinacion_provincial', null)).toEqual({ ok: false, codigo: 'alcance_requerido' });
    expect(validarAsignacion('curador', null)).toEqual({ ok: false, codigo: 'alcance_requerido' });
  });

  it('rechaza un alcance de otro tipo o vacío', () => {
    expect(validarAsignacion('validador', { tipo: 'provincia', valor: 'Loja' })).toEqual({ ok: false, codigo: 'alcance_invalido' });
    expect(validarAsignacion('coordinacion_provincial', { tipo: 'provincia', valor: '  ' })).toEqual({ ok: false, codigo: 'alcance_invalido' });
    expect(validarAsignacion('coordinacion_provincial', { tipo: 'provincia', valor: 'Loja' })).toEqual({ ok: true });
    expect(validarAsignacion('curador', { tipo: 'disciplina', valor: 'teatro' })).toEqual({ ok: true });
  });

  it('los roles globales no admiten alcance', () => {
    for (const rol of ['programador', 'direccion', 'administrador', 'coordinacion_convocatorias', 'asistente', 'postulante'] as const) {
      expect(ALCANCE_REQUERIDO[rol]).toBeNull();
      expect(validarAsignacion(rol, null)).toEqual({ ok: true });
      expect(validarAsignacion(rol, sede)).toEqual({ ok: false, codigo: 'alcance_no_aplica' });
    }
  });

  it('el personal es quien tiene algún rol distinto de asistente y postulante (sesión de 8 h y TOTP)', () => {
    expect(esRolDePersonal('asistente')).toBe(false);
    expect(esRolDePersonal('postulante')).toBe(false);
    expect(esRolDePersonal('validador')).toBe(true);
    expect(esPersonal(['asistente', 'postulante'])).toBe(false);
    expect(esPersonal(['asistente', 'programador'])).toBe(true);
    expect(esPersonal([])).toBe(false);
  });
});
