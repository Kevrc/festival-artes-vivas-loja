/** Cercanía calculada en el dispositivo: la posición nunca sale del navegador (FR-014, research R6). */
export type Punto = { lat: number; lng: number };

const RADIO_TIERRA_M = 6_371_000;
const FACTOR_URBANO = 1.3;
const METROS_POR_MINUTO = 5000 / 60;

export function distanciaMetros(a: Punto, b: Punto): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(h));
}

export const minutosAPie = (a: Punto, b: Punto) => Math.ceil((distanciaMetros(a, b) * FACTOR_URBANO) / METROS_POR_MINUTO);

export function ordenarPorCercania<T extends { sede: { coordenadas: Punto } }>(lista: readonly T[], origen: Punto): T[] {
  return [...lista].sort((x, y) => distanciaMetros(origen, x.sede.coordenadas) - distanciaMetros(origen, y.sede.coordenadas));
}

/** Puntos de referencia si el visitante no comparte su ubicación (US4-AS3). */
export const REFERENCIAS: { nombre: string; punto: Punto }[] = [
  { nombre: 'Parque Central', punto: { lat: -3.9963, lng: -79.2016 } },
  { nombre: 'Plaza San Sebastián', punto: { lat: -4.0011, lng: -79.2011 } },
  { nombre: 'Puerta de la Ciudad', punto: { lat: -3.9897, lng: -79.2045 } },
];
