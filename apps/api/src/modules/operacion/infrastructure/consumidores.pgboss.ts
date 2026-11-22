import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ColaEventos } from '../../../common/datos/datos.module';
import { type Manejador, consumirEventos } from '../../../common/datos/consumir-eventos';
import { EstadisticasServicio } from '../application/estadisticas/estadisticas.servicio';
import { MANEJADORES_OPERACION } from '../application/puertos';

export const COLA_CIERRE = 'operacion.cerrar-ediciones';

/**
 * Consume las colas `operacion.*` y programa el cierre diario de ediciones a las 03:00 de Loja
 * (research R8, RN-007). Solo corre en el worker.
 */
@Injectable()
export class ConsumidoresOperacion implements OnModuleInit {
  private readonly log = new Logger(ConsumidoresOperacion.name);

  constructor(
    @Inject(ColaEventos) private readonly cola: ColaEventos,
    @Inject(MANEJADORES_OPERACION) private readonly manejadores: Manejador[],
    @Inject(EstadisticasServicio) private readonly estadisticas: EstadisticasServicio,
  ) {}

  async onModuleInit() {
    await consumirEventos(this.cola, 'operacion', this.manejadores, this.log);
    if (!this.cola.habilitada) return;
    const boss = await this.cola.obtener();
    await boss.createQueue(COLA_CIERRE);
    await boss.schedule(COLA_CIERRE, '0 3 * * *', {}, { tz: 'America/Guayaquil' });
    await boss.work(COLA_CIERRE, async () => {
      const correlacionId = randomUUID();
      const cerradas = await this.estadisticas.cerrarEdiciones(correlacionId);
      if (cerradas.length) this.log.log({ correlacionId, cerradas }, 'ediciones cerradas e informes congelados');
    });
  }
}
