import { z } from 'zod';
import { DisponibilidadCambiada } from './boleteria';
import {
  FuncionActualizada,
  FuncionCancelada,
  FuncionProgramada,
  FuncionReprogramada,
  ProgramacionPublicada,
} from './operacion';

export * from './boleteria';
export * from './operacion';
export * from './ejemplos';

/** Eventos que consume Programación (spec 001). */
export const EventoCartelera = z.discriminatedUnion('tipo', [
  ProgramacionPublicada,
  FuncionProgramada,
  FuncionActualizada,
  FuncionReprogramada,
  FuncionCancelada,
  DisponibilidadCambiada,
]);
export type EventoCartelera = z.infer<typeof EventoCartelera>;
export type TipoEventoCartelera = EventoCartelera['tipo'];

/** Nombre de cola pg-boss de un evento para un módulo: programacion.funcion-cancelada (ADR-0003). */
export const colaDe = (modulo: string, tipo: string) =>
  `${modulo}.${tipo.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`;

export const TIPOS_EVENTO_CARTELERA = [
  'ProgramacionPublicada',
  'FuncionProgramada',
  'FuncionActualizada',
  'FuncionReprogramada',
  'FuncionCancelada',
  'DisponibilidadCambiada',
] as const satisfies readonly TipoEventoCartelera[];
