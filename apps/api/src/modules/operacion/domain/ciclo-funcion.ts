import type { EstadoFuncionGuardado } from './tipos';

/**
 * Transiciones de una función (spec 004 §Ciclo de vida de una función). Cada transición que los
 * demás módulos ven incrementa `version`, que viaja en los eventos (research R3).
 */
export type ResultadoTransicion =
  | { ok: true; estado: EstadoFuncionGuardado; version: number; publicadaEn: Date }
  | { ok: false; codigo: 'funcion_publicada' };

/** Borrador → programada (US2). */
export function publicar(f: { estado: EstadoFuncionGuardado; version: number }, ahora: Date): ResultadoTransicion {
  if (f.estado !== 'borrador') return { ok: false, codigo: 'funcion_publicada' };
  return { ok: true, estado: 'programada', version: f.version + 1, publicadaEn: ahora };
}
