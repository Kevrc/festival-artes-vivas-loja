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

export type CodigoCambioRechazado = 'motivo_requerido' | 'funcion_finalizada' | 'edicion_cerrada' | 'funcion_en_borrador' | 'funcion_cancelada';
export type ResultadoCambio = { ok: true; estado: EstadoFuncionGuardado; version: number } | { ok: false; codigo: CodigoCambioRechazado };

interface FuncionCambiable {
  estado: EstadoFuncionGuardado;
  version: number;
  fin: Date;
}

interface Contexto {
  edicionCerrada: boolean;
  ahora: Date;
}

/** Longitud mínima del motivo (contrato: `motivo` de 3 a 500 caracteres). */
const MOTIVO_MINIMO = 3;

function puedeCambiar(f: FuncionCambiable, motivo: string | undefined, c: Contexto): CodigoCambioRechazado | null {
  if (c.edicionCerrada) return 'edicion_cerrada'; // RN-007
  if (f.estado === 'borrador') return 'funcion_en_borrador'; // se edita o se elimina
  if (f.estado === 'cancelada') return 'funcion_cancelada';
  if (c.ahora.getTime() >= f.fin.getTime()) return 'funcion_finalizada'; // RN-005, US3-AS5
  if ((motivo ?? '').trim().length < MOTIVO_MINIMO) return 'motivo_requerido'; // US3-AS4, FR-006
  return null;
}

/** Programada o reprogramada → reprogramada, siempre con motivo (US3-AS1). */
export function reprogramar(f: FuncionCambiable, motivo: string | undefined, c: Contexto): ResultadoCambio {
  const rechazo = puedeCambiar(f, motivo, c);
  return rechazo ? { ok: false, codigo: rechazo } : { ok: true, estado: 'reprogramada', version: f.version + 1 };
}

/** Programada o reprogramada → cancelada, siempre con motivo (US3-AS3). */
export function cancelar(f: FuncionCambiable, motivo: string | undefined, c: Contexto): ResultadoCambio {
  const rechazo = puedeCambiar(f, motivo, c);
  return rechazo ? { ok: false, codigo: rechazo } : { ok: true, estado: 'cancelada', version: f.version + 1 };
}

/** US3-AS2: entradas activas por encima del nuevo aforo; sin aforo (acceso libre) no hay exceso. */
export const excesoDeAforo = (entradasActivas: number, aforoNuevo: number | null): number =>
  aforoNuevo === null ? 0 : Math.max(0, entradasActivas - aforoNuevo);
