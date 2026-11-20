import {
  Body, Controller, ForbiddenException, Get, Header, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Req, UseFilters, UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { validar } from '../../../common/http/validar';
import { EvaluacionesServicio } from '../application/evaluaciones/evaluaciones.servicio';
import { puedeCoordinarProvincia } from '../application/politicas-autorizacion';
import type { ContextoConvocatorias } from '../application/puertos';
import { AlcanceEnControlador, ConvocatoriasGuard, RolesConvocatorias } from './convocatorias.guard';
import { ConvocatoriasHttpFilter } from './convocatorias-http.filter';

const EvaluacionSchema = z.object({
  calificaciones: z.array(z.object({ criterioId: z.string().uuid(), puntaje: z.number() })).max(50),
  observaciones: z.string().max(4000).optional().nullable(),
});
const ReaperturaSchema = z.object({ motivo: z.string().max(2000).optional().nullable() });

interface PeticionCuraduria extends Request {
  contextoConvocatorias?: ContextoConvocatorias;
}

/** Curaduría (US3): el curador solo opera su propia asignación; la coordinación consulta agregados y reabre con motivo. */
@Controller('api/convocatorias')
@UseFilters(ConvocatoriasHttpFilter)
export class CuraduriaController {
  constructor(@Inject(EvaluacionesServicio) private readonly evaluaciones: EvaluacionesServicio) {}

  @Get('curaduria/asignaciones')
  @Header('Cache-Control', 'no-store')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('curador')
  listar(@Req() req: PeticionCuraduria) {
    return this.evaluaciones.asignaciones(req.contextoConvocatorias!.cuentaId);
  }

  @Get('curaduria/asignaciones/:asignacionId/evaluacion')
  @Header('Cache-Control', 'no-store')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('curador')
  obtener(@Req() req: PeticionCuraduria, @Param('asignacionId', ParseUUIDPipe) asignacionId: string) {
    return this.evaluaciones.asignacion(req.contextoConvocatorias!.cuentaId, asignacionId);
  }

  @Put('curaduria/asignaciones/:asignacionId/evaluacion')
  @Header('Cache-Control', 'no-store')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('curador')
  guardar(@Req() req: PeticionCuraduria, @Param('asignacionId', ParseUUIDPipe) asignacionId: string, @Body() body: unknown) {
    return this.evaluaciones.guardar(req.contextoConvocatorias!.cuentaId, asignacionId, validar(EvaluacionSchema, body));
  }

  @Post('curaduria/asignaciones/:asignacionId/enviar')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('curador')
  enviar(@Req() req: PeticionCuraduria, @Param('asignacionId', ParseUUIDPipe) asignacionId: string) {
    return this.evaluaciones.enviar(req.contextoConvocatorias!.cuentaId, asignacionId);
  }

  @Get('panel/evaluaciones')
  @Header('Cache-Control', 'no-store')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('coordinación de convocatorias', 'coordinación provincial')
  @AlcanceEnControlador()
  async panel(@Req() req: PeticionCuraduria) {
    const contexto = req.contextoConvocatorias!;
    const todas = await this.evaluaciones.panel();
    return todas.filter((p) => puedeCoordinarProvincia(contexto, p.provincia ?? ''));
  }

  @Get('panel/postulaciones/:postulacionId/evaluacion')
  @Header('Cache-Control', 'no-store')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('coordinación de convocatorias', 'coordinación provincial')
  @AlcanceEnControlador()
  async agregado(@Req() req: PeticionCuraduria, @Param('postulacionId', ParseUUIDPipe) postulacionId: string) {
    const resumen = await this.evaluaciones.agregado(postulacionId);
    if (!resumen) throw new NotFoundException('Postulación inexistente');
    if (!puedeCoordinarProvincia(req.contextoConvocatorias!, resumen.provincia ?? '')) {
      throw new ForbiddenException('La postulación está fuera de su alcance provincial');
    }
    return resumen;
  }

  @Post('panel/evaluaciones/:evaluacionId/reabrir')
  @HttpCode(200)
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('coordinación de convocatorias', 'coordinación provincial')
  @AlcanceEnControlador()
  reabrir(@Req() req: PeticionCuraduria, @Param('evaluacionId', ParseUUIDPipe) evaluacionId: string, @Body() body: unknown) {
    const contexto = req.contextoConvocatorias!;
    const { motivo } = validar(ReaperturaSchema, body);
    return this.evaluaciones.reabrir(evaluacionId, contexto.cuentaId, motivo, (provincia) => puedeCoordinarProvincia(contexto, provincia ?? ''));
  }
}
