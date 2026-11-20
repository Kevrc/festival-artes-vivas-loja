import { describe, expect, it } from 'vitest';
import { esEntradaValidaParaFuncion, puedeSolicitarDevolucion, ventaEnLineaHabilitada } from './reglas-acceso';

describe('reglas-acceso (RN-004, RN-005, RN-006)', () => {
  const inicio = new Date('2026-11-14T20:00:00-05:00');

  it('RN-004: venta en línea abierta antes de inicio + 30 min y cerrada después', () => {
    expect(
      ventaEnLineaHabilitada({
        inicio,
        ahora: new Date('2026-11-14T20:29:59-05:00'),
        estadoFuncion: 'programada',
        estadoEdicion: 'publicada',
      }),
    ).toBe(true);
    expect(
      ventaEnLineaHabilitada({
        inicio,
        ahora: new Date('2026-11-14T20:30:01-05:00'),
        estadoFuncion: 'programada',
        estadoEdicion: 'publicada',
      }),
    ).toBe(false);
    expect(
      ventaEnLineaHabilitada({
        inicio,
        ahora: new Date('2026-11-14T19:00:00-05:00'),
        estadoFuncion: 'cancelada',
        estadoEdicion: 'publicada',
      }),
    ).toBe(false);
    expect(
      ventaEnLineaHabilitada({
        inicio,
        ahora: new Date('2026-11-14T19:00:00-05:00'),
        estadoFuncion: 'reprogramada',
        estadoEdicion: 'borrador',
      }),
    ).toBe(false);
  });

  it('RN-005: entrada válida sigue vigente en función reprogramada', () => {
    expect(esEntradaValidaParaFuncion('valida', 'programada')).toBe(true);
    expect(esEntradaValidaParaFuncion('valida', 'reprogramada')).toBe(true);
    expect(esEntradaValidaParaFuncion('valida', 'cancelada')).toBe(false);
    expect(esEntradaValidaParaFuncion('anulada', 'programada')).toBe(false);
  });

  it('RN-006: devolución solo procede en función cancelada o reprogramada para pedidos pagados', () => {
    expect(puedeSolicitarDevolucion({ estadoPedido: 'pagado', importeCentavos: 500, estadoFuncion: 'cancelada' })).toBe(true);
    expect(puedeSolicitarDevolucion({ estadoPedido: 'pagado', importeCentavos: 500, estadoFuncion: 'reprogramada' })).toBe(true);
    expect(puedeSolicitarDevolucion({ estadoPedido: 'pagado', importeCentavos: 500, estadoFuncion: 'programada' })).toBe(false);
    expect(puedeSolicitarDevolucion({ estadoPedido: 'confirmado', importeCentavos: 0, estadoFuncion: 'cancelada' })).toBe(false);
  });
});
