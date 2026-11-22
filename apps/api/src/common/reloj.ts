/**
 * shortcut: FIAVL_AHORA fija la hora solo fuera de producción, para la demo y las pruebas
 * (p. ej. 2026-11-14T12:00:00-05:00). En producción siempre es la hora real.
 */
export function relojDelEntorno(entorno = process.env): () => Date {
  const fija = entorno.NODE_ENV !== 'production' ? entorno.FIAVL_AHORA : undefined;
  if (fija && !Number.isNaN(Date.parse(fija))) return () => new Date(fija);
  return () => new Date();
}
