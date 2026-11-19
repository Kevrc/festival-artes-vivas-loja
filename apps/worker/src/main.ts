import 'reflect-metadata';
import { createServer } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { registro } from '@fiavl/api/metricas';
import { Logger, WorkerModule } from '@fiavl/api/worker';

const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
app.enableShutdownHooks();

// Constitución IX: el worker no tiene HTTP de negocio; expone solo /metrics (retraso de eventos, SC-004)
const puerto = Number(process.env.WORKER_METRICS_PORT ?? 9464);
createServer(async (req, res) => {
  if (req.url !== '/metrics') return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': registro.contentType }).end(await registro.metrics());
}).listen(puerto);
