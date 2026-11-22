import { describe, expect, it } from 'vitest';
import { BLOQUEO, bloqueadaHasta, debeBloquear, estaBloqueada } from './bloqueo';

const ahora = new Date('2026-11-12T10:00:00-05:00');
const min = 60_000;

describe('bloqueo por intentos fallidos (US8-AS2, research R14)', () => {
  it('5 fallos en 15 minutos bloquean la cuenta 15 minutos', () => {
    expect(BLOQUEO).toEqual({ fallos: 5, ventanaMs: 15 * min, duracionMs: 15 * min });
    expect(debeBloquear(4)).toBe(false);
    expect(debeBloquear(5)).toBe(true);
    expect(bloqueadaHasta(ahora).toISOString()).toBe(new Date('2026-11-12T10:15:00-05:00').toISOString());
  });

  it('el bloqueo se levanta solo al pasar su hora (vuelve a "verificada")', () => {
    const hasta = bloqueadaHasta(ahora);
    expect(estaBloqueada(hasta, new Date(ahora.getTime() + 14 * min))).toBe(true);
    expect(estaBloqueada(hasta, hasta)).toBe(false);
    expect(estaBloqueada(null, ahora)).toBe(false);
  });
});
