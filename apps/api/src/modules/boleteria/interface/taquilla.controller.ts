import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { validar } from '../../../common/http/validar';
import { TaquillaServicios } from '../application/taquilla/taquilla-servicios';
import { BoleteriaGuard, type PeticionConUsuario, RolesBoleteria } from './boleteria.guard';
import {
  IdempotencyKeySchema,
  SolicitudAbrirCajaSchema,
  SolicitudCerrarCajaSchema,
  SolicitudDevolucionTaquillaSchema,
  SolicitudVentaTaquillaSchema,
  UuidSchema,
  aPedidoDetalleDto,
} from './esquemas';

@Controller('api/boleteria/taquilla')
@UseGuards(BoleteriaGuard)
@RolesBoleteria('taquilla')
export class TaquillaController {
  constructor(@Inject(TaquillaServicios) private readonly taquilla: TaquillaServicios) {}

  @Post('cajas')
  abrirCaja(
    @Req() req: PeticionConUsuario,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Body() cuerpo: unknown,
  ) {
    const dto = validar(SolicitudAbrirCajaSchema, cuerpo);
    return this.taquilla.abrirCaja({
      usuario: req.usuario!,
      sedeId: dto.sedeId,
      fondoInicialCentavos: dto.fondoInicialCentavos,
      correlacionId,
    });
  }

  @Get('cajas/actual')
  @Header('Cache-Control', 'private, no-store')
  obtenerActual(@Req() req: PeticionConUsuario) {
    return this.taquilla.obtenerCajaActual(req.usuario!);
  }

  @Post('cajas/:cajaId/cerrar')
  @HttpCode(200)
  cerrarCaja(
    @Param('cajaId') cajaId: string,
    @Req() req: PeticionConUsuario,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Body() cuerpo: unknown,
  ) {
    const dto = validar(SolicitudCerrarCajaSchema, cuerpo);
    return this.taquilla.cerrarCaja({
      cajaId: validar(UuidSchema, cajaId),
      usuario: req.usuario!,
      efectivoDeclaradoCentavos: dto.efectivoDeclaradoCentavos,
      correlacionId,
    });
  }

  @Post('ventas')
  async vender(
    @Req() req: PeticionConUsuario,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Body() cuerpo: unknown,
  ) {
    const clave = validar(IdempotencyKeySchema, idempotencyKey);
    const dto = validar(SolicitudVentaTaquillaSchema, cuerpo);
    const pedido = await this.taquilla.vender({
      usuario: req.usuario!,
      cajaId: dto.cajaId,
      funcionId: dto.funcionId,
      cantidad: dto.cantidad,
      medioPago: dto.medioPago,
      correoComprador: dto.correoComprador,
      claveIdempotencia: clave,
      correlacionId,
    });
    return aPedidoDetalleDto(pedido);
  }

  @Post('devoluciones')
  @HttpCode(200)
  async devolver(
    @Req() req: PeticionConUsuario,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Body() cuerpo: unknown,
  ) {
    const dto = validar(SolicitudDevolucionTaquillaSchema, cuerpo);
    const pedido = await this.taquilla.devolverEfectivo({
      usuario: req.usuario!,
      cajaId: dto.cajaId,
      codigoEntrada: dto.codigoEntrada,
      correlacionId,
    });
    return aPedidoDetalleDto(pedido);
  }
}
