import { Body, Controller, Headers, HttpCode, Inject, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { ProblemaCodigoFilter } from '../../../common/http/problema-codigo.filter';
import { validar } from '../../../common/http/validar';
import { OrigenGuard } from '../../../common/identidad/origen.guard';
import { Identidad, PermiteSinSegundoFactor, Requiere, RequiereGuard } from '../../../common/identidad/requiere.guard';
import { MiCuentaServicio } from '../application/mi-cuenta/mi-cuenta.servicio';
import { SegundoFactorServicio } from '../application/segundo-factor/segundo-factor.servicio';
import { correlacionDe } from './esquemas';

const CodigoSchema = z.object({ codigo: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 dígitos') });

/** Segundo factor del personal (US9-AS3): las únicas rutas que una sesión restringida puede usar. */
@Controller('api/identidad/segundo-factor')
@UseGuards(OrigenGuard, RequiereGuard)
@UseFilters(ProblemaCodigoFilter)
@Requiere()
@PermiteSinSegundoFactor()
export class SegundoFactorController {
  constructor(
    @Inject(SegundoFactorServicio) private readonly segundoFactor: SegundoFactorServicio,
    @Inject(MiCuentaServicio) private readonly miCuenta: MiCuentaServicio,
  ) {}

  @Post('alta')
  @HttpCode(200)
  alta(@Identidad() ctx: ContextoIdentidad, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store'); // el secreto no se guarda en ninguna caché
    return this.segundoFactor.alta(ctx);
  }

  @Post('verificacion')
  @HttpCode(200)
  async verificar(@Identidad() ctx: ContextoIdentidad, @Body() cuerpo: unknown, @Headers('x-correlation-id') correlacion: string | undefined) {
    await this.segundoFactor.verificar(ctx, validar(CodigoSchema, cuerpo).codigo, correlacionDe(correlacion));
    return this.miCuenta.yo({ ...ctx, segundoFactorOk: true });
  }
}
