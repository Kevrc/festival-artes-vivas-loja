import type { INestApplication } from '@nestjs/common';
import { ProblemaFilter } from './common/http/problema.filter';

export function configurarApp(app: INestApplication) {
  app.enableCors({
    origin: process.env.WEB_URL ?? 'http://localhost:3100',
    credentials: true,
    exposedHeaders: ['ETag', 'x-correlation-id'],
  });
  app.useGlobalFilters(new ProblemaFilter());
  app.enableShutdownHooks();
}
