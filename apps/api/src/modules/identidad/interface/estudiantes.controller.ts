import { Body, Controller, Get, Headers, HttpCode, Inject, Post, UseFilters, UseGuards } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import { z } from 'zod';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { OrigenGuard } from '../../../common/identidad/origen.guard';
import { Identidad, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { EstudiantesServicio } from '../application/estudiantes/estudiantes.servicio';
import { correlacionDe } from './esquemas';

const SolicitudSchema = z.object({ correoInstitucional: z.string().trim().email().max(254) });
const TokenSchema = z.object({ token: z.string().min(43).max(64).regex(/^[A-Za-z0-9_-]+$/) });
const DominioSchema = z.object({ dominio: z.string().trim().min(4).max(120), institucion: z.string().trim().min(2).max(160) });

/** Condición de estudiante (US12). Contrato: contracts/api-identidad.openapi.yaml. */
@Controller('api/identidad')
@UseGuards(OrigenGuard, RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
export class EstudiantesController {
  constructor(@Inject(EstudiantesServicio) private readonly estudiantes: EstudiantesServicio) {}

  @Post('yo/estudiante')
  @HttpCode(202)
  @Requiere()
  async solicitar(@Identidad() ctx: ContextoIdentidad, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    await this.estudiantes.solicitar(ctx, validar(SolicitudSchema, cuerpo).correoInstitucional, correlacionDe(correlacion));
    return { mensaje: 'Te enviamos un enlace a tu correo institucional. Ábrelo con tu cuenta iniciada.' };
  }

  @Post('estudiante/confirmacion')
  @HttpCode(200)
  @Requiere()
  confirmar(@Identidad() ctx: ContextoIdentidad, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    return this.estudiantes.confirmar(ctx, validar(TokenSchema, cuerpo).token, correlacionDe(correlacion));
  }

  @Get('dominios-institucionales')
  @Requiere('administrador')
  dominios() {
    return this.estudiantes.dominios();
  }

  @Post('dominios-institucionales')
  @Requiere('administrador')
  agregar(@Identidad() ctx: ContextoIdentidad, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    const { dominio, institucion } = validar(DominioSchema, cuerpo);
    return this.estudiantes.agregarDominio(ctx, dominio, institucion, correlacionDe(correlacion));
  }
}
