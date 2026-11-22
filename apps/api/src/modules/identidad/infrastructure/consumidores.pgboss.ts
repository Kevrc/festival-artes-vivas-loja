import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ColaEventos } from '../../../common/datos/datos.module';
import { type Manejador, consumirEventos } from '../../../common/datos/consumir-eventos';
import { NotificacionesServicio } from '../application/notificaciones/notificaciones.servicio';
import { MANEJADORES_IDENTIDAD } from '../application/puertos';
import { COLA_ENVIO } from './cola-notificaciones.pgboss';

/**
 * Consume las colas `identidad.*` (eventos de 002, 003 y Operación) y los trabajos de envío
 * `identidad.enviar-notificacion` (ADR-0011). Solo corre en el worker.
 */
@Injectable()
export class ConsumidoresIdentidad implements OnModuleInit {
  private readonly log = new Logger(ConsumidoresIdentidad.name);

  constructor(
    @Inject(ColaEventos) private readonly cola: ColaEventos,
    @Inject(MANEJADORES_IDENTIDAD) private readonly manejadores: Manejador[],
    @Inject(NotificacionesServicio) private readonly notificaciones: NotificacionesServicio,
  ) {}

  async onModuleInit() {
    await consumirEventos(this.cola, 'identidad', this.manejadores, this.log);
    if (!this.cola.habilitada) return;
    const boss = await this.cola.obtener();
    await boss.createQueue(COLA_ENVIO);
    // Un fallo lanza: pg-boss reintenta con la espera creciente definida al encolar.
    await boss.work<{ notificacionId: string; correlacionId?: string }>(COLA_ENVIO, { batchSize: 5 }, async (trabajos) => {
      for (const t of trabajos) await this.notificaciones.enviar(t.data.notificacionId, t.data.correlacionId);
    });
  }
}
