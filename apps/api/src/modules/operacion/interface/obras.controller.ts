import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import type { Response } from 'express';
import { Identidad, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { ObrasServicio } from '../application/obras/obras.servicio';
import { REPOSITORIO_OPERACION, type RepositorioOperacion } from '../application/puertos';
import { FiltroObrasSchema, ObraEntradaSchema, UuidSchema, aObraDto, aSedeDto, correlacionDe, etag, versionDe } from './esquemas';

/** Obras (US1-AS5, FR-007) y sedes de solo lectura para la grilla. */
@Controller('api/operacion')
@UseGuards(RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
export class ObrasController {
  constructor(
    @Inject(ObrasServicio) private readonly obras: ObrasServicio,
    @Inject(REPOSITORIO_OPERACION) private readonly repo: RepositorioOperacion,
  ) {}

  @Get('ediciones/:edicionId/obras')
  @Requiere('programador', 'direccion', 'administrador')
  async buscar(@Param('edicionId') edicionId: string, @Query() query: unknown) {
    const obras = await this.obras.buscar(validar(UuidSchema, edicionId), validar(FiltroObrasSchema, query));
    return obras.map(aObraDto);
  }

  @Post('ediciones/:edicionId/obras')
  @Requiere('programador')
  async crear(
    @Param('edicionId') edicionId: string,
    @Body() cuerpo: unknown,
    @Identidad() actor: ContextoIdentidad,
    @Headers('x-correlation-id') correlacion: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const obra = await this.obras.crearInvitada(validar(UuidSchema, edicionId), validar(ObraEntradaSchema, cuerpo), { actor, correlacionId: correlacionDe(correlacion) });
    res.status(201).setHeader('ETag', etag(obra.version));
    return aObraDto(obra);
  }

  @Patch('obras/:obraId')
  @Requiere('programador')
  async actualizar(
    @Param('obraId') obraId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() cuerpo: unknown,
    @Identidad() actor: ContextoIdentidad,
    @Headers('x-correlation-id') correlacion: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.obras.actualizar(validar(UuidSchema, obraId), versionDe(ifMatch), validar(ObraEntradaSchema, cuerpo), {
      actor,
      correlacionId: correlacionDe(correlacion),
    });
    res.setHeader('ETag', etag(r.obra.version));
    return {
      obra: aObraDto(r.obra),
      conflictos: r.conflictos.map((c) => ({ ...c, inicio: c.inicio.toISOString(), fin: c.fin.toISOString(), libreDesde: c.libreDesde.toISOString() })),
    };
  }

  /** Lectura de ediciones para el selector del panel; crear y editar ediciones es US6. */
  @Get('ediciones')
  @Requiere('programador', 'jefe_sala', 'direccion', 'administrador')
  ediciones() {
    return this.repo.ediciones();
  }

  @Get('ediciones/:edicionId/sedes')
  @Requiere('programador', 'jefe_sala', 'direccion', 'administrador')
  async sedes(@Param('edicionId') edicionId: string) {
    return (await this.repo.sedesDeEdicion(validar(UuidSchema, edicionId), false)).map(aSedeDto);
  }
}
