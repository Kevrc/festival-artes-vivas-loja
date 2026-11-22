import { Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { Identidad, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { EstadisticasServicio } from '../application/estadisticas/estadisticas.servicio';
import { FechaSchema, UuidSchema, correlacionDe } from './esquemas';

const ConsultaSchema = z.object({
  dimension: z.enum(['dia', 'sede', 'disciplina', 'componente', 'pais', 'funcion']),
  desde: FechaSchema.optional(),
  hasta: FechaSchema.optional(),
  sedeId: z.string().uuid().optional(),
  disciplina: z.string().max(40).optional(),
  componente: z.string().max(40).optional(),
  pais: z.string().max(80).optional(),
});

/** Panel de estadísticas e informe de cierre (US5). Contrato: contracts/api-operacion.openapi.yaml. */
@Controller('api/operacion/ediciones/:edicionId')
@UseGuards(RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
export class EstadisticasController {
  constructor(@Inject(EstadisticasServicio) private readonly servicio: EstadisticasServicio) {}

  @Get('indicadores')
  @Requiere('direccion', 'programador', 'administrador')
  indicadores(@Param('edicionId') edicionId: string, @Query() q: unknown) {
    const { dimension, ...filtro } = validar(ConsultaSchema, q);
    return this.servicio.indicadores(validar(UuidSchema, edicionId), dimension, filtro);
  }

  /** US5-AS3: CSV UTF-8 con BOM y `;`, con los mismos filtros. */
  @Get('indicadores.csv')
  @Requiere('direccion', 'programador', 'administrador')
  async csv(@Param('edicionId') edicionId: string, @Query() q: unknown, @Res({ passthrough: true }) res: Response) {
    const { dimension, ...filtro } = validar(ConsultaSchema, q);
    const texto = await this.servicio.csv(validar(UuidSchema, edicionId), dimension, filtro);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="indicadores-${dimension}.csv"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return texto;
  }

  @Get('informe')
  @Requiere('direccion', 'administrador')
  informe(@Param('edicionId') edicionId: string) {
    return this.servicio.informe(validar(UuidSchema, edicionId));
  }

  @Post('informe')
  @HttpCode(200)
  @Requiere('administrador')
  regenerar(@Param('edicionId') edicionId: string, @Identidad() actor: ContextoIdentidad, @Headers('x-correlation-id') correlacion: string | undefined) {
    return this.servicio.regenerar(validar(UuidSchema, edicionId), actor.cuentaId, correlacionDe(correlacion));
  }
}
