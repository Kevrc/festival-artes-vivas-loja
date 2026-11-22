import { randomUUID } from 'node:crypto';
import { Controller, Get, Header, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { LoggerModule } from 'nestjs-pino';
import type { Options } from 'pino-http';
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

/**
 * Constitución IX: nunca se registran tokens de sesión, contraseñas ni secretos. Las cookies
 * entran en `cookie` y salen en `set-cookie` (la de sesión, `fiavl_sesion`, es el token en claro).
 */
export const CAMPOS_OCULTOS = ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'];

/** Opciones de pino-http de la API; exportadas para probar que ocultan lo sensible (T130). */
export const opcionesLogHttp = (): Options => ({
  level: process.env.LOG_LEVEL ?? 'info',
  genReqId: (req, res) => {
    const id = (req.headers[CABECERA_CORRELACION] as string | undefined) ?? randomUUID();
    res.setHeader(CABECERA_CORRELACION, id);
    return id;
  },
  customProps: (req) => ({ correlacionId: req.id }),
  redact: CAMPOS_OCULTOS,
  autoLogging: { ignore: (req) => req.url === '/metrics' },
});

/** Constitución IX: logs JSON con id de correlación y métricas HTTP. */
@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: opcionesLogHttp() })],
  controllers: [MetricasController],
})
export class ObservabilidadModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(medirPeticion).forRoutes('*');
  }
}
