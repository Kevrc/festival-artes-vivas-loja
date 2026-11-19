import { describe, expect, it } from 'vitest';
import { enCurso, ventanaAhora } from './en-curso';

const f = (inicio: string, fin: string) => ({ inicio: new Date(inicio), fin: new Date(fin) });

describe('enCurso (RN-003)', () => {
  const ahora = new Date('2026-11-14T17:10:00-05:00');
  it('en curso entre inicio y fin, inclusive', () => {
    expect(enCurso(f('2026-11-14T17:00:00-05:00', '2026-11-14T18:00:00-05:00'), ahora)).toBe(true);
    expect(enCurso(f('2026-11-14T17:10:00-05:00', '2026-11-14T18:00:00-05:00'), ahora)).toBe(true);
    expect(enCurso(f('2026-11-14T16:00:00-05:00', '2026-11-14T17:10:00-05:00'), ahora)).toBe(true);
  });
  it('no en curso antes de empezar ni después de terminar', () => {
    expect(enCurso(f('2026-11-14T17:45:00-05:00', '2026-11-14T18:00:00-05:00'), ahora)).toBe(false);
    expect(enCurso(f('2026-11-14T15:00:00-05:00', '2026-11-14T17:00:00-05:00'), ahora)).toBe(false);
  });
  it('la ventana "Ahora" llega 60 minutos adelante (FR-007)', () => {
    expect(ventanaAhora(ahora).hasta.toISOString()).toBe('2026-11-14T23:10:00.000Z');
  });
});
