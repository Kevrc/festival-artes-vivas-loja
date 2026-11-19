import { randomUUID } from 'node:crypto';
import { Controller, Get, Header, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { LoggerModule } from 'nestjs-pino';
import { latenciaHttp, peticionesHttp, registro } from './metricas';

export const CABECERA_CORRELACION = 'x-correlation-id';

@Controller()
class MetricasController {
  @Get('metrics')
  @Header('Content-Type', registro.contentType)
  metricas() {
    return registro.metrics();
  }
}

function medirPeticion(req: Request, res: Response, next: NextFunction) {
  const fin = latenciaHttp.startTimer();
  res.on('finish', () => {
    // la ruta declarada (no la URL) evita una serie por cada id
    const ruta = (req.route?.path as string | undefined) ?? 'desconocida';
    fin({ metodo: req.method, ruta });
    peticionesHttp.inc({ metodo: req.method, ruta, codigo: res.statusCode });
  });
  next();
}

/** Constitución IX: logs JSON con id de correlación y métricas HTTP. */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req, res) => {
          const id = (req.headers[CABECERA_CORRELACION] as string | undefined) ?? randomUUID();
          res.setHeader(CABECERA_CORRELACION, id);
          return id;
        },
        customProps: (req) => ({ correlacionId: req.id }),
        redact: ['req.headers.cookie', 'req.headers.authorization'],
        autoLogging: { ignore: (req) => req.url === '/metrics' },
      },
    }),
  ],
  controllers: [MetricasController],
})
export class ObservabilidadModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(medirPeticion).forRoutes('*');
  }
}
