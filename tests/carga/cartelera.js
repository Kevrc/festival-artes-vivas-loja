// SC-003 / RNF-001: 5 000 visitantes simultáneos navegando la cartelera durante 10 minutos.
// Ejecutar contra staging (con CDN), nunca contra producción en horario del festival:
//   k6 run -e BASE_URL=https://staging.example tests/carga/cartelera.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3100';
const API = __ENV.API_URL || BASE.replace(':3100', ':4000');
const DIAS = ['12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22'].map((d) => `2026-11-${d}`);

export const options = {
  stages: [
    { duration: '2m', target: 1000 },
    { duration: '2m', target: 5000 },
    { duration: '10m', target: 5000 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'], // 0 errores en la práctica; < 1 % como umbral de corte
    'http_req_duration{tipo:pagina}': ['p(95)<1000'],
    'http_req_duration{tipo:disponibilidad}': ['p(95)<1000'],
  },
};

export default function () {
  const dia = DIAS[Math.floor(Math.random() * DIAS.length)];
  const pagina = http.get(`${BASE}/cartelera/${dia}`, { tags: { tipo: 'pagina' } });
  check(pagina, { 'página 200': (r) => r.status === 200 });
  const disp = http.get(`${API}/api/cartelera/disponibilidad?fecha=${dia}`, { tags: { tipo: 'disponibilidad' } });
  check(disp, { 'disponibilidad 200': (r) => r.status === 200 });
  sleep(3 + Math.random() * 5); // lectura de la página
}
