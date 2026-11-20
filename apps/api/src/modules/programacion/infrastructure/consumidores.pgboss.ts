import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { TIPOS_EVENTO_CARTELERA, colaDe } from '@fiavl/contracts';
import { Histogram } from 'prom-client';
import { ColaEventos } from '../../../common/datos/datos.module';
import { registro } from '../../../common/observabilidad/metricas';
import { AplicarEvento } from '../application/proyeccion/aplicar-evento';

/** SC-004: segundos entre `ocurridoEn` del evento y la revalidación de la cartelera. */
export const retrasoCartelera = new Histogram({
  name: 'cartelera_retraso_evento_segundos',
  help: 'Retraso entre que ocurre un evento y la cartelera lo refleja',
  labelNames: ['tipo'] as const,
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [registro],
});

export const colasCartelera = TIPOS_EVENTO_CARTELERA.map((tipo) => colaDe('programacion', tipo));

/** Consume las colas `programacion.*` de pg-boss (ADR-0003). Solo corre en el proceso worker. */
@Injectable()
export class ConsumidoresCartelera implements OnModuleInit {
  private readonly log = new Logger(ConsumidoresCartelera.name);
  constructor(
    @Inject(AplicarEvento) private readonly aplicar: AplicarEvento,
    @Inject(ColaEventos) private readonly cola: ColaEventos,
  ) {}

  async onModuleInit() {
    const boss = await this.cola.obtener();
    // La cola de errores debe existir antes que las colas que la usan como dead letter
    await boss.createQueue('programacion.errores');
    for (const cola of colasCartelera) {
      await boss.createQueue(cola, { name: cola, retryLimit: 5, retryBackoff: true, deadLetter: 'programacion.errores' });
      await boss.work<Record<string, unknown>>(cola, { batchSize: 10 }, async (trabajos) => {
        for (const t of trabajos) {
          const { aplicado } = await this.aplicar.ejecutar(t.data);
          const ocurridoEn = Date.parse(String(t.data.ocurridoEn));
          if (aplicado && !Number.isNaN(ocurridoEn)) {
            retrasoCartelera.observe({ tipo: String(t.data.tipo) }, (Date.now() - ocurridoEn) / 1000);
          }
          this.log.log({ correlacionId: t.data.correlacionId, tipo: t.data.tipo, aplicado }, 'evento procesado');
        }
      });
    }
    this.log.log(`Escuchando ${colasCartelera.length} colas de la cartelera`);
  }

}
