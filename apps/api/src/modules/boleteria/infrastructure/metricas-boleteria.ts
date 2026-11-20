import { Counter, Histogram } from 'prom-client';
import { registro } from '../../../common/observabilidad/metricas';

export const boleteriaPedidosTotal = new Counter({
  name: 'boleteria_pedidos_total',
  help: 'Pedidos y reservas procesados por canal, tipo y resultado',
  labelNames: ['canal', 'tipo', 'resultado'] as const,
  registers: [registro],
});

export const boleteriaValidacionesTotal = new Counter({
  name: 'boleteria_validaciones_total',
  help: 'Validaciones de ingreso en puerta por semáforo y modo',
  labelNames: ['semaforo', 'modo'] as const,
  registers: [registro],
});

export const boleteriaConflictosIngresoTotal = new Counter({
  name: 'boleteria_conflictos_ingreso_total',
  help: 'Conflictos detectados al sincronizar validaciones offline',
  registers: [registro],
});

export const boleteriaLatenciaOperacion = new Histogram({
  name: 'boleteria_operacion_duracion_segundos',
  help: 'Duración de operaciones críticas de Boletería',
  labelNames: ['operacion'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [registro],
});
