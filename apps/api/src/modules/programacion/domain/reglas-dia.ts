import type { NivelGuardado, TipoAcceso } from './tipos';

/** RN-002: últimos lugares cuando queda ≤ 10 % del aforo habilitado. */
export function nivelDisponibilidad(
  tipoAcceso: TipoAcceso,
  lugaresRestantes: number | null,
  aforoHabilitado: number | null,
): NivelGuardado {
  if (tipoAcceso === 'gratuita_libre') return 'no_aplica';
  if (lugaresRestantes === null || !aforoHabilitado) return 'disponible';
  if (lugaresRestantes <= 0) return 'agotado';
  return lugaresRestantes <= aforoHabilitado * 0.1 ? 'ultimos_lugares' : 'disponible';
}

type Ordenable = { inicio: string | Date; sede: { nombre: string }; obra: { titulo: string } };

/** RN-006: inicio, luego sede, luego título. */
export function ordenarDia<T extends Ordenable>(funciones: readonly T[]): T[] {
  const ms = (d: string | Date) => new Date(d).getTime();
  return [...funciones].sort(
    (a, b) =>
      ms(a.inicio) - ms(b.inicio) ||
      a.sede.nombre.localeCompare(b.sede.nombre, 'es') ||
      a.obra.titulo.localeCompare(b.obra.titulo, 'es'),
  );
}
