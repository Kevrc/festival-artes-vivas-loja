import { describe, expect, it } from 'vitest';
import { nivelDisponibilidad, ordenarDia } from './reglas-dia';

describe('nivelDisponibilidad (RN-002)', () => {
  it('acceso libre no aplica', () => expect(nivelDisponibilidad('gratuita_libre', 0, 100)).toBe('no_aplica'));
  it('sin datos de Boletería se considera disponible', () =>
    expect(nivelDisponibilidad('pagada', null, null)).toBe('disponible'));
  it('0 lugares es agotado', () => expect(nivelDisponibilidad('pagada', 0, 800)).toBe('agotado'));
  it('≤ 10 % del aforo habilitado son últimos lugares', () => {
    expect(nivelDisponibilidad('pagada', 80, 800)).toBe('ultimos_lugares');
    expect(nivelDisponibilidad('pagada', 81, 800)).toBe('disponible');
  });
  it('aforo pequeño: 1 de 10 es últimos lugares; 1 de 5 (20 %) no', () => {
    expect(nivelDisponibilidad('gratuita_reserva', 1, 10)).toBe('ultimos_lugares');
    expect(nivelDisponibilidad('gratuita_reserva', 1, 5)).toBe('disponible');
  });
});

describe('ordenarDia (RN-006)', () => {
  const f = (inicio: string, sede: string, titulo: string) => ({ inicio, sede: { nombre: sede }, obra: { titulo } });

  it('ordena por inicio, luego sede, luego título', () => {
    const lista = [
      f('2026-11-14T19:00:00-05:00', 'Teatro Bolívar', 'B'),
      f('2026-11-14T17:00:00-05:00', 'Teatro Bolívar', 'Z'),
      f('2026-11-14T19:00:00-05:00', 'Teatro Bolívar', 'A'),
      f('2026-11-14T19:00:00-05:00', 'Plaza San Sebastián', 'C'),
    ];
    expect(ordenarDia(lista).map((x) => x.obra.titulo)).toEqual(['Z', 'C', 'A', 'B']);
  });

  it('no modifica la lista original', () => {
    const lista = [f('2026-11-14T19:00:00-05:00', 'B', 'x'), f('2026-11-14T17:00:00-05:00', 'A', 'y')];
    ordenarDia(lista);
    expect(lista[0]?.obra.titulo).toBe('x');
  });
});
