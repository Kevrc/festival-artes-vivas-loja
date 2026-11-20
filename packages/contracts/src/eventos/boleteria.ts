import { z } from 'zod';
import { sobre } from './sobre';

const instante = z.string().datetime({ offset: true });

export const DisponibilidadCambiada = sobre(
  'DisponibilidadCambiada',
  z.object({
    funcionId: z.string().uuid(),
    lugaresRestantes: z.number().int().min(0),
    aforoHabilitado: z.number().int().positive(),
    calculadoEn: instante,
  }),
);

export const EntradasEmitidas = sobre(
  'EntradasEmitidas',
  z.object({
    pedidoId: z.string().uuid(),
    funcionId: z.string().uuid(),
    sedeId: z.string().uuid(),
    canal: z.enum(['web', 'taquilla', 'cambio']),
    tipo: z.enum(['compra', 'reserva']),
    cantidad: z.number().int().min(1),
    importeCentavos: z.number().int().min(0),
    cuentaId: z.string().uuid().optional(),
    correoDestino: z.string().email().optional(),
    entradas: z
      .array(
        z.object({
          entradaId: z.string().uuid(),
          codigoCorto: z.string().min(4),
          tokenQr: z.string().min(1),
        }),
      )
      .min(1),
  }),
);

export const IngresoRegistrado = sobre(
  'IngresoRegistrado',
  z.object({
    ingresoId: z.string().uuid(),
    entradaId: z.string().uuid(),
    funcionId: z.string().uuid(),
    sedeId: z.string().uuid(),
    validadorId: z.string().uuid(),
    escaneadoEn: instante,
    diferido: z.boolean(),
  }),
);

export const PedidoReembolsado = sobre(
  'PedidoReembolsado',
  z.object({
    pedidoId: z.string().uuid(),
    funcionId: z.string().uuid(),
    sedeId: z.string().uuid(),
    importeCentavos: z.number().int().positive(),
    canal: z.enum(['web', 'taquilla']),
    motivo: z.enum(['funcion_cancelada', 'funcion_reprogramada', 'pago_tardio_sin_cupo', 'plazo_7_dias_vencido']),
    cuentaId: z.string().uuid().optional(),
    correoDestino: z.string().email().optional(),
  }),
);

export const ConflictoDeIngreso = sobre(
  'ConflictoDeIngreso',
  z.object({
    entradaId: z.string().uuid(),
    funcionId: z.string().uuid(),
    sedeId: z.string().uuid(),
    primerDispositivoId: z.string().min(1),
    segundoDispositivoId: z.string().min(1),
    detectadoEn: instante,
  }),
);

export const AforoExcedido = sobre(
  'AforoExcedido',
  z.object({
    funcionId: z.string().uuid(),
    sedeId: z.string().uuid(),
    aforoHabilitado: z.number().int().min(0),
    entradasActivas: z.number().int().positive(),
    exceso: z.number().int().positive(),
  }),
);
