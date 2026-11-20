import { describe, expect, it } from 'vitest';
import { calcularObraFingerprint, calcularPuntajePonderado, calcularResultadoCuraduria, puedePostularOtraObra } from './reglas-convocatoria';

describe('reglas puras de convocatoria', () => {
  it('calcula una huella estable con campos canonizados', () => {
    const a = { titulo: ' La obra ', disciplina: 'teatro', duracionMin: 60, sinopsis: ' Una historia ' };
    expect(calcularObraFingerprint(a)).toBe(calcularObraFingerprint({ ...a, titulo: 'La obra', sinopsis: 'Una historia' }));
    expect(calcularObraFingerprint(a)).toMatch(/^[a-f0-9]{64}$/);
  });
  it('aplica el máximo por elenco sin contar borradores no enviados', () => {
    expect(puedePostularOtraObra(2, 3)).toBe(true);
    expect(puedePostularOtraObra(3, 3)).toBe(false);
  });
  it('calcula el puntaje 79,00 y el promedio 82,00 con deliberación solo sobre 25', () => {
    expect(calcularPuntajePonderado([80, 70, 90], [50, 30, 20])).toBe(79);
    expect(calcularResultadoCuraduria([79, 85])).toEqual({ promedio: 82, requiereDeliberacion: false });
    expect(calcularResultadoCuraduria([70, 95]).requiereDeliberacion).toBe(false);
    expect(calcularResultadoCuraduria([70, 96]).requiereDeliberacion).toBe(true);
  });
});
