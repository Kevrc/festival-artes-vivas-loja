import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Post, Put, Res, UseFilters, UseGuards } from '@nestjs/common';
import { AlcanceRolDto, type ContextoIdentidad, RolPersonal } from '@fiavl/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { OrigenGuard } from '../../../common/identidad/origen.guard';
import { Identidad, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import type { CuentaPersonal } from '../application/puertos';
import { PersonalServicio } from '../application/personal/personal.servicio';
import { correlacionDe } from './esquemas';

const RolSchema = z.object({ rol: RolPersonal, alcance: AlcanceRolDto.extend({ valor: z.string().trim().min(1).max(120) }).nullable().default(null) });
const CrearSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  correo: z.string().trim().email().max(254),
  roles: z.array(RolSchema).min(1).max(20),
});
const RolesSchema = z.object({ roles: z.array(RolSchema).max(20) });
const EstadoSchema = z.object({ estado: z.enum(['desactivada', 'verificada']) });
const MotivoSchema = z.object({ motivo: z.string().trim().min(3).max(500) });

const aDto = (c: CuentaPersonal) => ({
  cuentaId: c.cuentaId,
  nombre: c.nombre,
  correo: c.correo,
  estado: c.estado,
  roles: c.roles,
  segundoFactorActivo: c.segundoFactorActivo,
});

/** Cuentas del personal (US9, FR-019, FR-024). Solo administración; cada cambio queda auditado. */
@Controller('api/identidad/personal')
@UseGuards(OrigenGuard, RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
@Requiere('administrador')
export class PersonalController {
  constructor(@Inject(PersonalServicio) private readonly personal: PersonalServicio) {}

  @Get()
  async listar(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    return (await this.personal.listar()).map(aDto);
  }

  @Post()
  async crear(@Identidad() ctx: ContextoIdentidad, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    return aDto(await this.personal.crear(ctx, validar(CrearSchema, cuerpo), correlacionDe(correlacion)));
  }

  @Put(':cuentaId/roles')
  async roles(@Identidad() ctx: ContextoIdentidad, @Param('cuentaId') cuentaId: string, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    const id = validar(z.string().uuid(), cuentaId);
    return aDto(await this.personal.reemplazarRoles(ctx, id, validar(RolesSchema, cuerpo).roles, correlacionDe(correlacion)));
  }

  @Put(':cuentaId/estado')
  @HttpCode(204)
  async estado(@Identidad() ctx: ContextoIdentidad, @Param('cuentaId') cuentaId: string, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    await this.personal.cambiarEstado(ctx, validar(z.string().uuid(), cuentaId), validar(EstadoSchema, cuerpo).estado, correlacionDe(correlacion));
  }

  @Delete(':cuentaId/segundo-factor')
  @HttpCode(204)
  async restablecer(@Identidad() ctx: ContextoIdentidad, @Param('cuentaId') cuentaId: string, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    await this.personal.restablecerSegundoFactor(ctx, validar(z.string().uuid(), cuentaId), validar(MotivoSchema, cuerpo).motivo, correlacionDe(correlacion));
  }
}
