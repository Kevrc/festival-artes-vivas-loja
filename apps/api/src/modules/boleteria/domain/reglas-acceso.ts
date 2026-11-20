import type { EstadoEdicion, EstadoEntrada, EstadoFuncion, EstadoPedido } from './tipos';

const TREINTA_MINUTOS_MS = 30 * 60_000;

/** RN-004: La venta en línea cierra 30 minutos después del inicio y requiere función/edición activas. */
export function ventaEnLineaHabilitada(p: {
  inicio: Date;
  ahora: Date;
  estadoFuncion: EstadoFuncion;
  estadoEdicion: EstadoEdicion;
}): boolean {
  if (p.estadoEdicion !== 'publicada') return false;
  if (p.estadoFuncion !== 'programada' && p.estadoFuncion !== 'reprogramada') return false;
  return p.ahora.getTime() <= p.inicio.getTime() + TREINTA_MINUTOS_MS;
}

/** RN-005: Una entrada de función reprogramada sigue siendo válida para el nuevo horario. */
export function esEntradaValidaParaFuncion(estadoEntrada: EstadoEntrada, estadoFuncion: EstadoFuncion): boolean {
  if (estadoEntrada !== 'valida') return false;
  return estadoFuncion === 'programada' || estadoFuncion === 'reprogramada';
}

/** RN-006: Las devoluciones solo proceden por cancelación o reprogramación sobre pedidos pagados. */
export function puedeSolicitarDevolucion(p: {
  estadoPedido: EstadoPedido;
  importeCentavos: number;
  estadoFuncion: EstadoFuncion;
}): boolean {
  if (p.estadoPedido !== 'pagado' || p.importeCentavos <= 0) return false;
  return p.estadoFuncion === 'cancelada' || p.estadoFuncion === 'reprogramada';
}
