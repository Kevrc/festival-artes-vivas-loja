import { createHash } from 'node:crypto';

/** UUID determinista a partir de un nombre, para URLs estables en desarrollo y pruebas E2E. */
export function idDe(nombre: string): string {
  const h = createHash('sha1').update(`fiavl:${nombre}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
