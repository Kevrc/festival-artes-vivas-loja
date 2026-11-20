import { z } from 'zod';
import type { PedidoRegistro } from '../application/puertos';
import { formatearCodigoCorto } from '../domain/firma-qr';

export const UuidSchema = z.string().uuid();
export const IdempotencyKeySchema = z.string().min(8).max(128);

export const SolicitudCompraSchema = z.object({
  funcionId: z.string().uuid(),
  cantidad: z.number().int().min(1).max(20),
});

export const SolicitudEleccionCancelacionSchema = z.object({
  eleccion: z.enum(['devolucion', 'cambio']),
  nuevaFuncionId: z.string().uuid().optional(),
});

export const WebhookPagoSchema = z.object({
  pedidoId: z.string().uuid(),
  referenciaProveedor: z.string().min(1),
  resultado: z.enum(['aprobado', 'rechazado']),
  importeCentavos: z.number().int().min(0),
});

export const SolicitudAbrirCajaSchema = z.object({
  sedeId: z.string().uuid(),
  fondoInicialCentavos: z.number().int().min(0),
});

export const SolicitudCerrarCajaSchema = z.object({
  efectivoDeclaradoCentavos: z.number().int().min(0),
});

export const SolicitudVentaTaquillaSchema = z.object({
  cajaId: z.string().uuid(),
  funcionId: z.string().uuid(),
  cantidad: z.number().int().min(1).max(20),
  medioPago: z.enum(['efectivo', 'tarjeta_datafono']),
  correoComprador: z.string().email().optional(),
});

export const SolicitudDevolucionTaquillaSchema = z.object({
  cajaId: z.string().uuid(),
  codigoEntrada: z.string().min(4),
});

export const SolicitudValidacionSchema = z
  .object({
    funcionId: z.string().uuid(),
    tokenQr: z.string().min(1).optional(),
    codigoCorto: z.string().min(4).optional(),
    dispositivoId: z.string().min(1),
    puerta: z.string().min(1),
  })
  .refine((v) => Boolean(v.tokenQr || v.codigoCorto), {
    message: 'Debe proporcionar tokenQr o codigoCorto',
  });

export const SolicitudSincronizacionSchema = z.object({
  ingresos: z
    .array(
      z.object({
        entradaId: z.string().uuid(),
        funcionId: z.string().uuid(),
        dispositivoId: z.string().min(1),
        puerta: z.string().min(1),
        escaneadoEn: z.string().datetime({ offset: true }),
        desfaseMs: z.number().int(),
      }),
    )
    .max(500),
});

export function aPedidoDetalleDto(p: PedidoRegistro) {
  return {
    id: p.id,
    funcionId: p.funcionId,
    obraTitulo: p.obraTitulo,
    sedeNombre: p.sedeNombre,
    inicio: p.inicio.toISOString(),
    canal: p.canal,
    tipo: p.tipo,
    cantidad: p.cantidad,
    importeCentavos: p.importeCentavos,
    estado: p.estado,
    venceEn: p.venceEn ? p.venceEn.toISOString() : null,
    resolucionCancelacion: p.resolucionCancelacion,
    plazoEleccionHasta: p.plazoEleccionHasta ? p.plazoEleccionHasta.toISOString() : null,
    creadoEn: p.creadoEn.toISOString(),
    entradas: p.entradas.map((e) => ({
      id: e.id,
      funcionId: e.funcionId,
      tokenQr: e.tokenQr,
      codigoCorto: formatearCodigoCorto(e.codigoCorto),
      estado: e.estado,
      emitidaEn: e.emitidaEn.toISOString(),
    })),
  };
}
