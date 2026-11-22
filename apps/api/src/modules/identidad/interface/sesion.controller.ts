import { Body, Controller, Delete, Headers, HttpCode, Inject, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { COOKIE_SESION } from '@fiavl/contracts';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { OrigenGuard } from '../../../common/identidad/origen.guard';
import { PermiteSinSegundoFactor, Publico, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { MiCuentaServicio } from '../application/mi-cuenta/mi-cuenta.servicio';
import { SesionServicio } from '../application/sesion/sesion.servicio';
import { DURACION_SESION } from '../domain/sesiones';
import { leerCookie } from '../infrastructure/identidad-publica.provider';
import { correlacionDe } from './esquemas';

const InicioSchema = z.object({ correo: z.string().trim().max(254), contrasena: z.string().max(512) });
const CorreoSchema = z.object({ correo: z.string().trim().email().max(254) });
const ConfirmacionSchema = z.object({ token: z.string().min(43).max(64).regex(/^[A-Za-z0-9_-]+$/), contrasenaNueva: z.string().min(1).max(512) });

/** Cookie de sesión (ADR-0009): HttpOnly, SameSite=Lax, Secure fuera de desarrollo; el token nunca va en el cuerpo. */
function opcionesCookie(esPersonal: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: esPersonal ? DURACION_SESION.personal : DURACION_SESION.publico,
  };
}

/** Inicio y cierre de sesión, recuperación de contraseña (US8). Contrato: contracts/api-identidad.openapi.yaml. */
@Controller('api/identidad')
@UseGuards(OrigenGuard, RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
export class SesionController {
  constructor(
    @Inject(SesionServicio) private readonly sesiones: SesionServicio,
    @Inject(MiCuentaServicio) private readonly miCuenta: MiCuentaServicio,
  ) {}

  @Post('sesion')
  @HttpCode(200)
  @Publico()
  async iniciar(
    @Body() cuerpo: unknown,
    @Headers('user-agent') agente: string | undefined,
    @Headers('x-correlation-id') correlacion: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { correo, contrasena } = validar(InicioSchema, cuerpo);
    const s = await this.sesiones.iniciar(correo, contrasena, agente, correlacionDe(correlacion));
    res.cookie(COOKIE_SESION, s.token, opcionesCookie(s.esPersonal));
    res.setHeader('Cache-Control', 'no-store');
    const ctx = await this.sesiones.resolver(s.token);
    return this.miCuenta.yo(ctx!);
  }

  @Delete('sesion')
  @HttpCode(204)
  @Publico()
  async cerrar(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = leerCookie(req, COOKIE_SESION);
    if (token) await this.sesiones.cerrar(token);
    res.clearCookie(COOKIE_SESION, { path: '/' });
  }

  @Post('recuperacion')
  @HttpCode(202)
  @Publico()
  async pedirRecuperacion(@Body() cuerpo: unknown) {
    await this.sesiones.pedirRecuperacion(validar(CorreoSchema, cuerpo).correo);
    return { mensaje: 'Si existe una cuenta con ese correo, te llegará un enlace.' };
  }

  @Post('recuperacion/confirmacion')
  @HttpCode(204)
  @Publico()
  @PermiteSinSegundoFactor()
  async confirmarRecuperacion(@Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    const { token, contrasenaNueva } = validar(ConfirmacionSchema, cuerpo);
    await this.sesiones.confirmarRecuperacion(token, contrasenaNueva, correlacionDe(correlacion));
  }
}
