import {
  Body, Controller, ForbiddenException, Get, Header, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, UseFilters, UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { validar } from '../../../common/http/validar';
import { AdmisionServicio } from '../application/admision/admision.servicio';
import { puedeCoordinarProvincia } from '../application/politicas-autorizacion';
import type { ContextoConvocatorias } from '../application/puertos';
import { PostulacionesPrismaRepository } from '../infrastructure/postulaciones-prisma.repository';
import { AlcanceEnControlador, ConvocatoriasGuard, RolesConvocatorias } from './convocatorias.guard';
import { ConvocatoriasHttpFilter } from './convocatorias-http.filter';

const ResolverSchema = z.object({
  decision: z.enum(['admitir', 'subsanar', 'no_admitir']),
  motivo: z.string().trim().max(2000).optional().nullable(),
  detalle: z.string().trim().max(4000).optional().nullable(),
});
const ListaSchema = z.object({
  estado: z.enum(['enviada', 'requiere_subsanacion', 'no_admitida', 'admitida']).optional(),
});

interface PeticionAdmision extends Request {
  contextoConvocatorias?: ContextoConvocatorias;
}

@Controller('api/convocatorias')
@UseFilters(ConvocatoriasHttpFilter)
export class AdmisionController {
  constructor(
    @Inject(PostulacionesPrismaRepository) private readonly repo: PostulacionesPrismaRepository,
    @Inject(AdmisionServicio) private readonly admision: AdmisionServicio,
  ) {}

  @Get('panel/postulaciones')
  @Header('Cache-Control', 'no-store')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('coordinación de convocatorias', 'coordinación provincial')
  @AlcanceEnControlador()
  listar(@Req() req: PeticionAdmision, @Query('estado') estado?: string) {
    const { estado: filtro } = validar(ListaSchema, { estado: estado || undefined });
    const provincia = this.provinciaPermitida(req.contextoConvocatorias!);
    return this.admision.listar({
      ...(filtro ? { estados: [filtro] } : {}),
      ...(provincia ? { provincia } : {}),
    });
  }

  @Post('panel/postulaciones/:postulacionId/admisibilidad')
  @HttpCode(200)
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('coordinación de convocatorias', 'coordinación provincial')
  @AlcanceEnControlador()
  async resolver(
    @Req() req: PeticionAdmision,
    @Param('postulacionId', ParseUUIDPipe) postulacionId: string,
    @Body() body: unknown,
  ) {
    const input = validar(ResolverSchema, body);
    const postulacion = await this.repo.obtenerPostulacion(postulacionId);
    if (!postulacion) throw new NotFoundException('Postulación inexistente');
    const contexto = req.contextoConvocatorias!;
    if (!puedeCoordinarProvincia(contexto, postulacion.convocatoria.provincia ?? '')) {
      throw new ForbiddenException('La postulación está fuera de su alcance provincial');
    }
    const actualizada = await this.admision.resolver(postulacionId, contexto.cuentaId, input);
    return {
      postulacionId: actualizada.id,
      numero: actualizada.numero,
      estado: actualizada.estado,
      subsanarHasta: actualizada.subsanarHasta?.toISOString() ?? null,
    };
  }

  @Post('postulaciones/:postulacionId/subsanar')
  @HttpCode(200)
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('postulante')
  async reenviar(@Req() req: PeticionAdmision, @Param('postulacionId', ParseUUIDPipe) postulacionId: string) {
    const actualizada = await this.admision.reenviar(postulacionId, req.contextoConvocatorias!.cuentaId);
    return {
      postulacionId: actualizada.id,
      numero: actualizada.numero,
      estado: actualizada.estado,
      subsanarHasta: actualizada.subsanarHasta?.toISOString() ?? null,
    };
  }

  private provinciaPermitida(contexto: ContextoConvocatorias): string | undefined {
    if (contexto.roles.some(({ rol }) => rol === 'coordinación de convocatorias')) return undefined;
    const provincia = contexto.roles.find(({ rol }) => rol === 'coordinación provincial')?.alcance?.provincia;
    if (!provincia) throw new ForbiddenException('Coordinación provincial sin alcance');
    return provincia;
  }
}
