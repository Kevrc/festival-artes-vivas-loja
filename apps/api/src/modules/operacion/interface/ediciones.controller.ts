import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { Identidad, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { MaestrosServicio } from '../application/maestros/maestros.servicio';
import { FechaSchema, UuidSchema, aSedeDto, correlacionDe, etag, versionDe } from './esquemas';

const EdicionSchema = z.object({
  numero: z.string().trim().min(1).max(20),
  anio: z.number().int().min(2016).max(9999),
  fechaInicio: FechaSchema,
  fechaFin: FechaSchema,
  paisInvitado: z.string().trim().min(2).max(80).nullable().optional(),
  precioCentavos: z.number().int().min(0).max(100_000_00).optional(),
  maxPagadasPersona: z.number().int().min(1).max(50).optional(),
  maxReservasPersona: z.number().int().min(1).max(50).optional(),
  aPartirDe: z.string().uuid().optional(),
});
const Punto = z.object({ lat: z.number(), lng: z.number(), nombre: z.string().trim().max(120).optional() });
const SedeSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  tipo: z.enum(['teatro', 'centro_cultural', 'museo', 'espacio_publico', 'recorrido']),
  direccion: z.string().trim().min(3).max(200),
  lat: z.number(),
  lng: z.number(),
  recorrido: z.array(Punto).max(200).nullable().default(null),
  aforo: z.number().int().min(1).max(100_000).nullable().default(null),
  // Constitución VII: la accesibilidad es obligatoria y explícita.
  accesibilidad: z.object({ sillaRuedas: z.boolean(), banoAccesible: z.boolean(), rampa: z.boolean() }),
  montajeMin: z.number().int().min(0).max(600).default(30),
  horarioTaquilla: z.string().trim().max(200).nullable().default(null),
  activa: z.boolean().default(true),
});

/** Ediciones, sedes y parámetros (US6). Escritura solo para administración. */
@Controller('api/operacion')
@UseGuards(RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
export class EdicionesController {
  constructor(@Inject(MaestrosServicio) private readonly servicio: MaestrosServicio) {}

  @Post('ediciones')
  @Requiere('administrador')
  async crear(@Identidad() actor: ContextoIdentidad, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined, @Res({ passthrough: true }) res: Response) {
    const r = await this.servicio.crearEdicion(validar(EdicionSchema, cuerpo), { actor, correlacionId: correlacionDe(correlacion) });
    res.setHeader('ETag', etag(r.edicion.version));
    return { ...r.edicion, advertencias: r.advertencias };
  }

  @Get('ediciones/:edicionId')
  @Requiere('programador', 'direccion', 'administrador')
  async ver(@Param('edicionId') edicionId: string, @Res({ passthrough: true }) res: Response) {
    const e = await this.servicio.edicion(validar(UuidSchema, edicionId));
    res.setHeader('ETag', etag(e.version));
    return e;
  }

  @Patch('ediciones/:edicionId')
  @Requiere('administrador')
  async actualizar(
    @Identidad() actor: ContextoIdentidad,
    @Param('edicionId') edicionId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() cuerpo: unknown,
    @Headers('x-correlation-id') correlacion: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.servicio.actualizarEdicion(validar(UuidSchema, edicionId), versionDe(ifMatch), validar(EdicionSchema.omit({ aPartirDe: true }), cuerpo), { actor, correlacionId: correlacionDe(correlacion) });
    res.setHeader('ETag', etag(r.edicion.version));
    return { ...r.edicion, advertencias: r.advertencias };
  }

  @Post('ediciones/:edicionId/sedes')
  @Requiere('administrador')
  async crearSede(@Identidad() actor: ContextoIdentidad, @Param('edicionId') edicionId: string, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined, @Res({ passthrough: true }) res: Response) {
    const s = await this.servicio.crearSede(validar(UuidSchema, edicionId), validar(SedeSchema, cuerpo), { actor, correlacionId: correlacionDe(correlacion) });
    res.setHeader('ETag', etag(s.version));
    return aSedeDto(s);
  }

  @Patch('sedes/:sedeId')
  @Requiere('administrador')
  async actualizarSede(
    @Identidad() actor: ContextoIdentidad,
    @Param('sedeId') sedeId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() cuerpo: unknown,
    @Headers('x-correlation-id') correlacion: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const s = await this.servicio.actualizarSede(validar(UuidSchema, sedeId), versionDe(ifMatch), validar(SedeSchema, cuerpo), { actor, correlacionId: correlacionDe(correlacion) });
    res.setHeader('ETag', etag(s.version));
    return aSedeDto(s);
  }

  @Delete('sedes/:sedeId')
  @HttpCode(204)
  @Requiere('administrador')
  async eliminarSede(@Identidad() actor: ContextoIdentidad, @Param('sedeId') sedeId: string, @Headers('x-correlation-id') correlacion: string | undefined) {
    await this.servicio.eliminarSede(validar(UuidSchema, sedeId), { actor, correlacionId: correlacionDe(correlacion) });
  }
}
