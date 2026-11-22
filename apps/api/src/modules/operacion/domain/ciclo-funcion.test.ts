import { describe, expect, it } from 'vitest';
import { publicar } from './ciclo-funcion';

describe('ciclo de vida de una función: publicación (spec §Ciclo de vida)', () => {
  const ahora = new Date('2026-11-10T12:00:00-05:00');

  it('borrador → programada, con versión +1 y fecha de publicación', () => {
    expect(publicar({ estado: 'borrador', version: 1 }, ahora)).toEqual({ ok: true, estado: 'programada', version: 2, publicadaEn: ahora });
  });

  it('solo se publica un borrador', () => {
    for (const estado of ['programada', 'reprogramada', 'cancelada'] as const) {
      expect(publicar({ estado, version: 3 }, ahora)).toEqual({ ok: false, codigo: 'funcion_publicada' });
    }
  });
});
