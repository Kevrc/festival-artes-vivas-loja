import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ConsultarPagoResultado,
  DevolverPagoResultado,
  IniciarCobroInput,
  IniciarCobroResultado,
  ProveedorPagos,
} from '../application/puertos';

/**
 * Capa anticorrupción para PayPhone (Button/Link v2) en Ecuador (ADR-0007).
 * Traduce el modelo externo de PayPhone al puerto ProveedorPagos usando centavos enteros y `clientTransactionId = pedidoId`.
 */
@Injectable()
export class PayPhonePagosAdapter implements ProveedorPagos {
  readonly nombre = 'payphone' as const;

  private get baseUrl() {
    return process.env.PAYPHONE_BASE_URL ?? 'https://pay.payphonetodoesposible.com/api';
  }

  private get token() {
    const t = process.env.PAYPHONE_TOKEN;
    if (!t) throw new Error('PAYPHONE_TOKEN no configurado');
    return t;
  }

  async iniciarCobro(input: IniciarCobroInput): Promise<IniciarCobroResultado> {
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3100';
    const resp = await fetch(`${this.baseUrl}/Links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: input.importeCentavos,
        amountWithoutTax: input.importeCentavos,
        clientTransactionId: input.pedidoId,
        currency: 'USD',
        reference: input.descripcion,
        storeId: process.env.PAYPHONE_STORE_ID,
        responseUrl: `${webUrl}/pedidos/${input.pedidoId}/retorno`,
      }),
    });
    if (!resp.ok) {
      throw new Error(`PayPhone error ${resp.status} al iniciar cobro`);
    }
    const data = (await resp.json()) as { payWithPayPhone?: string; payWithCard?: string; paymentId?: string | number };
    const urlPago = data.payWithPayPhone ?? data.payWithCard;
    if (!urlPago) throw new Error('PayPhone no devolvió URL de pago');
    return {
      urlPago,
      referenciaIntencion: String(data.paymentId ?? input.pedidoId),
    };
  }

  async consultarPago(pedidoId: string): Promise<ConsultarPagoResultado> {
    const resp = await fetch(`${this.baseUrl}/Sale/client/${encodeURIComponent(pedidoId)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!resp.ok) return { estado: 'pendiente' };
    const lista = (await resp.json()) as Array<{ transactionStatus?: string; transactionId?: number; amount?: number }>;
    const tx = lista[0];
    if (!tx) return { estado: 'pendiente' };
    if (tx.transactionStatus === 'Approved') {
      return {
        estado: 'aprobado',
        referenciaProveedor: tx.transactionId ? String(tx.transactionId) : pedidoId,
        importeCentavos: tx.amount,
      };
    }
    if (tx.transactionStatus === 'Canceled' || tx.transactionStatus === 'Rejected') {
      return {
        estado: 'rechazado',
        referenciaProveedor: tx.transactionId ? String(tx.transactionId) : pedidoId,
        importeCentavos: tx.amount,
      };
    }
    return { estado: 'pendiente' };
  }

  async devolverPago(p: { pedidoId: string; referenciaCobro: string }): Promise<DevolverPagoResultado> {
    const resp = await fetch(`${this.baseUrl}/Sale/Reverse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: Number(p.referenciaCobro) || p.referenciaCobro }),
    });
    if (!resp.ok) throw new Error(`PayPhone error ${resp.status} al devolver pago`);
    const data = (await resp.json()) as { transactionId?: number | string };
    return {
      referenciaDevolucion: String(data.transactionId ?? `rev-${p.pedidoId}`),
      aprobada: true,
    };
  }

  verificarWebhook(p: { firma: string; cuerpoCrudo: string }): boolean {
    const secreto = process.env.PAYPHONE_WEBHOOK_SECRET;
    if (!secreto) return false;
    const esperada = createHmac('sha256', secreto).update(p.cuerpoCrudo).digest('hex');
    const a = Buffer.from(p.firma.trim(), 'utf8');
    const b = Buffer.from(esperada, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
