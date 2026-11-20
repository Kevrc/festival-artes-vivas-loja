import { describe, expect, it } from 'vitest';
import {
  calcularVencimientoSubsanacion,
  puedeSubsanar,
  validarDecisionAdmisibilidad,
  PLAZO_SUBSANACION_HORAS,
} from './admisibilidad';
import { transicionarPostulacion } from './estados';

const ahora = new Date('2026-07-01T12:00:00.000Z');
const vence = new Date(ahora.getTime() + PLAZO_SUBSANACION_HORAS * 3_600_000);

describe('US2 · reglas de admisibilidad y subsanación (AS1-AS3)', () => {
  it('US2-AS1: fija el vencimiento exactamente a las 72 horas', () => {
    expect(calcularVencimientoSubsanacion(ahora).toISOString()).toBe('2026-07-04T12:00:00.000Z');
    expect(calcularVencimientoSubsanacion(ahora).getTime()).toBe(ahora.getTime() + PLAZO_SUBSANACION_HORAS * 3_600_000);
  });

  it('US2-AS2/AS3: acepta hasta el vencimiento exacto y rechaza un milisegundo después', () => {
    expect(puedeSubsanar(vence, vence)).toBe(true);
    expect(puedeSubsanar(new Date(vence.getTime() + 1), vence)).toBe(false);
    expect(transicionarPostulacion('requiere_subsanacion', 'subsanar', { ahora: vence, venceEn: vence })).toBe('enviada');
    expect(() =>
      transicionarPostulacion('requiere_subsanacion', 'subsanar', { ahora: new Date(vence.getTime() + 1), venceEn: vence }),
    ).toThrow('Plazo');
  });

  it('US2-AS3: solo marca vencida al cumplirse el plazo', () => {
    expect(transicionarPostulacion('requiere_subsanacion', 'vencer_subsanacion', { ahora: vence, venceEn: vence })).toBe('no_admitida');
    expect(() =>
      transicionarPostulacion('requiere_subsanacion', 'vencer_subsanacion', { ahora: new Date(vence.getTime() - 1), venceEn: vence }),
    ).toThrow('aún no vence');
  });

  it('exige motivo al no admitir y detalle al pedir subsanación', () => {
    expect(() => validarDecisionAdmisibilidad({ decision: 'no_admitir' })).toThrow('motivo');
    expect(() => validarDecisionAdmisibilidad({ decision: 'no_admitir', motivo: '   ' })).toThrow('motivo');
    expect(() => validarDecisionAdmisibilidad({ decision: 'subsanar', detalle: '   ' })).toThrow('detalle');
    expect(() => validarDecisionAdmisibilidad({ decision: 'admitir' })).not.toThrow();
    expect(() => validarDecisionAdmisibilidad({ decision: 'no_admitir', motivo: 'No cumple las bases' })).not.toThrow();
    expect(() => validarDecisionAdmisibilidad({ decision: 'subsanar', detalle: 'Adjunte el dossier legible' })).not.toThrow();
  });

  it('mantiene cerradas las transiciones de admisibilidad', () => {
    expect(transicionarPostulacion('enviada', 'pedir_subsanacion')).toBe('requiere_subsanacion');
    expect(transicionarPostulacion('enviada', 'admitir')).toBe('admitida');
    expect(transicionarPostulacion('enviada', 'no_admitir')).toBe('no_admitida');
    expect(() => transicionarPostulacion('admitida', 'pedir_subsanacion')).toThrow();
    expect(() => transicionarPostulacion('no_admitida', 'admitir')).toThrow();
  });
});
