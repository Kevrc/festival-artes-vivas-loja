import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventoPublicadoConvocatorias, colaDe } from '@fiavl/contracts';
import { ColaEventos } from '../../../common/datos/datos.module';
import { transaccionActual } from '../../../common/datos/transaccion';
import type { PublicadorConvocatoriasPort } from '../application/puertos';

const DESTINOS: Record<EventoPublicadoConvocatorias['tipo'], readonly string[]> = {
  PostulacionEnviada: ['identidad'],
  SubsanacionSolicitada: ['identidad'],
};

@Injectable()
export class PublicadorPgBossConvocatorias implements PublicadorConvocatoriasPort, OnModuleInit {
  private readonly log = new Logger(PublicadorPgBossConvocatorias.name);
  constructor(@Inject(ColaEventos) private readonly cola: ColaEventos) {}

  async onModuleInit(): Promise<void> {
    if (!this.cola.habilitada) return;
    const boss = await this.cola.obtener();
    for (const name of new Set(Object.entries(DESTINOS).flatMap(([tipo, destinos]) => destinos.map((destino) => colaDe(destino, tipo))))) {
      await boss.createQueue(name);
    }
  }

  async publicar(eventoBruto: EventoPublicadoConvocatorias, opciones?: { singletonKey?: string }): Promise<void> {
    const evento = EventoPublicadoConvocatorias.parse(eventoBruto);
    this.log.log({ correlacionId: evento.correlacionId, tipo: evento.tipo, eventoId: evento.id }, 'evento publicado');
    if (!this.cola.habilitada) return;
    const boss = await this.cola.obtener();
    const tx = transaccionActual();
    const db = tx && {
      executeSql: async (text: string, values: unknown[]) => ({ rows: await tx.$queryRawUnsafe<unknown[]>(text, ...values) }),
    };
    for (const destino of DESTINOS[evento.tipo]) {
      const queue = colaDe(destino, evento.tipo);
      await boss.send(queue, evento, {
        ...(db ? { db } : {}),
        singletonKey: `${queue}:${opciones?.singletonKey ?? evento.id}`,
        singletonSeconds: 43_200,
      });
    }
  }
}
