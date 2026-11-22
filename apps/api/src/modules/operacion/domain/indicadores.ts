/**
 * Indicadores del festival (US5, FR-009, FR-010, RN-003, RN-004). Funciones puras: importes en
 * centavos enteros (Constitución V); la ocupación solo cuenta funciones con aforo habilitado.
 */
export type Dimension = 'dia' | 'sede' | 'disciplina' | 'componente' | 'pais' | 'funcion';

export interface DatoFuncion {
  funcionId: string;
  titulo: string;
  dia: string;
  sedeId: string;
  sedeNombre: string;
  disciplina: string;
  componente: string;
  pais: string;
  obraId: string;
  elencoId: string;
  estado: 'borrador' | 'programada' | 'reprogramada' | 'cancelada';
  fin: Date;
  aforoHabilitado: number | null;
  emitidas: number;
  reembolsadas: number;
  ingresos: number;
  recaudacionCentavos: number;
  /** Último conteo estimado (el vigente, US4-AS1), o 0. */
  estimado: number;
}

export interface FilaIndicador {
  clave: string;
  etiqueta: string;
  funcionesRealizadas: number;
  funcionesCanceladas: number;
  entradasEmitidas: number;
  ingresosValidados: number;
  asistenciaEstimada: number;
  /** RN-004: validada + estimada, con el desglose a la vista. */
  asistenciaTotal: number;
  /** RN-003: ingresos ÷ aforo habilitado, de 0 a 1; null si ninguna función tiene aforo. */
  ocupacion: number | null;
  recaudacionCentavos: number;
}

/** Realizada: publicada, no cancelada y ya terminada (el estado `finalizada` se deriva, research R8). */
export const realizada = (f: Pick<DatoFuncion, 'estado' | 'fin'>, ahora: Date) =>
  (f.estado === 'programada' || f.estado === 'reprogramada') && f.fin.getTime() <= ahora.getTime();

/** RN-003. Ejemplo US5-AS1: aforo 200 y 150 ingresos ⇒ 0,75. */
export function ocupacion(ingresos: number, aforo: number | null): number | null {
  if (!aforo || aforo <= 0) return null;
  return ingresos / aforo;
}

export function fila(clave: string, etiqueta: string, funciones: readonly DatoFuncion[], ahora: Date): FilaIndicador {
  let realizadas = 0;
  let canceladas = 0;
  let emitidas = 0;
  let ingresos = 0;
  let estimada = 0;
  let recaudacion = 0;
  let ingresosConAforo = 0;
  let aforo = 0;
  for (const f of funciones) {
    if (f.estado === 'borrador') continue;
    if (f.estado === 'cancelada') canceladas++;
    const hecha = realizada(f, ahora);
    if (hecha) realizadas++;
    emitidas += f.emitidas - f.reembolsadas;
    ingresos += f.ingresos;
    estimada += f.estimado;
    recaudacion += f.recaudacionCentavos;
    if (hecha && f.aforoHabilitado && f.aforoHabilitado > 0) {
      ingresosConAforo += f.ingresos;
      aforo += f.aforoHabilitado;
    }
  }
  return {
    clave,
    etiqueta,
    funcionesRealizadas: realizadas,
    funcionesCanceladas: canceladas,
    entradasEmitidas: emitidas,
    ingresosValidados: ingresos,
    asistenciaEstimada: estimada,
    asistenciaTotal: ingresos + estimada,
    ocupacion: ocupacion(ingresosConAforo, aforo),
    recaudacionCentavos: recaudacion,
  };
}

const CLAVE: Record<Dimension, (f: DatoFuncion) => [string, string]> = {
  dia: (f) => [f.dia, f.dia],
  sede: (f) => [f.sedeId, f.sedeNombre],
  disciplina: (f) => [f.disciplina, f.disciplina],
  componente: (f) => [f.componente, f.componente],
  pais: (f) => [f.pais, f.pais],
  funcion: (f) => [f.funcionId, `${f.dia} · ${f.titulo}`],
};

/** Filas por dimensión (ordenadas por clave) y totales. */
export function agrupar(dimension: Dimension, funciones: readonly DatoFuncion[], ahora: Date): { totales: FilaIndicador; filas: FilaIndicador[] } {
  const grupos = new Map<string, { etiqueta: string; funciones: DatoFuncion[] }>();
  for (const f of funciones) {
    const [clave, etiqueta] = CLAVE[dimension](f);
    const g = grupos.get(clave) ?? { etiqueta, funciones: [] };
    g.funciones.push(f);
    grupos.set(clave, g);
  }
  const filas = [...grupos.entries()]
    .map(([clave, g]) => fila(clave, g.etiqueta, g.funciones, ahora))
    .sort((a, b) => (dimension === 'dia' || dimension === 'funcion' ? a.etiqueta.localeCompare(b.etiqueta) : a.etiqueta.localeCompare(b.etiqueta, 'es')));
  return { totales: fila('total', 'Total', funciones, ahora), filas };
}

/** Variación porcentual frente a la edición anterior, con un decimal; null si no hay base. */
export function variacion(actual: number | null, anterior: number | null | undefined): number | null {
  if (actual === null || anterior === null || anterior === undefined || anterior === 0) return null;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

const COLUMNAS: [keyof FilaIndicador, string][] = [
  ['etiqueta', 'Grupo'],
  ['funcionesRealizadas', 'Funciones realizadas'],
  ['funcionesCanceladas', 'Funciones canceladas'],
  ['entradasEmitidas', 'Entradas emitidas'],
  ['ingresosValidados', 'Asistencia validada'],
  ['asistenciaEstimada', 'Asistencia estimada'],
  ['asistenciaTotal', 'Asistencia total'],
  ['ocupacion', 'Ocupación (%)'],
  ['recaudacionCentavos', 'Recaudación (USD)'],
];

const celda = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** Evita que una hoja de cálculo interprete texto como fórmula (inyección CSV). */
const seguro = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** US5-AS3: CSV UTF-8 con BOM y separador `;` (lo abre Excel en español), decimales con coma. */
export function aCsv(datos: { totales: FilaIndicador; filas: FilaIndicador[] }): string {
  const valor = (f: FilaIndicador, k: keyof FilaIndicador): string => {
    const v = f[k];
    if (k === 'ocupacion') return v === null ? '' : ((v as number) * 100).toFixed(1).replace('.', ',');
    if (k === 'recaudacionCentavos') return ((v as number) / 100).toFixed(2).replace('.', ',');
    return celda(seguro(String(v)));
  };
  const lineas = [COLUMNAS.map(([, t]) => t).join(';'), ...[...datos.filas, datos.totales].map((f) => COLUMNAS.map(([k]) => valor(f, k)).join(';'))];
  return `\u{FEFF}${lineas.join('\r\n')}\r\n`;
}
