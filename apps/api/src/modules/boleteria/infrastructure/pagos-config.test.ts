import { describe, expect, it } from 'vitest';
import { elegirProveedorPagos } from './pagos-config';

describe('elegirProveedorPagos', () => {
  it('en desarrollo usa el simulador por defecto', () => {
    expect(elegirProveedorPagos({ NODE_ENV: 'development' })).toBe('simulador');
  });
  it('en desarrollo respeta payphone si se pide', () => {
    expect(elegirProveedorPagos({ NODE_ENV: 'test', BOLETERIA_PAGOS_PROVEEDOR: 'payphone' })).toBe('payphone');
  });
  it('en producción se niega a arrancar con el simulador', () => {
    expect(() => elegirProveedorPagos({ NODE_ENV: 'production' })).toThrow(/payphone/);
  });
  it('en producción exige token y secreto de webhook', () => {
    expect(() => elegirProveedorPagos({ NODE_ENV: 'production', BOLETERIA_PAGOS_PROVEEDOR: 'payphone' })).toThrow(/obligatorios/);
    expect(
      elegirProveedorPagos({ NODE_ENV: 'production', BOLETERIA_PAGOS_PROVEEDOR: 'payphone', PAYPHONE_TOKEN: 't', PAYPHONE_WEBHOOK_SECRET: 's' }),
    ).toBe('payphone');
  });
});
