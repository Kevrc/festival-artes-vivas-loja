import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';
import { registro } from '../../../common/observabilidad/metricas';

/**
 * Observabilidad de Convocatorias (Constitución IX, T050): logs estructurados con `correlacionId` y métricas del módulo.
 * Los logs solo admiten campos de una lista cerrada de identificadores y estados: nunca nombres, correos, motivos libres
 * ni nombres de archivo. Las métricas usan etiquetas de conjuntos cerrados (sin ids de cuenta ni de postulación).
 */
export const convocatoriasPostulacionesEnviadas = new Counter({
  name: 'convocatorias_postulaciones_enviadas_total', help: 'Postulaciones enviadas (incluye reenvíos tras retiro)', registers: [registro],
});
export const convocatoriasValidacionesFallidas = new Counter({
  name: 'convocatorias_validaciones_fallidas_total', help: 'Rechazos de validación por motivo (faltantes, documento, antivirus)',
  labelNames: ['motivo'] as const, registers: [registro],
});
export const convocatoriasAdmisibilidad = new Counter({
  name: 'convocatorias_admisibilidad_total', help: 'Resoluciones de admisibilidad por resultado',
  labelNames: ['resultado'] as const, registers: [registro],
});
export const convocatoriasSubsanaciones = new Counter({
  name: 'convocatorias_subsanaciones_total', help: 'Subsanaciones por evento (solicitada, reenviada, vencida)',
  labelNames: ['evento'] as const, registers: [registro],
});
export const convocatoriasExpiraciones = new Counter({
  name: 'convocatorias_expiraciones_total', help: 'Subsanaciones vencidas por el trabajo programado', registers: [registro],
});
export const convocatoriasEvaluaciones = new Counter({
  name: 'convocatorias_evaluaciones_total', help: 'Eventos de evaluación (enviada, reabierta, deliberacion)',
  labelNames: ['evento'] as const, registers: [registro],
});
export const convocatoriasLatencia = new Histogram({
  name: 'convocatorias_operacion_duracion_segundos', help: 'Duración de operaciones de Convocatorias',
  labelNames: ['operacion', 'resultado'] as const, buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5], registers: [registro],
});

const CAMPOS_PERMITIDOS = new Set([
  'correlacionId', 'postulacionId', 'asignacionId', 'evaluacionId', 'estadoAnterior', 'estadoNuevo', 'operacion', 'resultado', 'cantidad', 'motivoRechazo', 'duracionMs',
]);

export interface DatosAuditoria {
  postulacionId: string;
  accion: string;
  estadoAnterior?: string | null;
  estadoNuevo?: string | null;
  correlacionId?: string | null;
}
interface LoggerConvocatorias { log(datos: Record<string, unknown>, mensaje: string): void }

export class ObservadorConvocatorias {
  constructor(private readonly logger: LoggerConvocatorias = new Logger('Convocatorias') as unknown as LoggerConvocatorias) {}

  /** Registra un evento de negocio: log estructurado (lista cerrada de campos) y métrica correspondiente. */
  registrar(evento: string, datos: Record<string, unknown>): void {
    const seguros = Object.fromEntries(Object.entries(datos).filter(([clave, v]) => CAMPOS_PERMITIDOS.has(clave) && v != null));
    this.logger.log({ evento, correlacionId: 'sin-correlacion', ...seguros }, evento);
    this.contar(evento, datos);
  }

  async medir<T>(operacion: string, fn: () => Promise<T>): Promise<T> {
    const eventos: DatosAuditoria[] = [];
    const inicio = process.hrtime.bigint();
    const terminar = (resultado: 'ok' | 'error') => {
      const segundos = Number(process.hrtime.bigint() - inicio) / 1e9;
      convocatoriasLatencia.observe({ operacion, resultado }, segundos);
      return Math.round(segundos * 1000);
    };
    try {
      const resultado = await almacen.run(eventos, fn);
      // Solo tras confirmar la operación: un rollback no deja eventos ni métricas.
      for (const e of eventos) this.registrar(e.accion, e as unknown as Record<string, unknown>);
      this.logger.log({ operacion, resultado: 'ok', duracionMs: terminar('ok'), correlacionId: eventos[0]?.correlacionId ?? 'sin-correlacion' }, 'operación completada');
      return resultado;
    } catch (error) {
      this.logger.log({ operacion, resultado: 'error', duracionMs: terminar('error'), correlacionId: 'sin-correlacion' }, 'operación fallida');
      throw error;
    }
  }

  private contar(evento: string, datos: Record<string, unknown>): void {
    switch (evento) {
      case 'postulacion_enviada': convocatoriasPostulacionesEnviadas.inc(); break;
      case 'postulacion_admitida': convocatoriasAdmisibilidad.inc({ resultado: 'admitida' }); break;
      case 'postulacion_no_admitida': convocatoriasAdmisibilidad.inc({ resultado: 'no_admitida' }); break;
      case 'subsanacion_solicitada': convocatoriasSubsanaciones.inc({ evento: 'solicitada' }); break;
      case 'subsanacion_reenviada': convocatoriasSubsanaciones.inc({ evento: 'reenviada' }); break;
      case 'subsanacion_vencida': convocatoriasSubsanaciones.inc({ evento: 'vencida' }); convocatoriasExpiraciones.inc(); break;
      case 'evaluacion_enviada': convocatoriasEvaluaciones.inc({ evento: 'enviada' }); break;
      case 'evaluacion_reabierta': convocatoriasEvaluaciones.inc({ evento: 'reabierta' }); break;
      case 'deliberacion_requerida': convocatoriasEvaluaciones.inc({ evento: 'deliberacion' }); break;
      case 'validacion_fallida': convocatoriasValidacionesFallidas.inc({ motivo: String(datos.motivoRechazo ?? 'otro') }); break;
      default: break; // el resto solo deja rastro en el log
    }
  }
}

const almacen = new AsyncLocalStorage<DatosAuditoria[]>();
let activo = new ObservadorConvocatorias();

/** Sustituye el observador (pruebas); devuelve la función que restaura el anterior. */
export function fijarObservador(observador: ObservadorConvocatorias): () => void {
  const anterior = activo;
  activo = observador;
  return () => { activo = anterior; };
}

/** Cada fila de auditoría escrita dentro de una operación observada se convierte en evento al confirmarse. */
export function notificarAuditoria(datos: DatosAuditoria): void {
  const pendientes = almacen.getStore();
  const completo = { ...datos, correlacionId: datos.correlacionId ?? randomUUID() };
  if (pendientes) pendientes.push(completo);
  else activo.registrar(datos.accion, completo as unknown as Record<string, unknown>);
}

/** Rechazo de validación (faltantes, documento inválido, antivirus) con su correlación. */
export function validacionFallida(motivo: 'faltantes' | 'documento' | 'antivirus' | 'limite', correlacionId: string = randomUUID()): void {
  activo.registrar('validacion_fallida', { correlacionId, motivoRechazo: motivo });
}

/** Decorador de métodos asíncronos: mide latencia/resultado y agrupa los eventos auditados de la operación. */
export function Observada(operacion: string) {
  return (_objetivo: object, _clave: string | symbol, descriptor: PropertyDescriptor): void => {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      return activo.medir(operacion, () => original.apply(this, args));
    };
  };
}
