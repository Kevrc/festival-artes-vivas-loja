import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import { z } from 'zod';
import { ErrorConCodigo, ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { Identidad, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { IncidenciasServicio } from '../application/incidencias/incidencias.servicio';
import type { ConteoVista, IncidenciaVista } from '../application/puertos';
import { FechaSchema, UuidSchema, correlacionDe } from './esquemas';

const IncidenciaSchema = z.object({
  sedeId: z.string().uuid(),
  funcionId: z.string().uuid().optional(),
  tipo: z.enum(['retraso', 'falla_tecnica', 'clima', 'emergencia_medica', 'aforo_superado', 'otra']),
  descripcion: z.string().trim().min(3).max(1000),
  afectaPublico: z.boolean(),
});
const ConteoSchema = z.object({ cantidad: z.number().int().min(0).max(200_000), metodo: z.string().trim().min(2).max(120) });
const FiltroSchema = z.object({ sedeId: z.string().uuid().optional(), fecha: FechaSchema.optional(), estado: z.enum(['abierta', 'atendida']).optional() });

function claveIdempotencia(clave: string | undefined): string {
  if (!clave || clave.length < 8 || clave.length > 128) throw new ErrorConCodigo(400, 'idempotencia_requerida', 'Falta la cabecera Idempotency-Key (8 a 128 caracteres).');
  return clave;
}

const aIncidenciaDto = (i: IncidenciaVista & { ofrecerReprogramar?: boolean }) => ({
  id: i.id,
  sedeId: i.sedeId,
  ...(i.funcionId ? { funcionId: i.funcionId } : {}),
  tipo: i.tipo,
  descripcion: i.descripcion,
  afectaPublico: i.afectaPublico,
  origen: i.origen,
  estado: i.estado,
  ...(i.ofrecerReprogramar !== undefined ? { ofrecerReprogramar: i.ofrecerReprogramar } : {}),
  ocurridaEn: i.ocurridaEn.toISOString(),
});
const aConteoDto = (c: ConteoVista) => ({ id: c.id, funcionId: c.funcionId, cantidad: c.cantidad, metodo: c.metodo, registradoEn: c.registradoEn.toISOString() });

/** Incidencias y conteos (US4). El alcance de sede del jefe de sala se comprueba en el servicio (RN-009). */
@Controller('api/operacion')
@UseGuards(RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
export class IncidenciasController {
  constructor(@Inject(IncidenciasServicio) private readonly servicio: IncidenciasServicio) {}

  @Get('ediciones/:edicionId/incidencias')
  @Requiere('programador', 'jefe_sala', 'direccion', 'administrador')
  async listar(@Identidad() ctx: ContextoIdentidad, @Param('edicionId') edicionId: string, @Query() q: unknown) {
    return (await this.servicio.listar(ctx, validar(UuidSchema, edicionId), validar(FiltroSchema, q))).map(aIncidenciaDto);
  }

  @Post('ediciones/:edicionId/incidencias')
  @Requiere('jefe_sala', 'programador')
  async registrar(
    @Identidad() ctx: ContextoIdentidad,
    @Param('edicionId') edicionId: string,
    @Body() cuerpo: unknown,
    @Headers('idempotency-key') clave: string | undefined,
    @Headers('x-correlation-id') correlacion: string | undefined,
  ) {
    const i = await this.servicio.registrar(ctx, validar(UuidSchema, edicionId), validar(IncidenciaSchema, cuerpo), claveIdempotencia(clave), correlacionDe(correlacion));
    return aIncidenciaDto(i);
  }

  @Patch('incidencias/:incidenciaId')
  @Requiere('jefe_sala', 'programador')
  async atender(@Identidad() ctx: ContextoIdentidad, @Param('incidenciaId') id: string, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    validar(z.object({ estado: z.literal('atendida') }), cuerpo);
    return aIncidenciaDto(await this.servicio.atender(ctx, validar(UuidSchema, id), correlacionDe(correlacion)));
  }

  @Post('funciones/:funcionId/conteos')
  @Requiere('jefe_sala', 'programador')
  async conteo(
    @Identidad() ctx: ContextoIdentidad,
    @Param('funcionId') funcionId: string,
    @Body() cuerpo: unknown,
    @Headers('idempotency-key') clave: string | undefined,
    @Headers('x-correlation-id') correlacion: string | undefined,
  ) {
    const { cantidad, metodo } = validar(ConteoSchema, cuerpo);
    return aConteoDto(await this.servicio.registrarConteo(ctx, validar(UuidSchema, funcionId), cantidad, metodo, claveIdempotencia(clave), correlacionDe(correlacion)));
  }
}
