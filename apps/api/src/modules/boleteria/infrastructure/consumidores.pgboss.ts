import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { TIPOS_EVENTO_BOLETERIA, colaDe } from '@fiavl/contracts';
import { ColaEventos } from '../../../common/datos/datos.module';
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
  private timerRetenciones?: NodeJS.Timeout;

  constructor(
    @Inject(AplicarEventoOperacion) private readonly aplicar: AplicarEventoOperacion,
    @Inject(ExpirarRetenciones) private readonly expirarRetenciones: ExpirarRetenciones,
    @Inject(ConciliarPagosPendientes) private readonly conciliarPagos: ConciliarPagosPendientes,
    @Inject(LiberarReservasNoValidadas) private readonly liberarReservas: LiberarReservasNoValidadas,
    @Inject(CancelacionesServicios) private readonly cancelaciones: CancelacionesServicios,
    @Inject(ColaEventos) private readonly cola: ColaEventos,
  ) {}

  async onModuleInit() {
    const boss = await this.cola.obtener();
    await boss.createQueue('boleteria.errores');

    for (const cola of colasBoleteria) {
      await boss.createQueue(cola, {
        name: cola,
        retryLimit: 5,
        retryBackoff: true,
        deadLetter: 'boleteria.errores',
      });
      await boss.work<Record<string, unknown>>(cola, { batchSize: 10 }, async (trabajos) => {
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
      await boss.createQueue(job.cola);
      await boss.schedule(job.cola, job.cron);
      await boss.work(job.cola, async () => {
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
  }
}
