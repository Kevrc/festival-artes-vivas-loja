import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { validar } from '../../../common/http/validar';
import { ValidadorServicios } from '../application/validador/validador-servicios';
import { BoleteriaGuard, type PeticionConUsuario, RolesBoleteria } from './boleteria.guard';
import { SolicitudSincronizacionSchema, SolicitudValidacionSchema, UuidSchema } from './esquemas';

@Controller('api/boleteria/validador')
@UseGuards(BoleteriaGuard)
@RolesBoleteria('validador', 'jefe_sala')
export class ValidadorController {
  constructor(@Inject(ValidadorServicios) private readonly validador: ValidadorServicios) {}

  @Get('funciones/:funcionId/paquete')
  @Header('Cache-Control', 'private, no-store')
  descargarPaquete(@Param('funcionId') funcionId: string, @Req() req: PeticionConUsuario) {
    return this.validador.descargarPaquete(validar(UuidSchema, funcionId), req.usuario!);
  }

  @Post('validar')
  @HttpCode(200)
  validarEntrada(
    @Req() req: PeticionConUsuario,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Body() cuerpo: unknown,
  ) {
    const dto = validar(SolicitudValidacionSchema, cuerpo);
    return this.validador.validarEnLinea({
      usuario: req.usuario!,
      funcionId: dto.funcionId,
      tokenQr: dto.tokenQr,
      codigoCorto: dto.codigoCorto,
      dispositivoId: dto.dispositivoId,
      puerta: dto.puerta,
      correlacionId,
    });
  }

  @Post('sincronizar')
  @HttpCode(200)
  sincronizar(
    @Req() req: PeticionConUsuario,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Body() cuerpo: unknown,
  ) {
    const dto = validar(SolicitudSincronizacionSchema, cuerpo);
    return this.validador.sincronizarIngresos({
      usuario: req.usuario!,
      ingresos: dto.ingresos,
      correlacionId,
    });
  }
}
