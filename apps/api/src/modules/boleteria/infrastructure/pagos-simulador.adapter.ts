import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ConsultarPagoResultado,
  DevolverPagoResultado,
  IniciarCobroInput,
  IniciarCobroResultado,
  ProveedorPagos,
} from '../application/puertos';

export type ModoSimulador = 'normal' | 'caido' | 'siempre_aprobado' | 'siempre_rechazado';

/**
 * Adaptador determinista del proveedor de pagos para desarrollo local, CI y pruebas de concurrencia.
 * Implementa el puerto ProveedorPagos (ADR-0007).
 */
@Injectable()
export class SimuladorPagosAdapter implements ProveedorPagos {
  readonly nombre = 'simulador' as const;
  private modo: ModoSimulador = (process.env.BOLETERIA_SIMULADOR_MODO as ModoSimulador | undefined) ?? 'normal';
  private readonly cobros = new Map<string, { estado: 'pendiente' | 'aprobado' | 'rechazado'; referencia: string; importeCentavos: number }>();

  establecerModo(modo: ModoSimulador) {
    this.modo = modo;
  }

  forzarEstadoConsulta(pedidoId: string, estado: 'pendiente' | 'aprobado' | 'rechazado', importeCentavos: number) {
    this.cobros.set(pedidoId, {
      estado,
      referencia: `sim-ref-${pedidoId.slice(0, 8)}`,
      importeCentavos,
    });
  }

  async iniciarCobro(input: IniciarCobroInput): Promise<IniciarCobroResultado> {
    if (this.modo === 'caido') {
      throw new Error('Proveedor de pagos simulado temporalmente no disponible');
    }
    const referencia = `sim-int-${randomUUID().slice(0, 12)}`;
    const estadoInicial =
      this.modo === 'siempre_aprobado' ? 'aprobado' : this.modo === 'siempre_rechazado' ? 'rechazado' : 'pendiente';
    this.cobros.set(input.pedidoId, {
      estado: estadoInicial,
      referencia,
      importeCentavos: input.importeCentavos,
    });
    const baseWeb = process.env.WEB_URL ?? 'http://localhost:3100';
    return {
      urlPago: `${baseWeb}/pedidos/${input.pedidoId}/retorno?sim=1&ref=${referencia}`,
      referenciaIntencion: referencia,
    };
  }

  async consultarPago(pedidoId: string): Promise<ConsultarPagoResultado> {
    const reg = this.cobros.get(pedidoId);
    if (!reg) return { estado: 'pendiente' };
    return {
      estado: reg.estado,
      referenciaProveedor: reg.referencia,
      importeCentavos: reg.importeCentavos,
    };
  }

  async devolverPago(p: { pedidoId: string; referenciaCobro: string; importeCentavos: number }): Promise<DevolverPagoResultado> {
    if (this.modo === 'caido') {
      throw new Error('Proveedor de pagos simulado no disponible para reembolso');
    }
    return {
      referenciaDevolucion: `sim-dev-${p.pedidoId.slice(0, 8)}-${randomUUID().slice(0, 6)}`,
      aprobada: true,
    };
  }

  verificarWebhook(p: { firma: string; cuerpoCrudo: string }): boolean {
    const secreto = process.env.PAYPHONE_WEBHOOK_SECRET ?? 'secreto-webhook-dev';
    if (process.env.NODE_ENV !== 'production' && p.firma === 'simulador-firma-valida') {
      return true;
    }
    const esperada = createHmac('sha256', secreto).update(p.cuerpoCrudo).digest('hex');
    const a = Buffer.from(p.firma.trim(), 'utf8');
    const b = Buffer.from(esperada, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
