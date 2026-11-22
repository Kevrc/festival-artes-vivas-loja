import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Put, Res, UseFilters, UseGuards } from '@nestjs/common';
import { COOKIE_SESION } from '@fiavl/contracts';
import type { ContextoIdentidad } from '@fiavl/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { OrigenGuard } from '../../../common/identidad/origen.guard';
import { Identidad, PermiteSinPolitica, PermiteSinSegundoFactor, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { MiCuentaServicio } from '../application/mi-cuenta/mi-cuenta.servicio';
import { correlacionDe } from './esquemas';

const DatosSchema = z.object({ nombre: z.string().trim().min(2).max(120).optional(), novedades: z.boolean().optional() }).strict();
const EliminacionSchema = z.object({ contrasena: z.string().max(512), asumoPerdida: z.boolean().default(false) });
const PoliticaSchema = z.object({ version: z.union([z.string().regex(/^\d{1,6}$/), z.number().int().positive()]).transform(Number) });
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
  @PermiteSinPolitica()
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

  /** US11-AS1: descarga de todos mis datos (también con la política pendiente). */
  @Get('datos')
  @PermiteSinPolitica()
  async datos(@Identidad() ctx: ContextoIdentidad, @Headers('x-correlation-id') correlacion: string | undefined, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="mis-datos-fiavl.json"');
    return this.miCuenta.misDatos(ctx, correlacionDe(correlacion));
  }

  @Get('eliminacion')
  @PermiteSinPolitica()
  evaluarEliminacion(@Identidad() ctx: ContextoIdentidad) {
    return this.miCuenta.evaluarEliminacion(ctx);
  }

  /** US11-AS2/AS3: con la contraseña; la sesión deja de existir y se borra la cookie. */
  @Post('eliminacion')
  @HttpCode(204)
  @PermiteSinPolitica()
  async eliminar(@Identidad() ctx: ContextoIdentidad, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined, @Res({ passthrough: true }) res: Response) {
    const { contrasena, asumoPerdida } = validar(EliminacionSchema, cuerpo);
    await this.miCuenta.eliminar(ctx, contrasena, asumoPerdida, correlacionDe(correlacion));
    res.clearCookie(COOKIE_SESION, { path: '/' });
  }

  /** US11-AS4: aceptar la versión vigente de la política de privacidad. */
  @Post('politica')
  @HttpCode(204)
  @PermiteSinPolitica()
  async aceptarPolitica(@Identidad() ctx: ContextoIdentidad, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    await this.miCuenta.aceptarPolitica(ctx, validar(PoliticaSchema, cuerpo).version, correlacionDe(correlacion));
  }
}
