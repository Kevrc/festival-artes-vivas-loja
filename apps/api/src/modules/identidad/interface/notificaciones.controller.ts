import { Controller, Get, Inject, Query, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { OrigenGuard } from '../../../common/identidad/origen.guard';
import { Identidad, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { type NotificacionGuardada, REPOSITORIO_IDENTIDAD, type RepositorioIdentidad } from '../application/puertos';
import { redactar } from '../domain/plantillas/avisos';

const PAGINA = 20;
const web = process.env.WEB_URL ?? 'http://localhost:3100';

/** Vista pública de una notificación: sin correo ni datos de la plantilla (pueden llevar tokens). */
const aDto = (n: NotificacionGuardada) => ({
  id: n.id,
  plantilla: n.plantilla,
  asunto: redactar(n.plantilla, n.datos, web).asunto,
  categoria: n.categoria,
  estado: n.estado,
  intentos: n.intentos,
  creadaEn: n.creadaEn.toISOString(),
  enviadaEn: n.enviadaEn?.toISOString() ?? null,
});

/** Historial de avisos (US10-AS5) y revisión de los fallidos (US10-AS2). Contrato: api-identidad. */
@Controller('api/identidad')
@UseGuards(OrigenGuard, RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
export class NotificacionesController {
  constructor(@Inject(REPOSITORIO_IDENTIDAD) private readonly repo: RepositorioIdentidad) {}

  @Get('yo/notificaciones')
  @Requiere()
  async mias(@Identidad() ctx: ContextoIdentidad, @Query('cursor') cursor: string | undefined, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    const antes = cursor ? new Date(validar(z.string().datetime({ offset: true }), cursor)) : null;
    const filas = await this.repo.notificacionesDe(ctx.cuentaId, antes, PAGINA + 1);
    const items = filas.slice(0, PAGINA).map(aDto);
    return { items, siguiente: filas.length > PAGINA ? items[items.length - 1]!.creadaEn : null };
  }

  @Get('notificaciones/fallidas')
  @Requiere('administrador')
  async fallidas(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    return (await this.repo.notificacionesFallidas(100)).map((n) => ({ ...aDto(n), ultimoError: n.ultimoError }));
  }
}
