import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

/**
 * Prueba de carga k6 de la spec 004 (T129):
 * - RNF-001: la grilla de un día con 60 funciones responde en menos de 2 s.
 * - RNF-004: el inicio de sesión responde en menos de 1 s (p95).
 *
 * Uso (API en development con la semilla cargada; la grilla usa el puente de desarrollo):
 *   BASE_URL=http://localhost:4000 EDICION_ID=<id de la edición 2026> FECHA=2026-11-14 k6 run tests/carga/operacion.js
 * La semilla trae unas 20 funciones; para medir 60 en un día, cárgalas antes con la API de
 * programación (o con `pnpm events:emit:004`) en la fecha indicada.
 */
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const EDICION_ID = __ENV.EDICION_ID || '';
const FECHA = __ENV.FECHA || '2026-11-14';
const CORREO = __ENV.CORREO || 'asistente@fiavl.test';
const CLAVE = __ENV.CLAVE || 'Festival-de-Loja-2026';
const ORIGEN = __ENV.WEB_URL || 'http://localhost:3100';

const latenciaGrilla = new Trend('latencia_grilla_ms');
const latenciaIngreso = new Trend('latencia_ingreso_ms');

export const options = {
  scenarios: {
    grilla: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
      exec: 'consultarGrilla',
    },
    ingreso: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
      exec: 'iniciarSesion',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    latencia_grilla_ms: ['max<2000', 'p(95)<1000'],
    latencia_ingreso_ms: ['p(95)<1000'],
  },
};

export function consultarGrilla() {
  const r = http.get(`${BASE_URL}/api/operacion/ediciones/${EDICION_ID}/grilla?fecha=${FECHA}`, {
    headers: { 'x-cuenta-dev': '00000000-0000-4000-8000-0000000000a4', 'x-roles-dev': 'programador' },
    tags: { nombre: 'grilla' },
  });
  latenciaGrilla.add(r.timings.duration);
  check(r, { 'grilla 200': (x) => x.status === 200 });
}

export function iniciarSesion() {
  const r = http.post(`${BASE_URL}/api/identidad/sesion`, JSON.stringify({ correo: CORREO, contrasena: CLAVE }), {
    headers: { 'Content-Type': 'application/json', Origin: ORIGEN },
    tags: { nombre: 'ingreso' },
  });
  latenciaIngreso.add(r.timings.duration);
  check(r, { 'ingreso 200': (x) => x.status === 200 });
}
