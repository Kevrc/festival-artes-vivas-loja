import { Body, Controller, Get, Headers, HttpCode, Inject, Post, UseFilters, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { OrigenGuard } from '../../../common/identidad/origen.guard';
import { Publico, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { RegistroServicio } from '../application/registro/registro.servicio';
import { correlacionDe } from './esquemas';

/** Contrato: contracts/api-identidad.openapi.yaml (US7). */
const RegistroSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  correo: z.string().trim().email().max(254),
  // El mínimo de 10 lo comprueba el dominio para responder `contrasena_corta` (US7-AS4).
  contrasena: z.string().min(1).max(512),
  aceptaPolitica: z.boolean(),
  versionPolitica: z.union([z.string(), z.number()]).transform((v) => Number(v)).pipe(z.number().int().positive()),
  aceptaNovedades: z.boolean().default(false),
});
const TokenSchema = z.object({ token: z.string().min(43).max(64).regex(/^[A-Za-z0-9_-]+$/) });
const ReenvioSchema = z.object({ correo: z.string().trim().email().max(254) });

@Controller('api/identidad')
@UseGuards(OrigenGuard, RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
@Publico()
export class RegistroController {
  constructor(@Inject(RegistroServicio) private readonly registro: RegistroServicio) {}

  /** Versión y enlace de la política de privacidad vigente, para el formulario de registro. */
  @Get('politica')
  async politica() {
    const p = await this.registro.politicaVigente();
    return { version: p.version, url: p.url, vigenteDesde: p.vigenteDesde.toISOString() };
  }

  @Post('registro')
  @HttpCode(202)
  async registrar(@Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    await this.registro.registrar(validar(RegistroSchema, cuerpo), correlacionDe(correlacion));
    return { mensaje: 'Si el correo es válido, te llegará un enlace para verificarlo.' };
  }

  @Post('verificacion')
  @HttpCode(200)
  async verificar(@Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    await this.registro.verificar(validar(TokenSchema, cuerpo).token, correlacionDe(correlacion));
    return { mensaje: 'Tu correo está verificado.' };
  }

  @Post('verificacion/reenvio')
  @HttpCode(202)
  async reenviar(@Body() cuerpo: unknown) {
    await this.registro.reenviar(validar(ReenvioSchema, cuerpo).correo);
    return { mensaje: 'Si corresponde, te enviamos un enlace nuevo.' };
  }
}
