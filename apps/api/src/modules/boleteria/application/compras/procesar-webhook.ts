import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ParLlavesQr } from '../../domain/firma-qr';
import { boleteriaPedidosTotal } from '../../infrastructure/metricas-boleteria';
import {
  publicarDisponibilidad,
  publicarEntradasEmitidas,
  publicarPedidoReembolsado,
} from '../eventos/helpers-eventos';
import {
  LLAVES_QR,
  PROVEEDOR_PAGOS,
  PUBLICADOR_BOLETERIA,
  type ProveedorPagos,
  type PublicadorEventosBoleteria,
  RELOJ_BOLETERIA,
  REPOSITORIO_BOLETERIA,
  type RelojBoleteria,
  type RepositorioBoleteria,
} from '../puertos';

@Injectable()
export class ProcesarWebhookPago {
  constructor(
    @Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria,
    @Inject(PROVEEDOR_PAGOS) private readonly proveedor: ProveedorPagos,
    @Inject(PUBLICADOR_BOLETERIA) private readonly publicador: PublicadorEventosBoleteria,
    @Inject(RELOJ_BOLETERIA) private readonly reloj: RelojBoleteria,
    @Inject(LLAVES_QR) private readonly llaves: ParLlavesQr,
  ) {}

  async ejecutarWebhook(p: {
    firma: string;
    cuerpoCrudo: string;
    payload: { pedidoId: string; referenciaProveedor: string; resultado: 'aprobado' | 'rechazado'; importeCentavos: number };
    correlacionId?: string;
  }) {
    const valida = this.proveedor.verificarWebhook({
      firma: p.firma,
      cuerpoCrudo: p.cuerpoCrudo,
      payload: p.payload,
    });
    if (!valida) throw new UnauthorizedException('Firma de webhook inválida.');
    return this.aplicarResultado({ ...p.payload, correlacionId: p.correlacionId });
  }

  async aplicarResultado(p: {
    pedidoId: string;
    referenciaProveedor: string;
    resultado: 'aprobado' | 'rechazado';
    importeCentavos: number;
    correlacionId?: string;
  }) {
    const correlacionId = p.correlacionId ?? randomUUID();
    const ahora = this.reloj();

    const res = await this.repo.procesarResultadoPago({
      pedidoId: p.pedidoId,
      proveedor: this.proveedor.nombre,
      referenciaProveedor: p.referenciaProveedor,
      resultado: p.resultado,
      importeCentavos: p.importeCentavos,
      ahora,
      llaves: this.llaves,
      correlacionId,
    });

    if (res.accion === 'no_encontrado' || !res.pedido) {
      throw new NotFoundException('Pedido no encontrado.');
    }

    if (res.accion === 'pagado' || res.accion === 'tardio_pagado') {
      await publicarEntradasEmitidas(this.publicador, {
        pedido: res.pedido,
        edicionId: res.inventario!.edicionId,
        ahora,
        correlacionId,
      });
      await publicarDisponibilidad(this.publicador, res.inventario!, ahora, correlacionId);
      boleteriaPedidosTotal.inc({ canal: res.pedido.canal, tipo: res.pedido.tipo, resultado: res.accion });
      return { procesado: true, estadoPedido: res.pedido.estado };
    }

    if (res.accion === 'rechazado') {
      if (res.inventario) await publicarDisponibilidad(this.publicador, res.inventario, ahora, correlacionId);
      boleteriaPedidosTotal.inc({ canal: res.pedido.canal, tipo: res.pedido.tipo, resultado: 'rechazado' });
      return { procesado: true, estadoPedido: res.pedido.estado };
    }

    if (res.accion === 'tardio_requiere_reembolso') {
      const dev = await this.proveedor.devolverPago({
        pedidoId: res.pedido.id,
        referenciaCobro: p.referenciaProveedor,
        importeCentavos: res.pedido.importeCentavos,
      });
      if (dev.aprobada) {
        const reemb = await this.repo.registrarReembolsoConfirmado({
          pedidoId: res.pedido.id,
          proveedor: this.proveedor.nombre,
          referenciaDevolucion: dev.referenciaDevolucion,
          importeCentavos: res.pedido.importeCentavos,
          motivo: 'pago_tardio_sin_cupo',
          correlacionId,
        });
        if (reemb.pedido && !reemb.yaRegistrado) {
          await publicarPedidoReembolsado(this.publicador, {
            pedido: reemb.pedido,
            edicionId: res.inventario!.edicionId,
            motivo: 'pago_tardio_sin_cupo',
            ahora,
            correlacionId,
          });
        }
        boleteriaPedidosTotal.inc({ canal: res.pedido.canal, tipo: res.pedido.tipo, resultado: 'reembolsado_tardio' });
        return { procesado: true, estadoPedido: 'reembolsado' as const };
      }
    }

    return { procesado: true, estadoPedido: res.pedido.estado };
  }
}

@Injectable()
export class ExpirarRetenciones {
  constructor(
    @Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria,
    @Inject(PUBLICADOR_BOLETERIA) private readonly publicador: PublicadorEventosBoleteria,
    @Inject(RELOJ_BOLETERIA) private readonly reloj: RelojBoleteria,
  ) {}

  async ejecutar(correlacionId: string = randomUUID()): Promise<number> {
    const ahora = this.reloj();
    const expirados = await this.repo.expirarRetencionesVencidas(ahora);
    for (const item of expirados) {
      await publicarDisponibilidad(this.publicador, item.funcion, ahora, correlacionId);
      boleteriaPedidosTotal.inc({ canal: 'web', tipo: 'compra', resultado: 'expirado' });
    }
    return expirados.length;
  }
}

@Injectable()
export class ConciliarPagosPendientes {
  constructor(
    @Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria,
    @Inject(PROVEEDOR_PAGOS) private readonly proveedor: ProveedorPagos,
    @Inject(ProcesarWebhookPago) private readonly procesador: ProcesarWebhookPago,
    @Inject(RELOJ_BOLETERIA) private readonly reloj: RelojBoleteria,
  ) {}

  async ejecutar(correlacionId: string = randomUUID()): Promise<number> {
    const antesDe = new Date(this.reloj().getTime() - 90_000);
    const pendientes = await this.repo.listarPedidosPendientesAntiguos(antesDe);
    let conciliados = 0;
    for (const ped of pendientes) {
      const consulta = await this.proveedor.consultarPago(ped.id, ped.referenciaIntencion ?? undefined);
      if (consulta.estado === 'aprobado' || consulta.estado === 'rechazado') {
        await this.procesador.aplicarResultado({
          pedidoId: ped.id,
          referenciaProveedor: consulta.referenciaProveedor ?? `conc-${ped.id}`,
          resultado: consulta.estado,
          importeCentavos: consulta.importeCentavos ?? 0,
          correlacionId,
        });
        conciliados++;
      }
    }
    return conciliados;
  }
}

@Injectable()
export class ReenviarEntradasCorreo {
  constructor(
    @Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria,
    @Inject(PUBLICADOR_BOLETERIA) private readonly publicador: PublicadorEventosBoleteria,
    @Inject(RELOJ_BOLETERIA) private readonly reloj: RelojBoleteria,
  ) {}

  async ejecutar(pedidoId: string, cuentaId: string, correlacionId: string = randomUUID()) {
    const pedido = await this.repo.obtenerPedidoPorId(pedidoId);
    if (!pedido) throw new NotFoundException('Pedido no encontrado.');
    if (pedido.cuentaId !== cuentaId) throw new ForbiddenException('No tienes permiso sobre este pedido.');
    if (pedido.estado !== 'pagado' && pedido.estado !== 'confirmado') {
      throw new UnprocessableEntityException('Solo pueden reenviarse entradas de pedidos confirmados o pagados.');
    }
    const fn = await this.repo.obtenerFuncionConEdicion(pedido.funcionId);
    if (!fn) throw new NotFoundException('Función no encontrada.');

    await publicarEntradasEmitidas(this.publicador, {
      pedido,
      edicionId: fn.edicionId,
      ahora: this.reloj(),
      correlacionId,
    });
    return { pedidoId: pedido.id, encolado: true };
  }
}
