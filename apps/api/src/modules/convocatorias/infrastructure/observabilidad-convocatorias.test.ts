import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registro } from '../../../common/observabilidad/metricas';
import {
  fijarObservador, notificarAuditoria, ObservadorConvocatorias, Observada, validacionFallida,
} from './observabilidad-convocatorias';

type Entrada = { datos: Record<string, unknown>; mensaje: string };
function observadorConLogs() {
  const entradas: Entrada[] = [];
  const logger = { log: (datos: Record<string, unknown>, mensaje: string) => { entradas.push({ datos, mensaje }); } };
  return { entradas, observador: new ObservadorConvocatorias(logger) };
}
const valor = async (nombre: string, etiquetas: Record<string, string> = {}): Promise<number> => {
  const metrica = (await registro.getMetricsAsJSON()).find((m) => m.name === nombre);
  const muestra = metrica?.values.find((v) => Object.entries(etiquetas).every(([k, x]) => (v.labels as Record<string, string>)[k] === x));
  return muestra?.value ?? 0;
};

describe('T050 · observabilidad de Convocatorias', () => {
  let restaurar: () => void;
  afterEach(() => restaurar?.());
  beforeEach(() => { restaurar = () => undefined; });

  it('propaga la correlación a los logs y cuenta eventos auditados', async () => {
    const { entradas, observador } = observadorConLogs();
    restaurar = fijarObservador(observador);
    const antesEnviadas = await valor('convocatorias_postulaciones_enviadas_total');
    const antesEvaluaciones = await valor('convocatorias_evaluaciones_total', { evento: 'enviada' });
    const correlacionId = randomUUID();

    class Servicio {
      @Observada('prueba')
      async operar(): Promise<string> {
        notificarAuditoria({ postulacionId: 'p1', accion: 'postulacion_enviada', estadoAnterior: 'borrador', estadoNuevo: 'enviada', correlacionId });
        notificarAuditoria({ postulacionId: 'p1', accion: 'evaluacion_enviada', estadoAnterior: 'borrador', estadoNuevo: 'enviada', correlacionId });
        return 'ok';
      }
    }
    expect(await new Servicio().operar()).toBe('ok');
    const eventos = entradas.filter((e) => e.mensaje !== 'operación completada');
    expect(eventos.map((e) => e.datos.evento)).toEqual(['postulacion_enviada', 'evaluacion_enviada']);
    for (const e of eventos) expect(e.datos.correlacionId).toBe(correlacionId);
    expect(await valor('convocatorias_postulaciones_enviadas_total')).toBe(antesEnviadas + 1);
    expect(await valor('convocatorias_evaluaciones_total', { evento: 'enviada' })).toBe(antesEvaluaciones + 1);
  });

  it('mide la latencia por operación y resultado, también cuando falla', async () => {
    const { entradas, observador } = observadorConLogs();
    restaurar = fijarObservador(observador);
    class Servicio {
      @Observada('operacion_ok') async bien() { return 1; }
      @Observada('operacion_falla') async mal(): Promise<void> { throw new Error('fallo de prueba'); }
    }
    await new Servicio().bien();
    await expect(new Servicio().mal()).rejects.toThrow('fallo de prueba');
    const texto = await registro.metrics();
    expect(texto).toMatch(/convocatorias_operacion_duracion_segundos_count\{operacion="operacion_ok",resultado="ok"\} \d+/);
    expect(texto).toMatch(/convocatorias_operacion_duracion_segundos_count\{operacion="operacion_falla",resultado="error"\} \d+/);
    expect(entradas.some((e) => e.datos.resultado === 'error')).toBe(true);
  });

  it('no emite eventos de una operación que falló (no hay cambio confirmado)', async () => {
    const { entradas, observador } = observadorConLogs();
    restaurar = fijarObservador(observador);
    const antes = await valor('convocatorias_postulaciones_enviadas_total');
    class Servicio {
      @Observada('revierte') async operar(): Promise<void> {
        notificarAuditoria({ postulacionId: 'p1', accion: 'postulacion_enviada', correlacionId: randomUUID() });
        throw new Error('rollback');
      }
    }
    await expect(new Servicio().operar()).rejects.toThrow('rollback');
    expect(entradas.some((e) => e.datos.evento === 'postulacion_enviada')).toBe(false);
    expect(await valor('convocatorias_postulaciones_enviadas_total')).toBe(antes);
  });

  it('cuenta vencimientos y fallos de validación sin etiquetas ni campos con datos personales', async () => {
    const { entradas, observador } = observadorConLogs();
    restaurar = fijarObservador(observador);
    const antesExp = await valor('convocatorias_expiraciones_total');
    const antesVal = await valor('convocatorias_validaciones_fallidas_total', { motivo: 'antivirus' });
    validacionFallida('antivirus', randomUUID());
    notificarAuditoria({ postulacionId: 'p9', accion: 'subsanacion_vencida', estadoAnterior: 'requiere_subsanacion', estadoNuevo: 'no_admitida', correlacionId: randomUUID() });
    expect(await valor('convocatorias_expiraciones_total')).toBe(antesExp + 1);
    expect(await valor('convocatorias_validaciones_fallidas_total', { motivo: 'antivirus' })).toBe(antesVal + 1);

    // Un campo con datos personales jamás llega al log, ni siquiera si un llamador lo pasa por error.
    observador.registrar('postulacion_enviada', {
      correlacionId: randomUUID(), postulacionId: 'p1', correo: 'ana@example.ec', nombre: 'Ana Torres', motivo: 'texto libre', nombreOriginal: 'dossier-ana.pdf',
    });
    const ultimo = entradas.at(-1)!;
    expect(Object.keys(ultimo.datos)).not.toEqual(expect.arrayContaining(['correo', 'nombre', 'motivo', 'nombreOriginal']));
    expect(JSON.stringify(entradas)).not.toMatch(/ana@example|Ana Torres|texto libre|dossier-ana/);
    const metricas = await registro.metrics();
    expect(metricas.split('\n').filter((l) => l.startsWith('convocatorias_')).join('\n')).not.toMatch(/@|uuid|[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });
});
