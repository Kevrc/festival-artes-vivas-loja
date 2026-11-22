import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import type { Response } from 'express';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { Identidad, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { CambiosServicio } from '../application/cambios/cambios.servicio';
import { RELOJ_OPERACION, type RelojOperacion } from '../application/puertos';
import { CancelacionSchema, ReprogramacionSchema, UuidSchema, aFuncionDto, correlacionDe, etag, versionDe } from './esquemas';

/** Reprogramar, cancelar e historial de una función (US3, FR-006). */
@Controller('api/operacion/funciones/:funcionId')
@UseGuards(RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
export class CambiosController {
  constructor(
    @Inject(CambiosServicio) private readonly cambios: CambiosServicio,
    @Inject(RELOJ_OPERACION) private readonly ahora: RelojOperacion,
  ) {}

  @Post('reprogramacion')
  @HttpCode(200)
  @Requiere('programador')
  async reprogramar(
    @Param('funcionId') funcionId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() cuerpo: unknown,
    @Identidad() actor: ContextoIdentidad,
    @Headers('x-correlation-id') correlacion: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.cambios.reprogramar(validar(UuidSchema, funcionId), versionDe(ifMatch), validar(ReprogramacionSchema, cuerpo), {
      actor,
      correlacionId: correlacionDe(correlacion),
    });
    res.setHeader('ETag', etag(f.version));
    return aFuncionDto(f, this.ahora());
  }

  @Post('cancelacion')
  @HttpCode(200)
  @Requiere('programador')
  async cancelar(
    @Param('funcionId') funcionId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() cuerpo: unknown,
    @Identidad() actor: ContextoIdentidad,
    @Headers('x-correlation-id') correlacion: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { motivo } = validar(CancelacionSchema, cuerpo);
    const f = await this.cambios.cancelar(validar(UuidSchema, funcionId), versionDe(ifMatch), motivo, { actor, correlacionId: correlacionDe(correlacion) });
    res.setHeader('ETag', etag(f.version));
    return aFuncionDto(f, this.ahora());
  }

  @Get('cambios')
  @Requiere('programador', 'direccion', 'administrador')
  async historial(@Param('funcionId') funcionId: string) {
    const lista = await this.cambios.historial(validar(UuidSchema, funcionId));
    return lista.map((c) => ({ ...c, registradoEn: c.registradoEn.toISOString() }));
  }
}
