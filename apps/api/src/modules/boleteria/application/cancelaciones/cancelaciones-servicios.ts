import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ParLlavesQr } from '../../domain/firma-qr';
import { puedeSolicitarDevolucion } from '../../domain/reglas-acceso';
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
export class CancelacionesServicios {
  constructor(
    @Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria,
    @Inject(PROVEEDOR_PAGOS) private readonly proveedor: ProveedorPagos,
    @Inject(PUBLICADOR_BOLETERIA) private readonly publicador: PublicadorEventosBoleteria,
    @Inject(RELOJ_BOLETERIA) private readonly reloj: RelojBoleteria,
    @Inject(LLAVES_QR) private readonly llaves: ParLlavesQr,
  ) {}

  async elegirResolucion(p: {
    pedidoId: string;
    cuentaId: string;
    eleccion: 'devolucion' | 'cambio';
    nuevaFuncionId?: string;
    correlacionId?: string;
  }) {
    const correlacionId = p.correlacionId ?? randomUUID();
    const ahora = this.reloj();

    const pedido = await this.repo.obtenerPedidoPorId(p.pedidoId);
    if (!pedido) throw new NotFoundException('Pedido no encontrado.');
    if (pedido.cuentaId !== p.cuentaId) throw new ForbiddenException('No puedes gestionar pedidos de otra cuenta.');

    const fn = await this.repo.obtenerFuncionConEdicion(pedido.funcionId);
    if (!fn) throw new NotFoundException('Función no encontrada.');

    if (!puedeSolicitarDevolucion({ estadoPedido: pedido.estado, importeCentavos: pedido.importeCentavos, estadoFuncion: fn.estadoFuncion })) {
      throw new UnprocessableEntityException('Este pedido no es elegible para devolución o cambio.');
    }

    if (p.eleccion === 'cambio') {
      if (!p.nuevaFuncionId) throw new BadRequestException('Debes indicar nuevaFuncionId para cambiar de función.');
      const res = await this.repo.cambiarFuncionPorCancelacion({
        pedidoId: p.pedidoId,
        cuentaId: p.cuentaId,
        nuevaFuncionId: p.nuevaFuncionId,
        ahora,
        llaves: this.llaves,
        correlacionId,
      });
      if (!res.ok) {
        if (res.motivo === 'no_encontrado') throw new NotFoundException(res.detalle);
        if (res.motivo === 'no_autorizado') throw new ForbiddenException(res.detalle);
        if (res.motivo === 'cupo') {
          throw new ConflictException({ message: res.detalle, lugaresDisponibles: res.disponibles ?? 0 });
        }
        throw new UnprocessableEntityException(res.detalle);
      }
      await publicarEntradasEmitidas(this.publicador, {
        pedido: res.nuevoPedido,
        edicionId: res.nuevaFuncion.edicionId,
        ahora,
        correlacionId,
      });
      await publicarDisponibilidad(this.publicador, res.nuevaFuncion, ahora, correlacionId);
      boleteriaPedidosTotal.inc({ canal: 'cambio', tipo: res.nuevoPedido.tipo, resultado: 'cambiado' });
      return res.nuevoPedido;
    }

    if (pedido.canal === 'taquilla') {
      throw new UnprocessableEntityException('Las compras en taquilla se reembolsan directamente en la taquilla de la sede.');
    }

    const cobro = await this.repo.obtenerReferenciaCobroAprobado(pedido.id);
    const refCobro = cobro?.referenciaProveedor ?? `cobro-${pedido.id}`;
    const dev = await this.proveedor.devolverPago({
      pedidoId: pedido.id,
      referenciaCobro: refCobro,
      importeCentavos: pedido.importeCentavos,
    });

    const motivo = fn.estadoFuncion === 'cancelada' ? 'funcion_cancelada' : 'funcion_reprogramada';
    const reemb = await this.repo.registrarReembolsoConfirmado({
      pedidoId: pedido.id,
      proveedor: this.proveedor.nombre,
      referenciaDevolucion: dev.referenciaDevolucion,
      importeCentavos: pedido.importeCentavos,
      motivo,
      correlacionId,
      actorId: p.cuentaId,
      rol: 'asistente',
      marcarResolucionDevolucion: true,
    });

    if (reemb.pedido && !reemb.yaRegistrado) {
      await publicarPedidoReembolsado(this.publicador, {
        pedido: reemb.pedido,
        edicionId: fn.edicionId,
        motivo,
        ahora,
        correlacionId,
      });
      if (reemb.inventario) {
        await publicarDisponibilidad(this.publicador, reemb.inventario, ahora, correlacionId);
      }
      boleteriaPedidosTotal.inc({ canal: pedido.canal, tipo: pedido.tipo, resultado: 'reembolsado' });
    }
    return reemb.pedido!;
  }

  /** US5-AS5: Aplica devolución automática cuando transcurren 7 días sin elección. */
  async procesarDevolucionesVencidas(correlacionId: string = randomUUID()): Promise<number> {
    const ahora = this.reloj();
    const vencidos = await this.repo.listarPedidosVencidosSinEleccion(ahora);
    let procesados = 0;

    for (const pedido of vencidos) {
      if (pedido.canal === 'taquilla') continue;
      const cobro = await this.repo.obtenerReferenciaCobroAprobado(pedido.id);
      const dev = await this.proveedor.devolverPago({
        pedidoId: pedido.id,
        referenciaCobro: cobro?.referenciaProveedor ?? `cobro-${pedido.id}`,
        importeCentavos: pedido.importeCentavos,
      });
      if (!dev.aprobada) continue;
      const reemb = await this.repo.registrarReembolsoConfirmado({
        pedidoId: pedido.id,
        proveedor: this.proveedor.nombre,
        referenciaDevolucion: dev.referenciaDevolucion,
        importeCentavos: pedido.importeCentavos,
        motivo: 'plazo_7_dias_vencido',
        correlacionId,
        marcarResolucionDevolucion: true,
      });
      if (reemb.pedido && !reemb.yaRegistrado && reemb.inventario) {
        await publicarPedidoReembolsado(this.publicador, {
          pedido: reemb.pedido,
          edicionId: reemb.inventario.edicionId,
          motivo: 'plazo_7_dias_vencido',
          ahora,
          correlacionId,
        });
        procesados++;
      }
    }
    return procesados;
  }
}
