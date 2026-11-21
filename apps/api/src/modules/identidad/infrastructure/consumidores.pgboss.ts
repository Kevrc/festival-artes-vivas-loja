import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ColaEventos } from '../../../common/datos/datos.module';
import { type Manejador, consumirEventos } from '../../../common/datos/consumir-eventos';
import { MANEJADORES_IDENTIDAD } from '../application/puertos';

/** Consume las colas `identidad.*` (eventos de 002, 003 y Operación). Solo corre en el worker. */
@Injectable()
export class ConsumidoresIdentidad implements OnModuleInit {
  private readonly log = new Logger(ConsumidoresIdentidad.name);

  constructor(
    @Inject(ColaEventos) private readonly cola: ColaEventos,
    @Inject(MANEJADORES_IDENTIDAD) private readonly manejadores: Manejador[],
  ) {}

  async onModuleInit() {
    await consumirEventos(this.cola, 'identidad', this.manejadores, this.log);
  }
}
