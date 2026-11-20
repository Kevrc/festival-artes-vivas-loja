import type { z } from 'zod';
import type {
  AforoExcedido,
  ConflictoDeIngreso,
  DisponibilidadCambiada,
  EntradasEmitidas,
  IngresoRegistrado,
  PedidoReembolsado,
} from './boleteria';
import type {
  AforoCambiado,
  FuncionCancelada,
  FuncionProgramada,
  FuncionReprogramada,
  ProgramacionPublicada,
} from './operacion';

/** Constructores de eventos válidos para pruebas, semilla y `events:emit`. */
const meta = (edicionId: string) => ({
  id: crypto.randomUUID(),
  version: 1 as const,
  ocurridoEn: new Date().toISOString(),
  edicionId,
  correlacionId: crypto.randomUUID(),
});

type Datos<T extends z.ZodTypeAny> = z.infer<T>['datos'];

export const ejemplo = {
  programacionPublicada: (edicionId: string, datos: Datos<typeof ProgramacionPublicada>): z.infer<typeof ProgramacionPublicada> => ({
    ...meta(edicionId),
    tipo: 'ProgramacionPublicada',
    datos,
  }),
  funcionProgramada: (edicionId: string, datos: Datos<typeof FuncionProgramada>): z.infer<typeof FuncionProgramada> => ({
    ...meta(edicionId),
    tipo: 'FuncionProgramada',
    datos,
  }),
  funcionReprogramada: (edicionId: string, datos: Datos<typeof FuncionReprogramada>): z.infer<typeof FuncionReprogramada> => ({
    ...meta(edicionId),
    tipo: 'FuncionReprogramada',
    datos,
  }),
  funcionCancelada: (edicionId: string, datos: Datos<typeof FuncionCancelada>): z.infer<typeof FuncionCancelada> => ({
    ...meta(edicionId),
    tipo: 'FuncionCancelada',
    datos,
  }),
  aforoCambiado: (edicionId: string, datos: Datos<typeof AforoCambiado>): z.infer<typeof AforoCambiado> => ({
    ...meta(edicionId),
    tipo: 'AforoCambiado',
    datos,
  }),
  disponibilidadCambiada: (edicionId: string, datos: Datos<typeof DisponibilidadCambiada>): z.infer<typeof DisponibilidadCambiada> => ({
    ...meta(edicionId),
    tipo: 'DisponibilidadCambiada',
    datos,
  }),
  entradasEmitidas: (edicionId: string, datos: Datos<typeof EntradasEmitidas>): z.infer<typeof EntradasEmitidas> => ({
    ...meta(edicionId),
    tipo: 'EntradasEmitidas',
    datos,
  }),
  ingresoRegistrado: (edicionId: string, datos: Datos<typeof IngresoRegistrado>): z.infer<typeof IngresoRegistrado> => ({
    ...meta(edicionId),
    tipo: 'IngresoRegistrado',
    datos,
  }),
  pedidoReembolsado: (edicionId: string, datos: Datos<typeof PedidoReembolsado>): z.infer<typeof PedidoReembolsado> => ({
    ...meta(edicionId),
    tipo: 'PedidoReembolsado',
    datos,
  }),
  conflictoDeIngreso: (edicionId: string, datos: Datos<typeof ConflictoDeIngreso>): z.infer<typeof ConflictoDeIngreso> => ({
    ...meta(edicionId),
    tipo: 'ConflictoDeIngreso',
    datos,
  }),
  aforoExcedido: (edicionId: string, datos: Datos<typeof AforoExcedido>): z.infer<typeof AforoExcedido> => ({
    ...meta(edicionId),
    tipo: 'AforoExcedido',
    datos,
  }),
};
