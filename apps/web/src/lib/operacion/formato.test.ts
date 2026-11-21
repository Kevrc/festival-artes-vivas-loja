import { describe, expect, it } from 'vitest';
import { diasEntre, fechaLarga, horaDeInicio, horaLoja } from './formato';

describe('formato del panel de Operación (hora de Loja)', () => {
  it('muestra la hora local de Loja en 24 h', () => {
    expect(horaLoja('2026-11-13T02:30:00.000Z')).toBe('21:30');
    expect(horaLoja('2026-11-12T20:00:00-05:00')).toBe('20:00');
  });

  it('ubica la función en la fila de su hora de inicio', () => {
    expect(horaDeInicio('2026-11-15T04:30:00Z')).toBe(23);
    expect(horaDeInicio('2026-11-12T13:05:00Z')).toBe(8);
  });

  it('lista los días de la edición, ambos extremos incluidos', () => {
    expect(diasEntre('2026-11-12', '2026-11-14')).toEqual(['2026-11-12', '2026-11-13', '2026-11-14']);
    expect(diasEntre('2026-11-12', '2026-11-12')).toEqual(['2026-11-12']);
  });

  it('nombra el día en español sin desplazarlo por la zona horaria', () => {
    expect(fechaLarga('2026-11-20')).toMatch(/viernes.*20.*noviembre/);
  });
});
