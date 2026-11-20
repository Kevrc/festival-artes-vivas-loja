import { Body, Controller, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { validar } from '../../../common/http/validar';
import { ProcesarWebhookPago } from '../application/compras/procesar-webhook';
import { WebhookPagoSchema } from './esquemas';

@Controller('api/boleteria/pagos')
export class PagosWebhookController {
  constructor(@Inject(ProcesarWebhookPago) private readonly procesador: ProcesarWebhookPago) {}

  @Post('webhook')
  @HttpCode(200)
  recibir(
    @Headers('x-firma-proveedor') firma: string | undefined,
    @Headers('x-correlation-id') correlacionId: string | undefined,
    @Body() cuerpo: unknown,
  ) {
    const firmaValida = validar(z.string().min(1), firma);
    const payload = validar(WebhookPagoSchema, cuerpo);
    const cuerpoCrudo = JSON.stringify(cuerpo);
    return this.procesador.ejecutarWebhook({
      firma: firmaValida,
      cuerpoCrudo,
      payload,
      correlacionId,
    });
  }
}
