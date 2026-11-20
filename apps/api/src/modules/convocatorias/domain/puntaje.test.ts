import { describe, expect, it } from 'vitest';
import {
  calcularPuntajePonderado, formatearPuntaje, hayDispersion, promediarPuntajes, UMBRAL_DELIBERACION,
} from './puntaje';

const criterios = [
  { id: 'calidad', peso: 50 },
  { id: 'viabilidad', peso: 30 },
  { id: 'territorio', peso: 20 },
];
const cal = (a: number, b: number, c: number) => [
  { criterioId: 'calidad', puntaje: a }, { criterioId: 'viabilidad', puntaje: b }, { criterioId: 'territorio', puntaje: c },
];

describe('US3-AS1 · puntaje ponderado del curador (RN-001)', () => {
  it('80, 70 y 90 con pesos 50/30/20 dan 79,00', () => {
    const centesimas = calcularPuntajePonderado(cal(80, 70, 90), criterios);
    expect(centesimas).toBe(7900);
    expect(formatearPuntaje(centesimas)).toBe('79.00');
  });

  it('conserva los dos decimales exactos, sin coma flotante', () => {
    expect(formatearPuntaje(calcularPuntajePonderado(cal(81, 77, 93), criterios))).toBe('82.20');
    expect(formatearPuntaje(calcularPuntajePonderado(cal(0, 0, 0), criterios))).toBe('0.00');
    expect(formatearPuntaje(calcularPuntajePonderado(cal(100, 100, 100), criterios))).toBe('100.00');
    expect(formatearPuntaje(calcularPuntajePonderado(cal(1, 0, 0), criterios))).toBe('0.50');
  });

  it('exige todos los criterios, sin duplicados ni desconocidos', () => {
    expect(() => calcularPuntajePonderado(cal(80, 70, 90).slice(0, 2), criterios)).toThrow(/todos los criterios/);
    expect(() => calcularPuntajePonderado([...cal(80, 70, 90), { criterioId: 'calidad', puntaje: 1 }], criterios)).toThrow(/repetid/);
    expect(() => calcularPuntajePonderado([{ criterioId: 'otro', puntaje: 50 }, ...cal(80, 70, 90).slice(1)], criterios)).toThrow(/no pertenece/);
  });

  it('acepta solo enteros de 0 a 100', () => {
    for (const invalido of [-1, 101, 70.5, Number.NaN]) {
      expect(() => calcularPuntajePonderado(cal(invalido, 70, 90), criterios)).toThrow(/entero entre 0 y 100/);
    }
    expect(() => calcularPuntajePonderado(cal(0, 100, 0), criterios)).not.toThrow();
  });

  it('rechaza pesos que no suman 100', () => {
    expect(() => calcularPuntajePonderado(cal(80, 70, 90), [{ id: 'calidad', peso: 60 }, ...criterios.slice(1)])).toThrow(/suman 100/);
  });
});

describe('US3-AS2 · promedio y puntaje final (RN-002)', () => {
  it('79,00 y 85,00 promedian 82,00', () => {
    expect(formatearPuntaje(promediarPuntajes([7900, 8500]))).toBe('82.00');
  });

  it('redondea half-up a dos decimales', () => {
    expect(promediarPuntajes([7900, 7901])).toBe(7901); // 7900,5 sube
    expect(promediarPuntajes([7900, 7900, 7901])).toBe(7900); // 7900,33 baja
    expect(promediarPuntajes([1, 2])).toBe(2); // 1,5 sube
    expect(promediarPuntajes([8200])).toBe(8200);
  });

  it('no promedia una lista vacía', () => {
    expect(() => promediarPuntajes([])).toThrow(/al menos una/);
  });
});

describe('US3-AS5 · dispersión para deliberación (FR-010)', () => {
  it('exactamente 25 puntos no delibera; más de 25 sí', () => {
    expect(UMBRAL_DELIBERACION).toBe(25);
    expect(hayDispersion([7900, 10400])).toBe(false);
    expect(hayDispersion([7900, 10401])).toBe(true);
    expect(hayDispersion([4000, 7900])).toBe(true);
  });

  it('no hay dispersión con una sola evaluación', () => {
    expect(hayDispersion([7900])).toBe(false);
  });
});
