import { Global, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Una sola cola pg-boss por proceso (auditoría #5): antes cada módulo abría la suya y su grupo de
 * conexiones a PostgreSQL. En pruebas (NODE_ENV=test) no se usa.
 */
@Injectable()
export class ColaEventos implements OnModuleDestroy {
  private readonly log = new Logger(ColaEventos.name);
  private arranque?: Promise<PgBoss>;

  /** Habilitada fuera de pruebas; los publicadores fallan si no arranca (nunca descartan en silencio). */
  get habilitada() {
    return process.env.NODE_ENV !== 'test' && process.env.BOLETERIA_PGBOSS_DESACTIVADO !== 'true';
  }

  /** Arranca pg-boss una sola vez, la primera vez que alguien lo pide. */
  obtener(): Promise<PgBoss> {
    this.arranque ??= (async () => {
      if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria para la cola de eventos');
      const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: 'pgboss', max: 5 });
      boss.on('error', (e) => this.log.error(e));
      await boss.start();
      return boss;
    })();
    return this.arranque;
  }

  async onModuleDestroy() {
    if (this.arranque) await (await this.arranque).stop({ graceful: true });
  }
}

/** Un PrismaService y una ColaEventos compartidos por todos los módulos del proceso. */
@Global()
@Module({ providers: [PrismaService, ColaEventos], exports: [PrismaService, ColaEventos] })
export class DatosModule {}
