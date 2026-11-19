import { ZONA } from './formato';
import type { FuncionResumen } from './tipos';

/** Parámetros de filtro de contracts/rutas-web.md. */
export const PARAMETROS = ['disciplina', 'sede', 'acceso', 'pais', 'componente', 'publico', 'franja'] as const;
export type Parametro = (typeof PARAMETROS)[number];
export type Filtros = Partial<Record<Parametro, string[]>>;

const PERMITIDOS: Partial<Record<Parametro, readonly string[]>> = {
  disciplina: ['teatro', 'danza', 'circo', 'musica', 'titeres', 'exposicion', 'taller', 'calle', 'cine'],
  acceso: ['pagada', 'gratuita_reserva', 'gratuita_libre', 'restringida'],
  componente: ['internacional', 'nacional', 'camino_a_loja', 'escuela', 'salud_arte'],
  publico: ['familiar', 'adultos', 'estudiantes'],
  franja: ['manana', 'tarde', 'noche'],
};

const horaEcuador = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hourCycle: 'h23' });

/** mañana < 12:00 ≤ tarde < 19:00 ≤ noche (rutas-web.md). */
export function franjaDe(inicio: string): 'manana' | 'tarde' | 'noche' {
  const h = Number(horaEcuador.format(new Date(inicio)));
  return h < 12 ? 'manana' : h < 19 ? 'tarde' : 'noche';
}

const valorDe: Record<Parametro, (f: FuncionResumen) => string> = {
  disciplina: (f) => f.obra.disciplina,
  sede: (f) => f.sede.id,
  acceso: (f) => f.tipoAcceso,
  pais: (f) => f.obra.elenco.pais,
  componente: (f) => f.obra.componente,
  publico: (f) => f.publico,
  franja: (f) => franjaDe(f.inicio),
};

/** O entre valores de un parámetro, Y entre parámetros (US2-AS1). */
export function aplicarFiltros(funciones: FuncionResumen[], filtros: Filtros): FuncionResumen[] {
  const activos = PARAMETROS.filter((p) => filtros[p]?.length);
  return funciones.filter((f) => activos.every((p) => filtros[p]!.includes(valorDe[p](f))));
}

/** Lee los filtros de la URL; los valores desconocidos se ignoran sin error. */
export function leerFiltros(params: URLSearchParams): Filtros {
  const filtros: Filtros = {};
  for (const p of PARAMETROS) {
    const valores = (params.get(p) ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v && (!PERMITIDOS[p] || PERMITIDOS[p]!.includes(v)));
    if (valores.length) filtros[p] = [...new Set(valores)];
  }
  return filtros;
}

export function escribirFiltros(filtros: Filtros): string {
  const params = new URLSearchParams();
  for (const p of PARAMETROS) if (filtros[p]?.length) params.set(p, filtros[p]!.join(','));
  return params.toString();
}

export const hayFiltros = (filtros: Filtros) => PARAMETROS.some((p) => filtros[p]?.length);

/** Quita el último valor del último parámetro activo (US2-AS3). */
export function quitarUltimo(filtros: Filtros): Filtros {
  const ultimo = [...PARAMETROS].reverse().find((p) => filtros[p]?.length);
  if (!ultimo) return filtros;
  const resto = filtros[ultimo]!.slice(0, -1);
  const { [ultimo]: _quitado, ...otros } = filtros;
  return resto.length ? { ...otros, [ultimo]: resto } : otros;
}
