/**
 * Agenda y cruces (spec 004: RN-001, RN-002, FR-002, FR-003; research R1; ADR-0010).
 * Dominio puro: sin Prisma ni Nest. La base de datos repite la garantía con restricciones EXCLUDE.
 */

export interface Intervalo {
  desde: Date;
  /** Exclusivo: [desde, hasta). */
  hasta: Date;
}

/** Lo que la agenda necesita saber de una función para detectar cruces. */
export interface FuncionAgenda {
  id: string;
  sedeId: string;
  sedeNombre: string;
  /** `sede.montaje_min`: intervalo mínimo entre funciones de la sede (desmontar + montar). */
  montajeMin: number;
  elencoId: string;
  obraTitulo: string;
  inicio: Date;
  fin: Date;
  continua: boolean;
  /** false si está cancelada: ya no ocupa la sede. */
  activa: boolean;
}

export interface Conflicto {
  tipo: 'sede' | 'elenco';
  funcionId: string;
  obraTitulo: string;
  sedeNombre: string;
  inicio: Date;
  fin: Date;
  /** Primer inicio posible tras la función en conflicto (con montaje si es de sede). */
  libreDesde: Date;
}

export interface Bloque {
  sede: Intervalo;
  elenco: Intervalo;
}

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
/** Loja no tiene horario de verano: UTC−5 todo el año. */
const DESFASE_LOJA = -5 * 60 * MINUTO;

/** RN-002: fin = inicio + duración de la obra. */
export const calcularFin = (inicio: Date, duracionMin: number): Date => new Date(inicio.getTime() + duracionMin * MINUTO);

/** RN-002: el fin solo se puede alargar respecto al calculado. */
export function validarFinPedido(
  calculado: Date,
  pedido: Date | undefined,
): { ok: true; fin: Date } | { ok: false; codigo: 'fin_menor' } {
  if (!pedido) return { ok: true, fin: calculado };
  if (pedido.getTime() < calculado.getTime()) return { ok: false, codigo: 'fin_menor' };
  return { ok: true, fin: pedido };
}

/**
 * Tramos de ocupación. Una actividad continua (exposición) ocupa cada día el mismo horario, desde
 * el día de `inicio` hasta el de `fin` (caso borde de la spec).
 */
export function tramosDe(f: Pick<FuncionAgenda, 'inicio' | 'fin' | 'continua'>): Intervalo[] {
  if (!f.continua) return [{ desde: f.inicio, hasta: f.fin }];
  const duracionDiaria = (f.fin.getTime() - f.inicio.getTime()) % DIA || DIA;
  const tramos: Intervalo[] = [];
  for (let d = f.inicio.getTime(); d < f.fin.getTime(); d += DIA) {
    tramos.push({ desde: new Date(d), hasta: new Date(d + duracionDiaria) });
  }
  return tramos;
}

/** Bloques que se guardan en `bloque_ocupacion`: la sede suma su montaje; el elenco no. */
export function bloquesDe(f: Pick<FuncionAgenda, 'inicio' | 'fin' | 'continua' | 'montajeMin'>): Bloque[] {
  return tramosDe(f).map((t) => ({
    sede: { desde: t.desde, hasta: new Date(t.hasta.getTime() + f.montajeMin * MINUTO) },
    elenco: { desde: t.desde, hasta: t.hasta },
  }));
}

const seSolapan = (a: Intervalo, b: Intervalo) => a.desde < b.hasta && b.desde < a.hasta;

/**
 * RN-001 y FR-003: devuelve las funciones con las que choca `candidata`, con los datos para
 * mostrarlas (US1-AS2). Dos funciones de la misma sede chocan si `[inicio, fin + montaje)` se
 * solapan; un elenco choca si `[inicio, fin)` se solapan en cualquier sede.
 */
export function detectarConflictos(candidata: FuncionAgenda, existentes: readonly FuncionAgenda[]): Conflicto[] {
  const propios = bloquesDe(candidata);
  const conflictos: Conflicto[] = [];
  for (const otra of existentes) {
    if (otra.id === candidata.id || !otra.activa) continue;
    const ajenos = bloquesDe(otra);
    const datos = { funcionId: otra.id, obraTitulo: otra.obraTitulo, sedeNombre: otra.sedeNombre, inicio: otra.inicio, fin: otra.fin };
    if (otra.sedeId === candidata.sedeId) {
      const choque = ajenos.find((b) => propios.some((p) => seSolapan(p.sede, b.sede)));
      if (choque) conflictos.push({ tipo: 'sede', ...datos, libreDesde: choque.sede.hasta });
    }
    if (otra.elencoId === candidata.elencoId) {
      const choque = ajenos.find((b) => propios.some((p) => seSolapan(p.elenco, b.elenco)));
      if (choque) conflictos.push({ tipo: 'elenco', ...datos, libreDesde: choque.elenco.hasta });
    }
  }
  return conflictos;
}

/** Día del festival (YYYY-MM-DD en Loja). Una función que cruza medianoche cuenta para su día de inicio. */
export const diaFestival = (instante: Date): string => new Date(instante.getTime() + DESFASE_LOJA).toISOString().slice(0, 10);

/** [00:00, 24:00) de un día en Loja. */
export function rangoDelDia(fecha: string): Intervalo {
  const desde = new Date(Date.parse(`${fecha}T00:00:00Z`) - DESFASE_LOJA);
  return { desde, hasta: new Date(desde.getTime() + DIA) };
}

/** Feriados dentro del festival: solo informativos, no bloquean (caso borde de la spec). */
const FERIADOS: Readonly<Record<string, string>> = { '2026-11-20': 'Feriado nacional' };

export const feriadoDe = (fecha: string): string | null => FERIADOS[fecha] ?? null;
