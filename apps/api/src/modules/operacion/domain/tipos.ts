import type { Componente, Disciplina, Publico, TipoAcceso, TipoSede } from '@fiavl/contracts';
import type { z } from 'zod';

/** Tipos del dominio de Operación (spec 004, data-model.md §operacion). */
export type TipoAccesoFuncion = z.infer<typeof TipoAcceso>;
export type PublicoFuncion = z.infer<typeof Publico>;
export type DisciplinaObra = z.infer<typeof Disciplina>;
export type ComponenteObra = z.infer<typeof Componente>;
export type TipoSedeOperacion = z.infer<typeof TipoSede>;

export type EstadoEdicion = 'planificacion' | 'publicada' | 'cerrada';
/** `finalizada` no se guarda: se deriva (research R8). */
export type EstadoFuncionGuardado = 'borrador' | 'programada' | 'reprogramada' | 'cancelada';
export type EstadoFuncion = EstadoFuncionGuardado | 'finalizada';
export type EstadoObra = 'disponible' | 'desistida';

export interface Accesibilidad {
  sillaRuedas: boolean;
  banoAccesible: boolean;
  rampa: boolean;
}

/** `finalizada` = pasó su hora de fin y no está cancelada (RN-005). */
export function estadoVisible(estado: EstadoFuncionGuardado, fin: Date, ahora: Date): EstadoFuncion {
  if (estado !== 'cancelada' && estado !== 'borrador' && fin.getTime() <= ahora.getTime()) return 'finalizada';
  return estado;
}

/** La sede guarda la accesibilidad como JSON libre: se completa con `false` (Constitución VII: siempre visible). */
export function normalizarAccesibilidad(valor: unknown): Accesibilidad {
  const v = (typeof valor === 'object' && valor ? valor : {}) as Partial<Accesibilidad>;
  return { sillaRuedas: v.sillaRuedas === true, banoAccesible: v.banoAccesible === true, rampa: v.rampa === true };
}
