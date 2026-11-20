/**
 * Puntajes de curaduría (RN-001/RN-002, research R5). Todo el cálculo usa centésimas enteras:
 * un puntaje de 79,00 se representa como 7900, así que no hay coma flotante ni acumulación de error.
 */
export const UMBRAL_DELIBERACION = 25;
const UMBRAL_DELIBERACION_CENTESIMAS = UMBRAL_DELIBERACION * 100;

export interface CriterioPeso { id: string; peso: number }
export interface CalificacionCriterio { criterioId: string; puntaje: number }

/** Valida una calificación individual (entero 0–100). */
export function validarCalificacion(puntaje: number): void {
  if (!Number.isInteger(puntaje) || puntaje < 0 || puntaje > 100) {
    throw new Error('Cada calificación debe ser un entero entre 0 y 100');
  }
}

/** Σ(calificación × peso) / 100, expresado en centésimas: la suma de productos ya es exacta. */
export function calcularPuntajePonderado(calificaciones: CalificacionCriterio[], criterios: CriterioPeso[]): number {
  if (criterios.reduce((suma, c) => suma + c.peso, 0) !== 100) throw new Error('Los pesos de los criterios no suman 100');
  const pesos = new Map(criterios.map((c) => [c.id, c.peso]));
  const vistos = new Set<string>();
  let total = 0;
  for (const { criterioId, puntaje } of calificaciones) {
    validarCalificacion(puntaje);
    if (!pesos.has(criterioId)) throw new Error('Un criterio no pertenece a la convocatoria');
    if (vistos.has(criterioId)) throw new Error('Hay criterios repetidos en la evaluación');
    vistos.add(criterioId);
    total += puntaje * pesos.get(criterioId)!;
  }
  if (vistos.size !== pesos.size) throw new Error('La evaluación debe calificar todos los criterios');
  return total;
}

/** Promedio aritmético redondeado half-up a centésimas enteras. */
export function promediarPuntajes(centesimas: number[]): number {
  if (!centesimas.length) throw new Error('Se necesita al menos una evaluación para promediar');
  const n = centesimas.length;
  const suma = centesimas.reduce((a, b) => a + b, 0);
  return Math.floor((2 * suma + n) / (2 * n));
}

/** FR-010: máximo − mínimo estrictamente mayor que 25 puntos. */
export function hayDispersion(centesimas: number[]): boolean {
  if (centesimas.length < 2) return false;
  return Math.max(...centesimas) - Math.min(...centesimas) > UMBRAL_DELIBERACION_CENTESIMAS;
}

/** Serializa centésimas con siempre dos decimales ("79.00"). */
export function formatearPuntaje(centesimas: number): string {
  const entero = Math.trunc(centesimas / 100);
  const decimales = String(Math.abs(centesimas % 100)).padStart(2, '0');
  return `${entero}.${decimales}`;
}

/** Lee un decimal ("79.00", Prisma.Decimal.toString()) como centésimas enteras. */
export function centesimasDesdeDecimal(valor: { toString(): string } | string | number): number {
  const [entero = '0', fraccion = ''] = String(valor.toString()).split('.');
  return Number(entero) * 100 + Number(fraccion.padEnd(2, '0').slice(0, 2));
}
