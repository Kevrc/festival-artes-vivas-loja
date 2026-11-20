import { describe, expect, it } from 'vitest';
import { transicionarAsignacion, transicionarEvaluacion, transicionarPostulacion } from './estados';

describe('máquinas de estados de Convocatorias', () => {
  it('permite retirar enviada a borrador solo antes del cierre', () => {
    expect(transicionarPostulacion('enviada', 'retirar', { ahora: new Date('2026-07-01'), cierraEn: new Date('2026-08-01') })).toBe('borrador');
    expect(() => transicionarPostulacion('enviada', 'retirar', { ahora: new Date('2026-08-01'), cierraEn: new Date('2026-08-01') })).toThrow();
  });

  it('controla el ciclo de subsanación y admisión', () => {
    expect(transicionarPostulacion('enviada', 'pedir_subsanacion')).toBe('requiere_subsanacion');
    expect(transicionarPostulacion('requiere_subsanacion', 'subsanar')).toBe('enviada');
    expect(transicionarPostulacion('requiere_subsanacion', 'vencer_subsanacion')).toBe('no_admitida');
    expect(transicionarPostulacion('enviada', 'admitir')).toBe('admitida');
    expect(() => transicionarPostulacion('no_admitida', 'admitir')).toThrow();
  });

  it('controla estados cerrados de asignación y evaluación', () => {
    expect(transicionarAsignacion('asignada', 'iniciar')).toBe('en_evaluacion');
    expect(transicionarAsignacion('en_evaluacion', 'completar')).toBe('completada');
    expect(transicionarAsignacion('en_evaluacion', 'reasignar')).toBe('reasignada');
    expect(transicionarEvaluacion('borrador', 'enviar')).toBe('enviada');
    expect(transicionarEvaluacion('enviada', 'reabrir')).toBe('reabierta');
    expect(() => transicionarEvaluacion('enviada', 'enviar')).toThrow();
  });
});
