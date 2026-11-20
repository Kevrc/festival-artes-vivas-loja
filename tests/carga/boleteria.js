import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

/**
 * Prueba de carga y concurrencia k6 para Spec 002 (T063, SC-001, RNF-001, RNF-002).
 * Uso sugerido:
 *   BASE_URL=http://localhost:4000 FUNCION_ID=<uuid> k6 run tests/carga/boleteria.js
 */
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const FUNCION_ID = __ENV.FUNCION_ID || '';

const ordenesEmitidas = new Counter('ordenes_emitidas');
const ordenesAgotadas = new Counter('ordenes_agotadas');
const latenciaValidacion = new Trend('latencia_validacion_ms');

export const options = {
  scenarios: {
    compras_concurrentes: {
      executor: 'per-vu-iterations',
      vus: 500,
      iterations: 1,
      maxDuration: '60s',
      exec: 'comprarConcurrente',
    },
    validacion_puerta: {
      executor: 'constant-arrival-rate',
      rate: 25,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 30,
      startTime: '5s',
      exec: 'consultarDisponibilidadPuerta',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    latencia_validacion_ms: ['p(95)<400'],
  },
};

export function comprarConcurrente() {
  if (!FUNCION_ID) return;
  const vuId = String(__VU).padStart(4, '0');
  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': `k6-${__VU}-${Date.now()}`,
    'x-cuenta-dev': `00000000-0000-4000-8000-00000000${vuId}`,
    'x-rol-dev': 'asistente',
    'x-correo-dev': `vu${__VU}@fiavl.test`,
  };
  const res = http.post(
    `${BASE_URL}/api/boleteria/pedidos`,
    JSON.stringify({ funcionId: FUNCION_ID, cantidad: 1 }),
    { headers },
  );

  check(res, {
    'respuesta controlada (201 o 409)': (r) => r.status === 201 || r.status === 409,
  });
  if (res.status === 201) ordenesEmitidas.add(1);
  if (res.status === 409) ordenesAgotadas.add(1);
  sleep(0.1);
}

export function consultarDisponibilidadPuerta() {
  if (!FUNCION_ID) return;
  const res = http.get(`${BASE_URL}/api/boleteria/funciones/${FUNCION_ID}/disponibilidad`);
  latenciaValidacion.add(res.timings.duration);
  check(res, {
    'disponibilidad responde 200': (r) => r.status === 200,
    'latencia p95 esperada < 400 ms': (r) => r.timings.duration < 400,
  });
}
