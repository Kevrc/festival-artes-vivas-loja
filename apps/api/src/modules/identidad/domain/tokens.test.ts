import { describe, expect, it } from 'vitest';
import { REENVIOS_POR_HORA, estadoToken, expiracionDe, generarToken, hashToken, normalizarCorreo, puedeReenviar } from './tokens';

describe('enlaces de un solo uso (R15)', () => {
  it('el token es de 256 bits en base64url y en la base solo se guarda su SHA-256', () => {
    const { token, hash } = generarToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(hash).toHaveLength(32);
    expect(hash.equals(hashToken(token))).toBe(true);
    expect(hash.toString('hex')).not.toContain(Buffer.from(token, 'base64url').toString('hex'));
  });

  it('dos tokens nunca coinciden', () => {
    const vistos = new Set(Array.from({ length: 100 }, () => generarToken().token));
    expect(vistos.size).toBe(100);
  });

  it('caduca a las 24 h la verificación y a la 1 h la recuperación (FR-017)', () => {
    const ahora = new Date('2026-11-12T10:00:00-05:00');
    expect(expiracionDe('verificacion', ahora).toISOString()).toBe(new Date('2026-11-13T10:00:00-05:00').toISOString());
    expect(expiracionDe('recuperacion', ahora).toISOString()).toBe(new Date('2026-11-12T11:00:00-05:00').toISOString());
  });

  it('un enlace es válido, vencido o ya usado', () => {
    const ahora = new Date('2026-11-12T10:00:00-05:00');
    const expiraEn = new Date('2026-11-12T11:00:00-05:00');
    expect(estadoToken({ expiraEn, usadoEn: null }, ahora)).toBe('valido');
    expect(estadoToken({ expiraEn, usadoEn: null }, expiraEn)).toBe('vencido');
    expect(estadoToken({ expiraEn, usadoEn: ahora }, ahora)).toBe('usado');
  });

  it('caso borde: como máximo 3 enlaces de verificación por hora', () => {
    expect(REENVIOS_POR_HORA).toBe(3);
    expect(puedeReenviar(2)).toBe(true);
    expect(puedeReenviar(3)).toBe(false);
  });
});

describe('correo normalizado (caso borde)', () => {
  it('Ana@Mail.com y " ana@mail.com " son la misma cuenta', () => {
    expect(normalizarCorreo(' Ana@Mail.com ')).toBe('ana@mail.com');
    expect(normalizarCorreo('ana@mail.com')).toBe('ana@mail.com');
  });
});
