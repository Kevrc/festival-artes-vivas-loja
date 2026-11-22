import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Put, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { OrigenGuard } from '../../../common/identidad/origen.guard';
import { Identidad, PermiteSinSegundoFactor, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { MiCuentaServicio } from '../application/mi-cuenta/mi-cuenta.servicio';
import { correlacionDe } from './esquemas';

const DatosSchema = z.object({ nombre: z.string().trim().min(2).max(120).optional(), novedades: z.boolean().optional() }).strict();
const ContrasenaSchema = z.object({ contrasenaActual: z.string().max(512), contrasenaNueva: z.string().min(1).max(512) });

/** "Mi cuenta" (US8-AS3/AS4, FR-022, FR-023). Requiere sesión; las respuestas no se guardan en caché. */
@Controller('api/identidad/yo')
@UseGuards(OrigenGuard, RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
@Requiere()
export class MiCuentaController {
  constructor(@Inject(MiCuentaServicio) private readonly miCuenta: MiCuentaServicio) {}

  /** También con sesión restringida: así la web sabe que falta el segundo factor (US9-AS3). */
  @Get()
  @PermiteSinSegundoFactor()
  yo(@Identidad() ctx: ContextoIdentidad, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.miCuenta.yo(ctx);
  }

  @Patch()
  actualizar(@Identidad() ctx: ContextoIdentidad, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    return this.miCuenta.actualizar(ctx, validar(DatosSchema, cuerpo), correlacionDe(correlacion));
  }

  @Put('contrasena')
  @HttpCode(204)
  async cambiarContrasena(@Identidad() ctx: ContextoIdentidad, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    const { contrasenaActual, contrasenaNueva } = validar(ContrasenaSchema, cuerpo);
    await this.miCuenta.cambiarContrasena(ctx, contrasenaActual, contrasenaNueva, correlacionDe(correlacion));
  }

  @Get('sesiones')
  async sesiones(@Identidad() ctx: ContextoIdentidad, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    return (await this.miCuenta.sesionesAbiertas(ctx)).map((s) => ({
      id: s.id,
      dispositivo: s.dispositivo,
      creadaEn: s.creadaEn.toISOString(),
      ultimaActividadEn: s.ultimaActividadEn.toISOString(),
      actual: s.actual,
    }));
  }

  @Delete('sesiones/:sesionId')
  @HttpCode(204)
  async cerrarSesion(@Identidad() ctx: ContextoIdentidad, @Param('sesionId') sesionId: string, @Headers('x-correlation-id') correlacion: string | undefined) {
    await this.miCuenta.cerrarSesion(ctx, validar(z.string().uuid(), sesionId), correlacionDe(correlacion));
  }
}
