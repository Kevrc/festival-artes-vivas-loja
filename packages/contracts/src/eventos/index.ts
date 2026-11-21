import { z } from 'zod';
import {
  AforoExcedido,
  ConflictoDeIngreso,
  DisponibilidadCambiada,
  EntradasEmitidas,
  IngresoRegistrado,
  PedidoReembolsado,
} from './boleteria';
import {
  AforoCambiado,
  FuncionActualizada,
  FuncionCancelada,
  FuncionProgramada,
  FuncionReprogramada,
  ProgramacionPublicada,
} from './operacion';

export * from './boleteria';
export * from './convocatorias-pendientes';
export * from './identidad';
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

/** Eventos de Operación que consume Boletería (spec 002). */
export const EventoOperacionBoleteria = z.discriminatedUnion('tipo', [
  ProgramacionPublicada,
  FuncionProgramada,
  FuncionActualizada,
  FuncionReprogramada,
  FuncionCancelada,
  AforoCambiado,
]);
export type EventoOperacionBoleteria = z.infer<typeof EventoOperacionBoleteria>;
export type TipoEventoOperacionBoleteria = EventoOperacionBoleteria['tipo'];

/** Eventos de dominio publicados por Boletería (spec 002). */
export const EventoPublicadoBoleteria = z.discriminatedUnion('tipo', [
  DisponibilidadCambiada,
  EntradasEmitidas,
  IngresoRegistrado,
  PedidoReembolsado,
  ConflictoDeIngreso,
  AforoExcedido,
]);
export type EventoPublicadoBoleteria = z.infer<typeof EventoPublicadoBoleteria>;

/** Todos los eventos que publica Operación (spec 004): destinos en su publicador. */
export const EventoPublicadoOperacion = z.discriminatedUnion('tipo', [
  ProgramacionPublicada,
  FuncionProgramada,
  FuncionActualizada,
  FuncionReprogramada,
  FuncionCancelada,
  AforoCambiado,
]);
export type EventoPublicadoOperacion = z.infer<typeof EventoPublicadoOperacion>;

/** Eventos de Operación que consume Identidad para redactar avisos (spec 004, US10). */
export const EventoOperacionIdentidad = z.discriminatedUnion('tipo', [
  ProgramacionPublicada,
  FuncionProgramada,
  FuncionActualizada,
  FuncionReprogramada,
  FuncionCancelada,
]);
export type EventoOperacionIdentidad = z.infer<typeof EventoOperacionIdentidad>;

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

export const TIPOS_EVENTO_BOLETERIA = [
  'ProgramacionPublicada',
  'FuncionProgramada',
  'FuncionActualizada',
  'FuncionReprogramada',
  'FuncionCancelada',
  'AforoCambiado',
] as const satisfies readonly TipoEventoOperacionBoleteria[];
