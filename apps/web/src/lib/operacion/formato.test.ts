import { describe, expect, it } from 'vitest';
import { diaFestival, diasEntre, fechaLarga, horaDeInicio, horaLoja, dolares, entero, porcentaje, variacionTexto } from './formato';

describe('formato del panel de Operación (hora de Loja)', () => {
  it('muestra la hora local de Loja en 24 h', () => {
    expect(horaLoja('2026-11-13T02:30:00.000Z')).toBe('21:30');
    expect(horaLoja('2026-11-12T20:00:00-05:00')).toBe('20:00');
  });

  it('ubica la función en la fila de su hora de inicio', () => {
    expect(horaDeInicio('2026-11-15T04:30:00Z')).toBe(23);
    expect(horaDeInicio('2026-11-12T13:05:00Z')).toBe(8);
  });

  it('una función que cruza medianoche cuenta para su día de inicio', () => {
    expect(diaFestival('2026-11-15T04:30:00Z')).toBe('2026-11-14');
    expect(diaFestival('2026-11-15T05:00:00Z')).toBe('2026-11-15');
  });

  it('lista los días de la edición, ambos extremos incluidos', () => {
    expect(diasEntre('2026-11-12', '2026-11-14')).toEqual(['2026-11-12', '2026-11-13', '2026-11-14']);
    expect(diasEntre('2026-11-12', '2026-11-12')).toEqual(['2026-11-12']);
  });

  it('nombra el día en español sin desplazarlo por la zona horaria', () => {
    expect(fechaLarga('2026-11-20')).toMatch(/viernes.*20.*noviembre/);
  });
});

describe('números de las estadísticas', () => {
  it('enteros, porcentajes, dólares y variación', () => {
    expect(entero(163162)).toMatch(/163.162/);
    expect(porcentaje(0.75)).toMatch(/^75\s%$/);
    expect(porcentaje(null)).toBe('—');
    expect(dolares(230000)).toMatch(/^USD 2.300,00$/);
    expect(variacionTexto(10.3)).toMatch(/^\+10,3\s%$/);
    expect(variacionTexto(-20)).toMatch(/^-20\s%$/);
    expect(variacionTexto(undefined)).toBe('sin dato anterior');
  });
});
