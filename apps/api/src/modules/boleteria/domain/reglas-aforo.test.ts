import { describe, expect, it } from 'vitest';
import {
  calcularDisponibilidad,
  calcularExcesoAforo,
  calcularImporteCentavos,
  puedeComprarPorCanal,
  validarLimitesCompra,
} from './reglas-aforo';

describe('reglas-aforo (RN-001, RN-002, RN-007, FR-006)', () => {
  it('RN-001: calcula disponibilidad restando emitidos y retenidos sin bajar de cero', () => {
    expect(calcularDisponibilidad({ aforoHabilitado: 100, emitidos: 60, retenidos: 15 })).toBe(25);
    expect(calcularDisponibilidad({ aforoHabilitado: 50, emitidos: 45, retenidos: 10 })).toBe(0);
  });

  it('RN-002: calcula importe exacto en centavos enteros sin decimales flotantes', () => {
    expect(calcularImporteCentavos(3, 500)).toBe(1500);
    expect(calcularImporteCentavos(2, 0)).toBe(0);
    expect(() => calcularImporteCentavos(0, 500)).toThrow();
    expect(() => calcularImporteCentavos(1.5, 500)).toThrow();
  });

  it('FR-006: valida límites por pedido y acumulado por persona y función', () => {
    expect(validarLimitesCompra({ cantidadSolicitada: 4, acumuladoPersona: 2, maxPorPedido: 6, maxPorPersona: 6 })).toEqual({
      valido: true,
    });
    expect(
      validarLimitesCompra({ cantidadSolicitada: 7, acumuladoPersona: 0, maxPorPedido: 6, maxPorPersona: 6 }).valido,
    ).toBe(false);
    expect(
      validarLimitesCompra({ cantidadSolicitada: 2, acumuladoPersona: 3, maxPorPedido: 4, maxPorPersona: 4 }).valido,
    ).toBe(false);
  });

  it('RN-007: público restringido exige acreditación en web pero permite venta en taquilla', () => {
    expect(puedeComprarPorCanal({ tipoAcceso: 'restringida', canal: 'web', estudianteAcreditado: false })).toBe(false);
    expect(puedeComprarPorCanal({ tipoAcceso: 'restringida', canal: 'web', estudianteAcreditado: true })).toBe(true);
    expect(puedeComprarPorCanal({ tipoAcceso: 'restringida', canal: 'taquilla', estudianteAcreditado: false })).toBe(true);
    expect(puedeComprarPorCanal({ tipoAcceso: 'pagada', canal: 'web', estudianteAcreditado: false })).toBe(true);
  });

  it('calcula exceso de aforo cuando AforoCambiado baja de los lugares comprometidos', () => {
    expect(calcularExcesoAforo({ aforoHabilitado: 80, emitidos: 90, retenidos: 5 })).toBe(15);
    expect(calcularExcesoAforo({ aforoHabilitado: 100, emitidos: 90, retenidos: 5 })).toBe(0);
  });
});
