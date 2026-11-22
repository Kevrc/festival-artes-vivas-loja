import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ColaEventos } from '../../../common/datos/datos.module';
import { transaccionActual } from '../../../common/datos/transaccion';
import type { ColaNotificaciones } from '../application/puertos';
import { REINTENTOS } from '../domain/notificaciones';

export const COLA_ENVIO = 'identidad.enviar-notificacion';

/**
 * Encola el envío en pg-boss dentro de la transacción ambiente (ADR-0011): la fila `notificacion`
 * y su trabajo se confirman juntos. Reintentos con espera creciente (30 s · 2^n) que cubren 24 h.
 */
@Injectable()
export class ColaNotificacionesPgBoss implements ColaNotificaciones, OnModuleInit {
  constructor(@Inject(ColaEventos) private readonly cola: ColaEventos) {}

  async onModuleInit() {
    if (!this.cola.habilitada) return;
    await (await this.cola.obtener()).createQueue(COLA_ENVIO);
  }

  async encolar(notificacionId: string, correlacionId?: string): Promise<void> {
    if (!this.cola.habilitada) return;
    const boss = await this.cola.obtener();
    const tx = transaccionActual();
    const db = tx && { executeSql: async (text: string, values: unknown[]) => ({ rows: await tx.$queryRawUnsafe<unknown[]>(text, ...values) }) };
    await boss.send(
      COLA_ENVIO,
      { notificacionId, correlacionId },
      { ...(db ? { db } : {}), retryLimit: REINTENTOS.limite, retryDelay: REINTENTOS.esperaSegundos, retryBackoff: true, singletonKey: notificacionId },
    );
  }
}
