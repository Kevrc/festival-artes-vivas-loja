import { Controller, Get, Headers, HttpCode, Inject, Param, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import type { Response } from 'express';
import { ErrorConCodigo, ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { Identidad, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { validar } from '../../../common/http/validar';
import { PublicacionServicio } from '../application/publicacion/publicacion.servicio';
import { RELOJ_OPERACION, type RelojOperacion } from '../application/puertos';
import { UuidSchema, aFuncionDto, correlacionDe, etag, versionDe } from './esquemas';

/** Publicación de la programación (US2). Contrato: contracts/api-operacion.openapi.yaml. */
@Controller('api/operacion')
@UseGuards(RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
@Requiere('programador')
export class PublicacionController {
  constructor(
    @Inject(PublicacionServicio) private readonly publicacion: PublicacionServicio,
    @Inject(RELOJ_OPERACION) private readonly ahora: RelojOperacion,
  ) {}

  @Get('ediciones/:edicionId/publicacion/validacion')
  validar(@Param('edicionId') edicionId: string) {
    return this.publicacion.validar(validar(UuidSchema, edicionId));
  }

  /**
   * `Idempotency-Key` obligatoria: repetir la publicación sin borradores nuevos no emite eventos,
   * así que un reintento del cliente es inocuo.
   */
  @Post('ediciones/:edicionId/publicacion')
  @HttpCode(200)
  publicarEdicion(
    @Param('edicionId') edicionId: string,
    @Headers('idempotency-key') clave: string | undefined,
    @Identidad() actor: ContextoIdentidad,
    @Headers('x-correlation-id') correlacion: string | undefined,
  ) {
    if (!clave || clave.length < 8 || clave.length > 128) {
      throw new ErrorConCodigo(400, 'idempotencia_requerida', 'Falta la cabecera Idempotency-Key (8 a 128 caracteres).');
    }
    return this.publicacion.publicarEdicion(validar(UuidSchema, edicionId), { actor, correlacionId: correlacionDe(correlacion) });
  }

  @Post('funciones/:funcionId/publicacion')
  @HttpCode(200)
  async publicarFuncion(
    @Param('funcionId') funcionId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Identidad() actor: ContextoIdentidad,
    @Headers('x-correlation-id') correlacion: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.publicacion.publicarFuncion(validar(UuidSchema, funcionId), versionDe(ifMatch), { actor, correlacionId: correlacionDe(correlacion) });
    res.setHeader('ETag', etag(f.version));
    return aFuncionDto(f, this.ahora());
  }
}
