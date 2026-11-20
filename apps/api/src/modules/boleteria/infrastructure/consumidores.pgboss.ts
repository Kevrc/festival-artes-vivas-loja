import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { TIPOS_EVENTO_BOLETERIA, colaDe } from '@fiavl/contracts';
import PgBoss from 'pg-boss';
import { CancelacionesServicios } from '../application/cancelaciones/cancelaciones-servicios';
import { ConciliarPagosPendientes, ExpirarRetenciones } from '../application/compras/procesar-webhook';
import { AplicarEventoOperacion } from '../application/eventos/aplicar-evento-operacion';
import { LiberarReservasNoValidadas } from '../application/reservas/reservas-servicios';

export const colasBoleteria = TIPOS_EVENTO_BOLETERIA.map((tipo) => colaDe('boleteria', tipo));

/**
 * Consume las colas `boleteria.*` de pg-boss (ADR-0003) y ejecuta los trabajos programados de Boletería.
 * Solo corre en el proceso worker (ADR-0008).
 */
@Injectable()
export class ConsumidoresBoleteria implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ConsumidoresBoleteria.name);
  private boss?: PgBoss;
  private timerRetenciones?: NodeJS.Timeout;

  constructor(
    @Inject(AplicarEventoOperacion) private readonly aplicar: AplicarEventoOperacion,
    @Inject(ExpirarRetenciones) private readonly expirarRetenciones: ExpirarRetenciones,
    @Inject(ConciliarPagosPendientes) private readonly conciliarPagos: ConciliarPagosPendientes,
    @Inject(LiberarReservasNoValidadas) private readonly liberarReservas: LiberarReservasNoValidadas,
    @Inject(CancelacionesServicios) private readonly cancelaciones: CancelacionesServicios,
  ) {}

  async onModuleInit() {
    this.boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: 'pgboss' });
    this.boss.on('error', (e) => this.log.error(e));
    await this.boss.start();
    await this.boss.createQueue('boleteria.errores');

    for (const cola of colasBoleteria) {
      await this.boss.createQueue(cola, {
        name: cola,
        retryLimit: 5,
        retryBackoff: true,
        deadLetter: 'boleteria.errores',
      });
      await this.boss.work<Record<string, unknown>>(cola, { batchSize: 10 }, async (trabajos) => {
        for (const t of trabajos) {
          const { aplicado } = await this.aplicar.ejecutar(t.data);
          this.log.log({ correlacionId: t.data.correlacionId, tipo: t.data.tipo, aplicado }, 'evento boleteria procesado');
        }
      });
    }

    // Trabajos programados (vista de procesos §1)
    const trabajosCron = [
      { cola: 'boleteria.job.liberar-reservas', cron: '* * * * *', fn: () => this.liberarReservas.ejecutar() },
      { cola: 'boleteria.job.conciliar-pagos', cron: '*/2 * * * *', fn: () => this.conciliarPagos.ejecutar() },
      { cola: 'boleteria.job.devoluciones-vencidas', cron: '*/15 * * * *', fn: () => this.cancelaciones.procesarDevolucionesVencidas() },
    ];
    for (const job of trabajosCron) {
      await this.boss.createQueue(job.cola);
      await this.boss.schedule(job.cola, job.cron);
      await this.boss.work(job.cola, async () => {
        await job.fn();
      });
    }

    // Cada 30 s (pg-boss schedule tiene debounce de 60 s, por eso se ejecuta en intervalo del worker)
    this.timerRetenciones = setInterval(() => {
      void this.expirarRetenciones.ejecutar().catch((e) => this.log.error(e));
    }, 30_000);
    this.timerRetenciones.unref();

    this.log.log(`Escuchando ${colasBoleteria.length} colas y trabajos programados de Boletería`);
  }

  async onModuleDestroy() {
    if (this.timerRetenciones) clearInterval(this.timerRetenciones);
    await this.boss?.stop({ graceful: true });
  }
}
