import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EventoPublicadoBoleteria, colaDe } from '@fiavl/contracts';
import PgBoss from 'pg-boss';
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
 * Publicador transaccional / pg-boss de eventos de dominio de Boletería (ADR-0003).
 * Valida todo evento con Zod antes de encolar y propaga `correlacionId` (Constitución IX).
 */
@Injectable()
export class PublicadorPgBossBoleteria implements PublicadorEventosBoleteria, OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PublicadorPgBossBoleteria.name);
  private boss?: PgBoss;
  private readonly colasCreadas = new Set<string>();
  /** Captura en memoria solo en pruebas (NODE_ENV=test); en otros entornos crecería sin límite (revisión PR #6). */
  public readonly publicados: EventoPublicadoBoleteria[] = [];
  private readonly capturar = process.env.NODE_ENV === 'test';

  async onModuleInit() {
    if (process.env.BOLETERIA_PGBOSS_DESACTIVADO === 'true' || !process.env.DATABASE_URL) return;
    if (process.env.NODE_ENV === 'test') return;
    try {
      this.boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: 'pgboss' });
      this.boss.on('error', (e) => this.log.error(e));
      await this.boss.start();
    } catch (e) {
      this.log.warn(`pg-boss en publicador no iniciado (${e instanceof Error ? e.message : String(e)})`);
      this.boss = undefined;
    }
  }

  async onModuleDestroy() {
    await this.boss?.stop({ graceful: true });
  }

  async publicar(
    eventoBruto: EventoPublicadoBoleteria,
    opciones?: { singletonKey?: string; singletonSeconds?: number },
  ): Promise<void> {
    const evento = EventoPublicadoBoleteria.parse(eventoBruto);
    if (this.capturar) this.publicados.push(evento);
    this.log.log({ correlacionId: evento.correlacionId, tipo: evento.tipo, eventoId: evento.id }, 'evento publicado');

    if (!this.boss) return;
    const destinos = DESTINOS[evento.tipo];
    for (const mod of destinos) {
      const cola = colaDe(mod, evento.tipo);
      if (!this.colasCreadas.has(cola)) {
        await this.boss.createQueue(cola);
        this.colasCreadas.add(cola);
      }
      if (opciones?.singletonKey && opciones.singletonSeconds) {
        await this.boss.send(cola, evento, {
          singletonKey: `${cola}:${opciones.singletonKey}`,
          singletonSeconds: opciones.singletonSeconds,
        });
      } else {
        await this.boss.send(cola, evento);
      }
    }
  }
}
