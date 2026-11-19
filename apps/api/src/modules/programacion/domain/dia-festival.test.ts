import { describe, expect, it } from 'vitest';
import { diaFestival, incluidaEnDia } from './dia-festival';

describe('diaFestival (research R3)', () => {
  it('usa la fecha de Ecuador del inicio', () => {
    expect(diaFestival(new Date('2026-11-14T19:00:00-05:00'))).toBe('2026-11-14');
  });

  it('una función que empieza a las 23:30 y cruza medianoche cuenta el día de inicio', () => {
    expect(diaFestival(new Date('2026-11-14T23:30:00-05:00'))).toBe('2026-11-14');
  });

  it('no depende de la zona del proceso: 02:00 UTC del 15 es el 14 en Ecuador', () => {
    expect(diaFestival(new Date('2026-11-15T02:00:00Z'))).toBe('2026-11-14');
  });
});

describe('incluidaEnDia', () => {
  const expo = {
    continua: true,
    inicio: new Date('2026-11-12T09:00:00-05:00'),
    fin: new Date('2026-11-22T17:00:00-05:00'),
  };

  it('una exposición continua del 12 al 22 aparece el 15', () => {
    expect(incluidaEnDia(expo, '2026-11-15')).toBe(true);
  });

  it('no aparece fuera de su intervalo', () => {
    expect(incluidaEnDia(expo, '2026-11-23')).toBe(false);
    expect(incluidaEnDia(expo, '2026-11-11')).toBe(false);
  });

  it('una función puntual solo aparece el día de inicio', () => {
    const f = { continua: false, inicio: new Date('2026-11-14T23:30:00-05:00'), fin: new Date('2026-11-15T01:00:00-05:00') };
    expect(incluidaEnDia(f, '2026-11-14')).toBe(true);
    expect(incluidaEnDia(f, '2026-11-15')).toBe(false);
  });
});
