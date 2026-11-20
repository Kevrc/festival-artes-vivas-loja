import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventoPublicadoBoleteria, colaDe } from '@fiavl/contracts';
import { ColaEventos } from '../../../common/datos/datos.module';
import { transaccionActual } from '../../../common/datos/transaccion';
import type { PublicadorEventosBoleteria } from '../application/puertos';

const DESTINOS: Record<EventoPublicadoBoleteria['tipo'], readonly string[]> = {
  DisponibilidadCambiada: ['programacion'],
  EntradasEmitidas: ['operacion', 'identidad'],
  IngresoRegistrado: ['operacion'],
  PedidoReembolsado: ['operacion', 'identidad'],
  ConflictoDeIngreso: ['operacion'],
  AforoExcedido: ['operacion'],
};

/**
 * Publica los eventos de Boletería en pg-boss (ADR-0003). Si hay una transacción ambiente, encola
 * dentro de ella: el cambio y su evento se confirman juntos o ninguno (auditoría #1). Si la cola no
 * está disponible, falla: nunca descarta eventos en silencio.
 */
@Injectable()
export class PublicadorPgBossBoleteria implements PublicadorEventosBoleteria, OnModuleInit {
  private readonly log = new Logger(PublicadorPgBossBoleteria.name);
  /** Captura en memoria solo en pruebas (NODE_ENV=test); en otros entornos crecería sin límite. */
  public readonly publicados: EventoPublicadoBoleteria[] = [];
  private readonly capturar = process.env.NODE_ENV === 'test';

  constructor(@Inject(ColaEventos) private readonly cola: ColaEventos) {}

  /**
   * Crea todas las colas de destino al arrancar. En pg-boss 10 cada cola es una partición de
   * pgboss.job, y una transacción que ya tocó esa tabla no ve particiones creadas después.
   */
  async onModuleInit() {
    if (!this.cola.habilitada) return;
    const boss = await this.cola.obtener();
    for (const cola of new Set(Object.entries(DESTINOS).flatMap(([tipo, mods]) => mods.map((m) => colaDe(m, tipo))))) {
      await boss.createQueue(cola);
    }
  }

  async publicar(
    eventoBruto: EventoPublicadoBoleteria,
    opciones?: { singletonKey?: string; singletonSeconds?: number },
  ): Promise<void> {
    const evento = EventoPublicadoBoleteria.parse(eventoBruto);
    if (this.capturar) this.publicados.push(evento);
    this.log.log({ correlacionId: evento.correlacionId, tipo: evento.tipo, eventoId: evento.id }, 'evento publicado');
    if (!this.cola.habilitada) return;

    const boss = await this.cola.obtener();
    const tx = transaccionActual();
    const db = tx && {
      executeSql: async (text: string, values: unknown[]) => ({ rows: await tx.$queryRawUnsafe<unknown[]>(text, ...values) }),
    };
    for (const mod of DESTINOS[evento.tipo]) {
      const cola = colaDe(mod, evento.tipo);
      await boss.send(cola, evento, {
        ...(db ? { db } : {}),
        ...(opciones?.singletonKey && opciones.singletonSeconds
          ? { singletonKey: `${cola}:${opciones.singletonKey}`, singletonSeconds: opciones.singletonSeconds }
          : {}),
      });
    }
  }
}
