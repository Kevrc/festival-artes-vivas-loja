import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { validar } from '../../../common/http/validar';
import { CancelacionesServicios } from '../application/cancelaciones/cancelaciones-servicios';
import { CrearPedidoPagado } from '../application/compras/crear-pedido-pagado';
import { ReenviarEntradasCorreo } from '../application/compras/procesar-webhook';
import { ConsultasBoleteria } from '../application/consultas/disponibilidad';
import { CancelarReserva, CrearReservaGratuita } from '../application/reservas/reservas-servicios';
import { BoleteriaGuard, type PeticionConUsuario, RequiereCuentaVerificada } from './boleteria.guard';
import {
  IdempotencyKeySchema,
  SolicitudCompraSchema,
  SolicitudEleccionCancelacionSchema,
  UuidSchema,
  aPedidoDetalleDto,
} from './esquemas';

@Controller('api/boleteria')
@UseGuards(BoleteriaGuard)
export class PedidosController {
  constructor(
    @Inject(CrearPedidoPagado) private readonly crearPedido: CrearPedidoPagado,
    @Inject(CrearReservaGratuita) private readonly crearReserva: CrearReservaGratuita,
    @Inject(CancelarReserva) private readonly cancelarReservaUseCase: CancelarReserva,
    @Inject(ReenviarEntradasCorreo) private readonly reenviarCorreo: ReenviarEntradasCorreo,
    @Inject(CancelacionesServicios) private readonly cancelaciones: CancelacionesServicios,
    @Inject(ConsultasBoleteria) private readonly consultas: ConsultasBoleteria,
  ) {}

  @Post('pedidos')
  @RequiereCuentaVerificada()
  async crearPedidoPagado(
    @Req() req: PeticionConUsuario,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Body() cuerpo: unknown,
  ) {
    const clave = validar(IdempotencyKeySchema, idempotencyKey);
    const dto = validar(SolicitudCompraSchema, cuerpo);
    const res = await this.crearPedido.ejecutar({
      usuario: req.usuario!,
      funcionId: dto.funcionId,
      cantidad: dto.cantidad,
      claveIdempotencia: clave,
      correlacionId,
    });
    return {
      pedido: aPedidoDetalleDto(res.pedido),
      urlPago: res.urlPago,
      referenciaIntencion: res.referenciaIntencion,
    };
  }

  @Post('reservas')
  @RequiereCuentaVerificada()
  async crearReservaGratuita(
    @Req() req: PeticionConUsuario,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Body() cuerpo: unknown,
  ) {
    const clave = validar(IdempotencyKeySchema, idempotencyKey);
    const dto = validar(SolicitudCompraSchema, cuerpo);
    const pedido = await this.crearReserva.ejecutar({
      usuario: req.usuario!,
      funcionId: dto.funcionId,
      cantidad: dto.cantidad,
      claveIdempotencia: clave,
      correlacionId,
    });
    return aPedidoDetalleDto(pedido);
  }

  @Get('mis-entradas')
  @Header('Cache-Control', 'private, no-store')
  async misEntradas(@Req() req: PeticionConUsuario) {
    const pedidos = await this.consultas.misEntradas(req.usuario!.cuentaId);
    return pedidos.map(aPedidoDetalleDto);
  }

  @Get('pedidos/:pedidoId')
  @Header('Cache-Control', 'private, no-store')
  async obtenerPedido(@Param('pedidoId') pedidoId: string, @Req() req: PeticionConUsuario) {
    const pedido = await this.consultas.obtenerPedido(validar(UuidSchema, pedidoId), req.usuario!.cuentaId);
    return aPedidoDetalleDto(pedido);
  }

  @Post('pedidos/:pedidoId/reenviar-correo')
  @HttpCode(202)
  reenviar(
    @Param('pedidoId') pedidoId: string,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Req() req: PeticionConUsuario,
  ) {
    return this.reenviarCorreo.ejecutar(validar(UuidSchema, pedidoId), req.usuario!.cuentaId, correlacionId);
  }

  @Post('pedidos/:pedidoId/cancelar-reserva')
  @HttpCode(200)
  async cancelar(
    @Param('pedidoId') pedidoId: string,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Req() req: PeticionConUsuario,
  ) {
    const pedido = await this.cancelarReservaUseCase.ejecutar({
      pedidoId: validar(UuidSchema, pedidoId),
      cuentaId: req.usuario!.cuentaId,
      correlacionId,
    });
    return aPedidoDetalleDto(pedido);
  }

  @Post('pedidos/:pedidoId/eleccion-cancelacion')
  @HttpCode(200)
  async elegirCancelacion(
    @Param('pedidoId') pedidoId: string,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Req() req: PeticionConUsuario,
    @Body() cuerpo: unknown,
  ) {
    const dto = validar(SolicitudEleccionCancelacionSchema, cuerpo);
    const pedido = await this.cancelaciones.elegirResolucion({
      pedidoId: validar(UuidSchema, pedidoId),
      cuentaId: req.usuario!.cuentaId,
      eleccion: dto.eleccion,
      nuevaFuncionId: dto.nuevaFuncionId,
      correlacionId,
    });
    return aPedidoDetalleDto(pedido);
  }
}
