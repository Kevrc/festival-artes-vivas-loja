import { describe, expect, it } from 'vitest';
import { calcularArqueoCaja } from './arqueo-caja';

describe('arqueo-caja (US4, SC-006)', () => {
  it('calcula efectivo esperado considerando fondo, ventas en efectivo y egresos, excluyendo datáfono', () => {
    const arqueo = calcularArqueoCaja({
      fondoInicialCentavos: 2000,
      movimientos: [
        { tipo: 'venta', medioPago: 'efectivo', importeCentavos: 1500 },
        { tipo: 'venta', medioPago: 'tarjeta_datafono', importeCentavos: 1000 },
        { tipo: 'egreso_devolucion', medioPago: 'efectivo', importeCentavos: 500 },
      ],
      efectivoDeclaradoCentavos: 3000,
    });
    expect(arqueo).toEqual({
      totalEfectivoVentasCentavos: 1500,
      totalTarjetaVentasCentavos: 1000,
      totalDevolucionesEfectivoCentavos: 500,
      efectivoEsperadoCentavos: 3000,
      efectivoDeclaradoCentavos: 3000,
      diferenciaCentavos: 0,
    });
  });

  it('reporta diferencia negativa o positiva en centavos si no cuadra', () => {
    const arqueo = calcularArqueoCaja({
      fondoInicialCentavos: 1000,
      movimientos: [{ tipo: 'venta', medioPago: 'efectivo', importeCentavos: 500 }],
      efectivoDeclaradoCentavos: 1200,
    });
    expect(arqueo.efectivoEsperadoCentavos).toBe(1500);
    expect(arqueo.diferenciaCentavos).toBe(-300);
  });
});
