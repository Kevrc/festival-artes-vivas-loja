import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { calcularArqueoCaja } from '../../domain/arqueo-caja';
import type { ParLlavesQr } from '../../domain/firma-qr';
import type { MedioPagoTaquilla, TipoMovimientoCaja } from '../../domain/tipos';
import { boleteriaLatenciaOperacion, boleteriaPedidosTotal } from '../../infrastructure/metricas-boleteria';
import { verificarAlcanceSede } from '../../interface/boleteria.guard';
import { publicarDisponibilidad, publicarEntradasEmitidas, publicarPedidoReembolsado } from '../eventos/helpers-eventos';
import {
  type CajaRegistro,
  type ContextoUsuario,
  LLAVES_QR,
  PUBLICADOR_BOLETERIA,
  type PublicadorEventosBoleteria,
  RELOJ_BOLETERIA,
  REPOSITORIO_BOLETERIA,
  UNIDAD_TRABAJO,
  type UnidadDeTrabajo,
  type RelojBoleteria,
  type RepositorioBoleteria,
} from '../puertos';

function formatearCajaDetalle(caja: CajaRegistro) {
  const arqueo = calcularArqueoCaja({
    fondoInicialCentavos: caja.fondoInicialCentavos,
    movimientos: caja.movimientos.map((m) => ({
      tipo: m.tipo as TipoMovimientoCaja,
      medioPago: m.medioPago as MedioPagoTaquilla,
      importeCentavos: m.importeCentavos,
    })),
    efectivoDeclaradoCentavos: caja.efectivoDeclaradoCentavos ?? 0,
  });

  return {
    id: caja.id,
    vendedorId: caja.vendedorId,
    sedeId: caja.sedeId,
    estado: caja.estado,
    fondoInicialCentavos: caja.fondoInicialCentavos,
    totalEfectivoVentasCentavos: arqueo.totalEfectivoVentasCentavos,
    totalTarjetaVentasCentavos: arqueo.totalTarjetaVentasCentavos,
    totalDevolucionesEfectivoCentavos: arqueo.totalDevolucionesEfectivoCentavos,
    efectivoEsperadoCentavos: caja.efectivoEsperadoCentavos ?? arqueo.efectivoEsperadoCentavos,
    efectivoDeclaradoCentavos: caja.efectivoDeclaradoCentavos,
    diferenciaCentavos: caja.diferenciaCentavos,
    abiertaEn: caja.abiertaEn.toISOString(),
    cerradaEn: caja.cerradaEn ? caja.cerradaEn.toISOString() : null,
  };
}

@Injectable()
export class TaquillaServicios {
  constructor(
    @Inject(REPOSITORIO_BOLETERIA) private readonly repo: RepositorioBoleteria,
    @Inject(PUBLICADOR_BOLETERIA) private readonly publicador: PublicadorEventosBoleteria,
    @Inject(UNIDAD_TRABAJO) private readonly uow: UnidadDeTrabajo,
    @Inject(RELOJ_BOLETERIA) private readonly reloj: RelojBoleteria,
    @Inject(LLAVES_QR) private readonly llaves: ParLlavesQr,
  ) {}

  async abrirCaja(p: { usuario: ContextoUsuario; sedeId: string; fondoInicialCentavos: number; correlacionId?: string }) {
    verificarAlcanceSede(p.usuario, ['taquilla'], p.sedeId);
    const res = await this.repo.abrirCaja({
      vendedorId: p.usuario.cuentaId,
      sedeId: p.sedeId,
      fondoInicialCentavos: p.fondoInicialCentavos,
      ahora: this.reloj(),
      correlacionId: p.correlacionId ?? randomUUID(),
    });
    if (!res.ok) throw new ConflictException({ message: res.detalle });
    return formatearCajaDetalle(res.caja);
  }

  async obtenerCajaActual(usuario: ContextoUsuario) {
    const caja = await this.repo.obtenerCajaAbierta(usuario.cuentaId);
    if (!caja) throw new NotFoundException('No tienes ninguna caja abierta actualmente.');
    return formatearCajaDetalle(caja);
  }

  async cerrarCaja(p: { cajaId: string; usuario: ContextoUsuario; efectivoDeclaradoCentavos: number; correlacionId?: string }) {
    const res = await this.repo.cerrarCaja({
      cajaId: p.cajaId,
      vendedorId: p.usuario.cuentaId,
      efectivoDeclaradoCentavos: p.efectivoDeclaradoCentavos,
      ahora: this.reloj(),
      correlacionId: p.correlacionId ?? randomUUID(),
    });
    if (!res.ok) {
      if (res.motivo === 'no_encontrada') throw new NotFoundException(res.detalle);
      if (res.motivo === 'no_autorizada') throw new ForbiddenException(res.detalle);
      throw new UnprocessableEntityException(res.detalle);
    }
    return formatearCajaDetalle(res.caja);
  }

  async vender(p: {
    usuario: ContextoUsuario;
    cajaId: string;
    funcionId: string;
    cantidad: number;
    medioPago: MedioPagoTaquilla;
    correoComprador?: string;
    claveIdempotencia: string;
    correlacionId?: string;
  }) {
    const finTimer = boleteriaLatenciaOperacion.startTimer({ operacion: 'venta_taquilla' });
    const correlacionId = p.correlacionId ?? randomUUID();
    const ahora = this.reloj();

    const esAdmin = p.usuario.roles.some((r) => r.rol === 'administrador');
    const sedesPermitidas = esAdmin
      ? undefined
      : p.usuario.roles.filter((r) => r.rol === 'taquilla' && r.sedeId).map((r) => r.sedeId!);

    try {
      const res = await this.uow.ejecutar(async () => {
        const r = await this.repo.venderEnTaquilla({
        cajaId: p.cajaId,
        vendedorId: p.usuario.cuentaId,
        sedesPermitidas,
        funcionId: p.funcionId,
        cantidad: p.cantidad,
        medioPago: p.medioPago,
        correoComprador: p.correoComprador,
        claveIdempotencia: p.claveIdempotencia,
        ahora,
        llaves: this.llaves,
        correlacionId,
        });
        if (r.ok && !r.idempotente) {
          await publicarEntradasEmitidas(this.publicador, { pedido: r.pedido, edicionId: r.inventario.edicionId, ahora, correlacionId });
          await publicarDisponibilidad(this.publicador, r.inventario, ahora, correlacionId);
        }
        return r;
      });

      if (!res.ok) {
        boleteriaPedidosTotal.inc({ canal: 'taquilla', tipo: 'compra', resultado: res.motivo });
        if (res.motivo === 'caja_no_encontrada' || res.motivo === 'no_encontrada') throw new NotFoundException(res.detalle);
        if (res.motivo === 'no_autorizado') throw new ForbiddenException(res.detalle);
        if (res.motivo === 'conflicto_idempotencia') throw new ConflictException({ message: res.detalle });
        if (res.motivo === 'cupo') {
          throw new ConflictException({ message: res.detalle, lugaresDisponibles: res.disponibles ?? 0 });
        }
        throw new UnprocessableEntityException(res.detalle);
      }

      boleteriaPedidosTotal.inc({ canal: 'taquilla', tipo: res.pedido.tipo, resultado: res.idempotente ? 'idempotente' : 'pagado' });
      return res.pedido;
    } finally {
      finTimer();
    }
  }

  async devolverEfectivo(p: { usuario: ContextoUsuario; cajaId: string; codigoEntrada: string; correlacionId?: string }) {
    const correlacionId = p.correlacionId ?? randomUUID();
    const ahora = this.reloj();
    const info = await this.repo.buscarEntradaPorCodigoOToken(p.codigoEntrada);
    if (!info) throw new NotFoundException('Entrada no encontrada.');
    verificarAlcanceSede(p.usuario, ['taquilla'], info.sedeId);

    if (info.estadoFuncion !== 'cancelada' && info.estadoFuncion !== 'reprogramada') {
      throw new UnprocessableEntityException('La devolución en taquilla solo procede por función cancelada o reprogramada.');
    }
    if (info.canal !== 'taquilla' || !info.tuvoEfectivo) {
      throw new UnprocessableEntityException('Solo las compras en efectivo en taquilla se reembolsan por caja.');
    }
    if (info.pedidoEstado === 'reembolsado') {
      throw new UnprocessableEntityException('Este pedido ya fue reembolsado.');
    }

    const res = await this.uow.ejecutar(async () => {
      const r = await this.repo.ejecutarDevolucionTaquillaEfectivo({
        cajaId: p.cajaId,
        vendedorId: p.usuario.cuentaId,
        pedidoId: info.pedidoId,
        ahora,
        correlacionId,
      });
      if (!r.ok) return r;
      const fn = await this.repo.obtenerFuncionConEdicion(r.pedido.funcionId);
      if (fn) {
        await publicarPedidoReembolsado(this.publicador, {
          pedido: r.pedido,
          edicionId: fn.edicionId,
          motivo: info.estadoFuncion === 'cancelada' ? 'funcion_cancelada' : 'funcion_reprogramada',
          ahora,
          correlacionId,
        });
      }
      return r;
    });
    if (!res.ok) {
      if (res.motivo === 'no_autorizado') throw new ForbiddenException(res.detalle);
      throw new UnprocessableEntityException(res.detalle);
    }
    return res.pedido;
  }
}
