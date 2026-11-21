import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ColaEventos } from '../../../common/datos/datos.module';
import { type Manejador, consumirEventos } from '../../../common/datos/consumir-eventos';
import { MANEJADORES_OPERACION } from '../application/puertos';

/** Consume las colas `operacion.*` (eventos de 002 y 003). Solo corre en el worker (ADR-0008). */
@Injectable()
export class ConsumidoresOperacion implements OnModuleInit {
  private readonly log = new Logger(ConsumidoresOperacion.name);

  constructor(
    @Inject(ColaEventos) private readonly cola: ColaEventos,
    @Inject(MANEJADORES_OPERACION) private readonly manejadores: Manejador[],
  ) {}

  async onModuleInit() {
    await consumirEventos(this.cola, 'operacion', this.manejadores, this.log);
  }
}
