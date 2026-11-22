import { describe, expect, it } from 'vitest';
import { ESTADO_AVISO, fechaAviso } from './notificaciones';

describe('avisos', () => {
  it('estado legible y fecha en hora de Ecuador', () => {
    expect(ESTADO_AVISO.fallida).toBe('No se pudo enviar');
    expect(fechaAviso('2026-11-14T01:00:00Z')).toContain('2026');
    expect(fechaAviso('2026-11-14T01:00:00Z')).toMatch(/13/);
  });
});
