/** Acceso a la API de cartelera (contracts/api-cartelera.openapi.yaml). */
const API_SERVIDOR = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const API_PUBLICA = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Lectura desde el servidor de Next con caché ISR y etiquetas de revalidación (research R5). */
export async function obtener<T>(ruta: string, etiquetas: string[], revalidate = 60): Promise<T | null> {
  const r = await fetch(`${API_SERVIDOR}/api/cartelera${ruta}`, { next: { revalidate, tags: etiquetas } });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(`API de cartelera respondió ${r.status} en ${ruta}`);
  return (await r.json()) as T;
}

/** Lectura desde el navegador (disponibilidad, Ahora, búsqueda, favoritos). */
export async function obtenerCliente<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_PUBLICA}/api/cartelera${ruta}`, { ...init, credentials: 'include' });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return (r.status === 204 ? undefined : await r.json()) as T;
}
