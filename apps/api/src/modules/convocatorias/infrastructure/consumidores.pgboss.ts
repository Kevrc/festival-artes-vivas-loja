import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ColaEventos } from '../../../common/datos/datos.module';
import { AdmisionServicio } from '../application/admision/admision.servicio';

/** Trabajo idempotente de vencimiento de subsanaciones (US2-AS3). Solo corre en el proceso worker. */
@Injectable()
export class ConsumidoresConvocatorias implements OnModuleInit {
  private readonly log = new Logger(ConsumidoresConvocatorias.name);
  constructor(
    @Inject(AdmisionServicio) private readonly admision: AdmisionServicio,
    @Inject(ColaEventos) private readonly cola: ColaEventos,
  ) {}

  async onModuleInit(): Promise<void> {
    const boss = await this.cola.obtener();
    const colaJob = 'convocatorias.job.expirar-subsanaciones';
    await boss.createQueue(colaJob);
    await boss.schedule(colaJob, '* * * * *');
    await boss.work(colaJob, async () => {
      const expiradas = await this.admision.expirarVencidas();
      if (expiradas > 0) this.log.log({ expiradas }, 'subsanaciones vencidas actualizadas');
    });
    const expiradas = await this.admision.expirarVencidas();
    this.log.log(`Expiración de subsanaciones activa; ${expiradas} vencidas al arrancar`);
  }
}
