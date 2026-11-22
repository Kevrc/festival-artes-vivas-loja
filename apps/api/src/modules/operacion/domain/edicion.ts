/**
 * Datos maestros de Operación: ediciones y sedes (US6, FR-001, data-model §edicion y §sede).
 * Funciones puras; las advertencias no bloquean y los errores sí.
 */
export interface ParametrosEdicion {
  fechaInicio: string;
  fechaFin: string;
  precioCentavos: number;
  maxPagadasPersona: number;
  maxReservasPersona: number;
}

export type ErrorEdicion = 'fechas_invertidas' | 'precio_invalido' | 'limite_invalido';

export function validarEdicion(e: ParametrosEdicion): ErrorEdicion[] {
  const errores: ErrorEdicion[] = [];
  if (e.fechaFin < e.fechaInicio) errores.push('fechas_invertidas');
  if (!Number.isInteger(e.precioCentavos) || e.precioCentavos < 0) errores.push('precio_invalido');
  if (!Number.isInteger(e.maxPagadasPersona) || e.maxPagadasPersona < 1 || !Number.isInteger(e.maxReservasPersona) || e.maxReservasPersona < 1) {
    errores.push('limite_invalido');
  }
  return errores;
}

/** US6-AS2: la ley fija el festival en noviembre; otras fechas se advierten, no se bloquean. */
export function advertenciasEdicion(e: Pick<ParametrosEdicion, 'fechaInicio' | 'fechaFin'>): string[] {
  const fueraDeNoviembre = [e.fechaInicio, e.fechaFin].some((f) => f.slice(5, 7) !== '11');
  return fueraDeNoviembre ? ['La ley fija el festival en noviembre: revisa las fechas de la edición.'] : [];
}

export type TipoSede = 'teatro' | 'centro_cultural' | 'museo' | 'espacio_publico' | 'recorrido';

export interface DatosSede {
  nombre: string;
  tipo: TipoSede;
  direccion: string;
  lat: number;
  lng: number;
  recorrido: { lat: number; lng: number; nombre?: string }[] | null;
  aforo: number | null;
  accesibilidad: { sillaRuedas: boolean; banoAccesible: boolean; rampa: boolean };
  montajeMin: number;
  horarioTaquilla: string | null;
  activa: boolean;
}

export type ErrorSede = 'aforo_requerido' | 'recorrido_requerido' | 'montaje_invalido' | 'coordenadas_invalidas';

/** Aforo obligatorio salvo espacio público y recorrido; puntos de paso obligatorios en recorridos. */
export function validarSede(s: DatosSede): ErrorSede[] {
  const errores: ErrorSede[] = [];
  const sinAforo = s.tipo === 'espacio_publico' || s.tipo === 'recorrido';
  if (!sinAforo && (s.aforo === null || !Number.isInteger(s.aforo) || s.aforo < 1)) errores.push('aforo_requerido');
  if (s.tipo === 'recorrido' && (!s.recorrido || s.recorrido.length < 2)) errores.push('recorrido_requerido');
  if (!Number.isInteger(s.montajeMin) || s.montajeMin < 0) errores.push('montaje_invalido');
  if (Math.abs(s.lat) > 90 || Math.abs(s.lng) > 180) errores.push('coordenadas_invalidas');
  return errores;
}

/**
 * US6-AS1: la edición nueva copia las sedes activas de la base (con `sede_origen_id`) y sus
 * parámetros de compra; nunca funciones ni obras.
 */
export function copiarSedes<S extends DatosSede & { id: string }>(sedes: readonly S[], nuevoId: () => string): (DatosSede & { id: string; sedeOrigenId: string })[] {
  return sedes
    .filter((s) => s.activa)
    .map((s) => ({
      id: nuevoId(),
      sedeOrigenId: s.id,
      nombre: s.nombre,
      tipo: s.tipo,
      direccion: s.direccion,
      lat: s.lat,
      lng: s.lng,
      recorrido: s.recorrido ? s.recorrido.map((p) => ({ ...p })) : null,
      aforo: s.aforo,
      accesibilidad: { ...s.accesibilidad },
      montajeMin: s.montajeMin,
      horarioTaquilla: s.horarioTaquilla,
      activa: true,
    }));
}

/** Parámetros de la edición nueva: los indicados o, si faltan, los de la edición base. */
export function parametrosDesde(
  base: Omit<ParametrosEdicion, 'fechaInicio' | 'fechaFin'> & { paisInvitado: string | null },
  pedido: Partial<Omit<ParametrosEdicion, 'fechaInicio' | 'fechaFin'>>,
): Omit<ParametrosEdicion, 'fechaInicio' | 'fechaFin'> {
  return {
    precioCentavos: pedido.precioCentavos ?? base.precioCentavos,
    maxPagadasPersona: pedido.maxPagadasPersona ?? base.maxPagadasPersona,
    maxReservasPersona: pedido.maxReservasPersona ?? base.maxReservasPersona,
  };
}
