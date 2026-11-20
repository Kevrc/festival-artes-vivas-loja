export function formatoCodigoCorto(codigo: string): string {
  const limpio = codigo.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpio.length !== 8) return limpio;
  return `${limpio.slice(0, 4)}-${limpio.slice(4)}`;
}

export function nuevaClaveIdempotencia(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `clave-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
