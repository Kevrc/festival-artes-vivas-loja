import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registro = new Registry();
collectDefaultMetrics({ register: registro });

export const peticionesHttp = new Counter({
  name: 'http_peticiones_total',
  help: 'Peticiones HTTP por método, ruta y código',
  labelNames: ['metodo', 'ruta', 'codigo'] as const,
  registers: [registro],
});

export const latenciaHttp = new Histogram({
  name: 'http_latencia_segundos',
  help: 'Latencia HTTP por método y ruta',
  labelNames: ['metodo', 'ruta'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registro],
});
