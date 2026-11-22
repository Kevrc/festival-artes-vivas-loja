import { Counter } from 'prom-client';
import { registro } from '../../../common/observabilidad/metricas';

/** Métricas de Identidad (T101, Constitución IX). Sin datos personales en las etiquetas. */
export const identidadNotificacionesTotal = new Counter({
  name: 'identidad_notificaciones_total',
  help: 'Notificaciones por plantilla y estado final (enviada, fallida, omitida)',
  labelNames: ['plantilla', 'estado'] as const,
  registers: [registro],
});

export const identidadIniciosSesionTotal = new Counter({
  name: 'identidad_inicios_sesion_total',
  help: 'Intentos de inicio de sesión por resultado (ok, fallido)',
  labelNames: ['resultado'] as const,
  registers: [registro],
});

export const identidadBloqueosTotal = new Counter({
  name: 'identidad_bloqueos_total',
  help: 'Cuentas bloqueadas por intentos fallidos, por motivo (contrasena, segundo_factor)',
  labelNames: ['motivo'] as const,
  registers: [registro],
});
