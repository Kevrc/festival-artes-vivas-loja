import type { MedioPagoTaquilla, TipoMovimientoCaja } from './tipos';

export interface MovimientoCajaInput {
  tipo: TipoMovimientoCaja;
  medioPago: MedioPagoTaquilla;
  importeCentavos: number;
}

export interface ResultadoArqueo {
  totalEfectivoVentasCentavos: number;
  totalTarjetaVentasCentavos: number;
  totalDevolucionesEfectivoCentavos: number;
  efectivoEsperadoCentavos: number;
  efectivoDeclaradoCentavos: number;
  diferenciaCentavos: number;
}

/** US4-AS3 / SC-006: Arqueo de cierre de caja en centavos enteros. */
export function calcularArqueoCaja(p: {
  fondoInicialCentavos: number;
  movimientos: readonly MovimientoCajaInput[];
  efectivoDeclaradoCentavos: number;
}): ResultadoArqueo {
  let totalEfectivoVentasCentavos = 0;
  let totalTarjetaVentasCentavos = 0;
  let totalDevolucionesEfectivoCentavos = 0;

  for (const m of p.movimientos) {
    if (m.tipo === 'venta' && m.medioPago === 'efectivo') totalEfectivoVentasCentavos += m.importeCentavos;
    else if (m.tipo === 'venta' && m.medioPago === 'tarjeta_datafono') totalTarjetaVentasCentavos += m.importeCentavos;
    else if (m.tipo === 'egreso_devolucion' && m.medioPago === 'efectivo') totalDevolucionesEfectivoCentavos += m.importeCentavos;
  }

  const efectivoEsperadoCentavos = p.fondoInicialCentavos + totalEfectivoVentasCentavos - totalDevolucionesEfectivoCentavos;
  const diferenciaCentavos = p.efectivoDeclaradoCentavos - efectivoEsperadoCentavos;

  return {
    totalEfectivoVentasCentavos,
    totalTarjetaVentasCentavos,
    totalDevolucionesEfectivoCentavos,
    efectivoEsperadoCentavos,
    efectivoDeclaradoCentavos: p.efectivoDeclaradoCentavos,
    diferenciaCentavos,
  };
}
