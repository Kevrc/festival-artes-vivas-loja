import { describe, expect, it } from 'vitest';
import { diaDeInstante, diasEntre, formatoDia, formatoDiaCorto, formatoHora } from './formato';

describe('formato en hora de Ecuador (research R3)', () => {
  it('la hora no depende de la zona del dispositivo', () => {
    expect(formatoHora('2026-11-15T01:00:00Z')).toBe('20:00');
  });
  it('el día de un instante es el de Ecuador', () => {
    expect(diaDeInstante('2026-11-15T02:00:00Z')).toBe('2026-11-14');
  });
  it('formatea días de calendario sin correrlos por zona', () => {
    expect(formatoDia('2026-11-14')).toBe('sábado, 14 de noviembre');
    expect(formatoDiaCorto('2026-11-14')).toMatch(/s[aá]b.* 14/);
  });
  it('lista los días de la edición inclusive', () => {
    expect(diasEntre('2026-11-12', '2026-11-14')).toEqual(['2026-11-12', '2026-11-13', '2026-11-14']);
  });
});
