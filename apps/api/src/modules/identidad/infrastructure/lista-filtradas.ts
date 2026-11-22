import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ListaFiltradas } from '../application/puertos';

/**
 * Lista local de contraseñas filtradas (RN-008, research R11), cargada una sola vez en un `Set`.
 * Sin llamadas externas: la contraseña nunca sale del servidor.
 */
export function cargarListaFiltradas(ruta = resolve(import.meta.dirname, 'datos/contrasenas-filtradas.txt')): ListaFiltradas {
  const lista = new Set(
    readFileSync(ruta, 'utf8')
      .split('\n')
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean),
  );
  return (c) => lista.has(c);
}
