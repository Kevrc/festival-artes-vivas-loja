import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventoPublicadoOperacion } from '@fiavl/contracts';
import { ColaEventos } from '../../../common/datos/datos.module';
import { crearColas, publicarEnCola } from '../../../common/datos/publicar-en-cola';
import type { PublicadorOperacion } from '../application/puertos';

/** Destinos de cada evento de Operación (research R3). Cartelera y Boletería ya los consumen. */
export const DESTINOS_OPERACION: Readonly<Record<EventoPublicadoOperacion['tipo'], readonly string[]>> = {
  ProgramacionPublicada: ['programacion', 'boleteria', 'identidad'],
  FuncionProgramada: ['programacion', 'boleteria', 'identidad'],
  FuncionActualizada: ['programacion', 'boleteria', 'identidad'],
  FuncionReprogramada: ['programacion', 'boleteria', 'identidad'],
  FuncionCancelada: ['programacion', 'boleteria', 'identidad'],
  AforoCambiado: ['boleteria'],
};

@Injectable()
export class PublicadorPgBossOperacion implements PublicadorOperacion, OnModuleInit {
  private readonly log = new Logger(PublicadorPgBossOperacion.name);
  /** Captura en memoria solo en pruebas (NODE_ENV=test). */
  readonly publicados: EventoPublicadoOperacion[] = [];
  private readonly capturar = process.env.NODE_ENV === 'test';

  constructor(@Inject(ColaEventos) private readonly cola: ColaEventos) {}

  async onModuleInit() {
    await crearColas(this.cola, DESTINOS_OPERACION);
  }

  async publicar(eventoBruto: EventoPublicadoOperacion): Promise<void> {
    const evento = EventoPublicadoOperacion.parse(eventoBruto);
    if (this.capturar) this.publicados.push(evento);
    this.log.log({ correlacionId: evento.correlacionId, tipo: evento.tipo, eventoId: evento.id }, 'evento publicado');
    await publicarEnCola(this.cola, evento, DESTINOS_OPERACION[evento.tipo]);
  }
}
