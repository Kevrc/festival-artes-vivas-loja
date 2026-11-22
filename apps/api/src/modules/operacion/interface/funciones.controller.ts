import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import type { Response } from 'express';
import { Identidad, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { FuncionesServicio } from '../application/funciones/funciones.servicio';
import { GrillaDelDia } from '../application/funciones/grilla-del-dia';
import { noEncontrado } from '../application/errores';
import { RELOJ_OPERACION, REPOSITORIO_OPERACION, type RelojOperacion, type RepositorioOperacion } from '../application/puertos';
import {
  FechaSchema,
  FuncionEdicionSchema,
  FuncionEntradaSchema,
  UuidSchema,
  aFuncionDto,
  aSedeDto,
  correlacionDe,
  etag,
  versionDe,
} from './esquemas';

/** Grilla y funciones (US1). Contrato: contracts/api-operacion.openapi.yaml. */
@Controller('api/operacion')
@UseGuards(RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
export class FuncionesController {
  constructor(
    @Inject(FuncionesServicio) private readonly funciones: FuncionesServicio,
    @Inject(GrillaDelDia) private readonly grilla: GrillaDelDia,
    @Inject(REPOSITORIO_OPERACION) private readonly repo: RepositorioOperacion,
    @Inject(RELOJ_OPERACION) private readonly ahora: RelojOperacion,
  ) {}

  @Get('ediciones/:edicionId/grilla')
  @Requiere('programador', 'jefe_sala', 'direccion', 'administrador')
  async obtenerGrilla(@Param('edicionId') edicionId: string, @Query('fecha') fecha: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    const g = await this.grilla.ejecutar(validar(UuidSchema, edicionId), validar(FechaSchema, fecha));
    const ahora = this.ahora();
    return { fecha: g.fecha, feriado: g.feriado, sedes: g.sedes.map(aSedeDto), funciones: g.funciones.map((f) => aFuncionDto(f, ahora)) };
  }

  @Post('ediciones/:edicionId/funciones')
  @Requiere('programador')
  async crear(
    @Param('edicionId') edicionId: string,
    @Body() cuerpo: unknown,
    @Identidad() actor: ContextoIdentidad,
    @Headers('x-correlation-id') correlacion: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.funciones.crear(validar(UuidSchema, edicionId), validar(FuncionEntradaSchema, cuerpo), { actor, correlacionId: correlacionDe(correlacion) });
    res.status(201).setHeader('ETag', etag(f.version));
    return aFuncionDto(f, this.ahora());
  }

  @Get('funciones/:funcionId')
  @Requiere('programador', 'jefe_sala', 'direccion', 'administrador')
  async obtener(@Param('funcionId') funcionId: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.repo.funcion(validar(UuidSchema, funcionId));
    if (!f) throw noEncontrado('La función');
    res.setHeader('ETag', etag(f.version));
    return aFuncionDto(f, this.ahora());
  }

  @Patch('funciones/:funcionId')
  @Requiere('programador')
  async editar(
    @Param('funcionId') funcionId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() cuerpo: unknown,
    @Identidad() actor: ContextoIdentidad,
    @Headers('x-correlation-id') correlacion: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.funciones.editar(validar(UuidSchema, funcionId), versionDe(ifMatch), validar(FuncionEdicionSchema, cuerpo), {
      actor,
      correlacionId: correlacionDe(correlacion),
    });
    res.setHeader('ETag', etag(f.version));
    return aFuncionDto(f, this.ahora());
  }

  @Delete('funciones/:funcionId')
  @HttpCode(204)
  @Requiere('programador')
  async eliminar(
    @Param('funcionId') funcionId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Identidad() actor: ContextoIdentidad,
    @Headers('x-correlation-id') correlacion: string | undefined,
  ) {
    await this.funciones.eliminarBorrador(validar(UuidSchema, funcionId), versionDe(ifMatch), { actor, correlacionId: correlacionDe(correlacion) });
  }
}
