import { describe, expect, it } from 'vitest';
import { estadoVisible, normalizarAccesibilidad } from './tipos';

describe('estado visible de una función (research R8)', () => {
  const fin = new Date('2026-11-12T21:30:00-05:00');
  const antes = new Date('2026-11-12T21:00:00-05:00');
  const despues = new Date('2026-11-12T22:00:00-05:00');

  it('programada o reprogramada pasa a finalizada al llegar su hora de fin', () => {
    expect(estadoVisible('programada', fin, antes)).toBe('programada');
    expect(estadoVisible('programada', fin, despues)).toBe('finalizada');
    expect(estadoVisible('reprogramada', fin, fin)).toBe('finalizada');
  });

  it('cancelada y borrador nunca se muestran como finalizadas', () => {
    expect(estadoVisible('cancelada', fin, despues)).toBe('cancelada');
    expect(estadoVisible('borrador', fin, despues)).toBe('borrador');
  });
});

describe('accesibilidad de la sede (Constitución VII)', () => {
  it('completa los campos que faltan con false', () => {
    expect(normalizarAccesibilidad({ rampa: true })).toEqual({ sillaRuedas: false, banoAccesible: false, rampa: true });
    expect(normalizarAccesibilidad(null)).toEqual({ sillaRuedas: false, banoAccesible: false, rampa: false });
  });
});
