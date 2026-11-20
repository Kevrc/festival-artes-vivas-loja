/**
 * Elige el proveedor de pagos según el entorno. En producción falla al arrancar si no es PayPhone
 * con su secreto de webhook: el simulador acepta firmas de desarrollo y regalaría entradas
 * (Constitución V y VI, revisión PR #6).
 */
export function elegirProveedorPagos(env: Record<string, string | undefined> = process.env): 'payphone' | 'simulador' {
  const proveedor = env.BOLETERIA_PAGOS_PROVEEDOR === 'payphone' ? 'payphone' : 'simulador';
  if (env.NODE_ENV !== 'production') return proveedor;
  if (proveedor !== 'payphone') {
    throw new Error('En producción BOLETERIA_PAGOS_PROVEEDOR debe ser "payphone": el simulador no cobra.');
  }
  if (!env.PAYPHONE_WEBHOOK_SECRET || !env.PAYPHONE_TOKEN) {
    throw new Error('En producción PAYPHONE_TOKEN y PAYPHONE_WEBHOOK_SECRET son obligatorios.');
  }
  return proveedor;
}
