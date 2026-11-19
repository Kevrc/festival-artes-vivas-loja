import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { validar } from '../../../common/http/validar';
import { PrismaFavoritosRepository } from '../infrastructure/prisma-favoritos.repository';
import { noEncontrado } from './cartelera.controller';
import { Uuid } from './esquemas';
import { SesionGuard } from './sesion.guard';

type ConCuenta = { cuentaId: string };

/** US5: agenda personal de la cuenta. */
@Controller('api/cartelera/favoritos')
@UseGuards(SesionGuard)
export class FavoritosController {
  constructor(@Inject(PrismaFavoritosRepository) private readonly favoritos: PrismaFavoritosRepository) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  listar(@Req() req: ConCuenta) {
    return this.favoritos.listar(req.cuentaId);
  }

  @Put(':funcionId')
  @HttpCode(204)
  async marcar(@Req() req: ConCuenta, @Param('funcionId') funcionId: string) {
    if (!(await this.favoritos.marcar(req.cuentaId, validar(Uuid, funcionId)))) noEncontrado('Función no encontrada');
  }

  @Delete(':funcionId')
  @HttpCode(204)
  async quitar(@Req() req: ConCuenta, @Param('funcionId') funcionId: string) {
    await this.favoritos.quitar(req.cuentaId, validar(Uuid, funcionId));
  }

  @Post('fusion')
  @HttpCode(200)
  fusionar(@Req() req: ConCuenta, @Body() cuerpo: unknown) {
    const { funcionIds } = validar(z.object({ funcionIds: z.array(Uuid).max(200) }), cuerpo);
    return this.favoritos.fusionar(req.cuentaId, funcionIds);
  }
}
