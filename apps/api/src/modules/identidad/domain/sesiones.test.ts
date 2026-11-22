import { describe, expect, it } from 'vitest';
import { DURACION_SESION, debeRenovar, describirDispositivo, expiracionSesion, sesionVigente } from './sesiones';

const ahora = new Date('2026-11-12T10:00:00-05:00');
const min = 60_000;

describe('sesiones (US8-AS1, research R12)', () => {
  it('dura 30 días de inactividad para el público y 8 horas para el personal', () => {
    expect(DURACION_SESION.publico).toBe(30 * 24 * 60 * min);
    expect(DURACION_SESION.personal).toBe(8 * 60 * min);
    expect(expiracionSesion(false, ahora).toISOString()).toBe(new Date('2026-12-12T10:00:00-05:00').toISOString());
    expect(expiracionSesion(true, ahora).toISOString()).toBe(new Date('2026-11-12T18:00:00-05:00').toISOString());
  });

  it('es vigente hasta su expiración y mientras no se revoque', () => {
    const expiraEn = new Date(ahora.getTime() + 10 * min);
    expect(sesionVigente({ expiraEn, revocadaEn: null }, ahora)).toBe(true);
    expect(sesionVigente({ expiraEn, revocadaEn: null }, expiraEn)).toBe(false);
    expect(sesionVigente({ expiraEn, revocadaEn: ahora }, ahora)).toBe(false);
  });

  it('la actividad se registra como máximo una vez por minuto (expiración deslizante)', () => {
    expect(debeRenovar(new Date(ahora.getTime() - 30_000), ahora)).toBe(false);
    expect(debeRenovar(new Date(ahora.getTime() - min), ahora)).toBe(true);
  });

  it('describe el dispositivo en pocas palabras para "Mis sesiones" (sin guardar el agente completo)', () => {
    expect(describirDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe('Chrome en Windows');
    expect(describirDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari en iPhone');
    expect(describirDispositivo('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe('Chrome en Android');
    expect(describirDispositivo('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox en Linux');
    expect(describirDispositivo('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge en macOS');
    expect(describirDispositivo(undefined)).toBe('Dispositivo desconocido');
  });
});
