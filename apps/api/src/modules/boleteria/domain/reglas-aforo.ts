import type { CanalPedido, TipoAcceso } from './tipos';

/** RN-001: Lugares disponibles = aforo habilitado - emitidos - retenidos (mínimo 0). */
export function calcularDisponibilidad(p: { aforoHabilitado: number; emitidos: number; retenidos: number }): number {
  return Math.max(0, p.aforoHabilitado - p.emitidos - p.retenidos);
}

/** RN-002: Importe exacto en centavos enteros de USD (Constitución V). */
export function calcularImporteCentavos(cantidad: number, precioUnitarioCentavos: number): number {
  if (!Number.isInteger(cantidad) || cantidad < 1) throw new Error('La cantidad debe ser un entero mayor o igual a 1');
  if (!Number.isInteger(precioUnitarioCentavos) || precioUnitarioCentavos < 0) {
    throw new Error('El precio unitario debe ser un entero en centavos >= 0');
  }
  return cantidad * precioUnitarioCentavos;
}

/** FR-006: Limita entradas por pedido y acumulado por persona y función. */
export function validarLimitesCompra(p: {
  cantidadSolicitada: number;
  acumuladoPersona: number;
  maxPorPedido: number;
  maxPorPersona: number;
}): { valido: true } | { valido: false; motivo: string } {
  if (!Number.isInteger(p.cantidadSolicitada) || p.cantidadSolicitada < 1) {
    return { valido: false, motivo: 'La cantidad solicitada debe ser al menos 1.' };
  }
  if (p.cantidadSolicitada > p.maxPorPedido) {
    return { valido: false, motivo: `Máximo ${p.maxPorPedido} entradas por pedido.` };
  }
  if (p.acumuladoPersona + p.cantidadSolicitada > p.maxPorPersona) {
    const restantes = Math.max(0, p.maxPorPersona - p.acumuladoPersona);
    return {
      valido: false,
      motivo: `Límite de ${p.maxPorPersona} entradas por persona en esta función (puedes obtener hasta ${restantes} más).`,
    };
  }
  return { valido: true };
}

/** RN-007: Funciones de público restringido exigen acreditación en web o gestión en taquilla. */
export function puedeComprarPorCanal(p: {
  tipoAcceso: TipoAcceso;
  canal: CanalPedido;
  estudianteAcreditado: boolean;
}): boolean {
  if (p.tipoAcceso !== 'restringida') return true;
  if (p.canal === 'taquilla' || p.canal === 'cambio') return true;
  return p.estudianteAcreditado;
}

/** Caso borde: exceso de aforo cuando Operación reduce aforo_habilitado tras emitir entradas. */
export function calcularExcesoAforo(p: { aforoHabilitado: number; emitidos: number; retenidos: number }): number {
  return Math.max(0, p.emitidos + p.retenidos - p.aforoHabilitado);
}
