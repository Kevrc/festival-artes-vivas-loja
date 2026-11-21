import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventoPublicadoIdentidad } from '@fiavl/contracts';
import { ColaEventos } from '../../../common/datos/datos.module';
import { crearColas, publicarEnCola } from '../../../common/datos/publicar-en-cola';
import type { PublicadorIdentidad } from '../application/puertos';

/**
 * En v1 ningún módulo está obligado a consumir los eventos de Identidad (clarificación 2026-11-20):
 * se publican sin destinos y quedan en el log. Un módulo que quiera consumirlos se añade aquí.
 */
export const DESTINOS_IDENTIDAD: Readonly<Record<EventoPublicadoIdentidad['tipo'], readonly string[]>> = {
  CuentaVerificada: [],
  RolAsignado: [],
  CuentaEliminada: [],
};

@Injectable()
export class PublicadorPgBossIdentidad implements PublicadorIdentidad, OnModuleInit {
  private readonly log = new Logger(PublicadorPgBossIdentidad.name);
  readonly publicados: EventoPublicadoIdentidad[] = [];
  private readonly capturar = process.env.NODE_ENV === 'test';

  constructor(@Inject(ColaEventos) private readonly cola: ColaEventos) {}

  async onModuleInit() {
    await crearColas(this.cola, DESTINOS_IDENTIDAD);
  }

  async publicar(eventoBruto: EventoPublicadoIdentidad): Promise<void> {
    const evento = EventoPublicadoIdentidad.parse(eventoBruto);
    if (this.capturar) this.publicados.push(evento);
    this.log.log({ correlacionId: evento.correlacionId, tipo: evento.tipo, eventoId: evento.id }, 'evento publicado');
    await publicarEnCola(this.cola, evento, DESTINOS_IDENTIDAD[evento.tipo]);
  }
}
