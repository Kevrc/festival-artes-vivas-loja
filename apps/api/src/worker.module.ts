import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ProgramacionModule } from './modules/programacion/programacion.module';

/** Proceso worker (ADR-0008): consumidores de colas y trabajos, sin HTTP. */
@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' } }), ProgramacionModule.registrar({ consumidores: true })],
})
export class WorkerModule {}

// El worker usa esta misma instancia de nestjs-pino (otra copia no sería el mismo proveedor)
export { Logger } from 'nestjs-pino';
