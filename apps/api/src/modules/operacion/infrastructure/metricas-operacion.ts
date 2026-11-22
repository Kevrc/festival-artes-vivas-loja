import { Counter } from 'prom-client';
import { registro } from '../../../common/observabilidad/metricas';

/** Métricas de Operación (T101, Constitución IX). */
export const operacionFuncionesTotal = new Counter({
  name: 'operacion_funciones_total',
  help: 'Funciones publicadas, reprogramadas y canceladas',
  labelNames: ['cambio'] as const,
  registers: [registro],
});
