import { DisponibilidadController } from './disponibilidad.controller';
import { PagosWebhookController } from './pagos-webhook.controller';
import { PedidosController } from './pedidos.controller';
import { TaquillaController } from './taquilla.controller';
import { ValidadorController } from './validador.controller';

export const CONTROLADORES_BOLETERIA = [
  DisponibilidadController,
  PedidosController,
  PagosWebhookController,
  TaquillaController,
  ValidadorController,
];
