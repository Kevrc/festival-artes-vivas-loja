/** Texto comparable sin mayúsculas ni tildes (FR-004, research R2). */
export const normalizarBusqueda = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
