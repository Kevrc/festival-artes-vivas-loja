import { describe, expect, it } from 'vitest';
import { PLAZO_ENVIO_MS, REINTENTOS, categoriaDe, claveDedup, datosTrasEnvio, errorSeguro, esperaAntesDe, estadoInicial, vencida } from './notificaciones';

// T093 · US10, RN-011.
describe('notificaciones', () => {
  it('RN-011: la clave de deduplicación es tipoEvento:eventoId:destinatario', () => {
    expect(claveDedup('EntradasEmitidas', 'e1', ' Ana@FIAVL.test ')).toBe('EntradasEmitidas:e1:ana@fiavl.test');
    expect(claveDedup('FuncionCancelada', 'e1', 'a@x.ec')).not.toBe(claveDedup('FuncionCancelada', 'e2', 'a@x.ec'));
  });

  it('solo las novedades son opcionales', () => {
    expect(categoriaDe('novedad')).toBe('opcional');
    for (const p of ['entradas_emitidas', 'devolucion', 'funcion_reprogramada', 'funcion_cancelada', 'acuse_postulacion', 'subsanacion', 'resultado'] as const) {
      expect(categoriaDe(p)).toBe('servicio');
    }
  });

  it('US10-AS4: una opcional sin consentimiento se omite; las de servicio se envían siempre', () => {
    expect(estadoInicial('opcional', false)).toBe('omitida');
    expect(estadoInicial('opcional', true)).toBe('pendiente');
    expect(estadoInicial('servicio', false)).toBe('pendiente');
  });

  it('US10-AS2: pasadas 24 h sin enviar queda fallida; los reintentos cubren ese plazo', () => {
    const creada = new Date('2026-11-14T12:00:00Z');
    expect(vencida(creada, new Date(creada.getTime() + PLAZO_ENVIO_MS - 1))).toBe(false);
    expect(vencida(creada, new Date(creada.getTime() + PLAZO_ENVIO_MS))).toBe(true);
    expect(esperaAntesDe(0)).toBe(30);
    expect(esperaAntesDe(1)).toBe(60);
    const total = Array.from({ length: REINTENTOS.limite }, (_, n) => esperaAntesDe(n)).reduce((a, b) => a + b, 0);
    expect(total * 1000).toBeGreaterThan(PLAZO_ENVIO_MS);
  });

  it('al enviar se borran los tokenQr de las entradas', () => {
    const datos = { pedidoId: 'p', entradas: [{ codigoCorto: 'AB12', tokenQr: 'secreto' }, null] };
    expect(datosTrasEnvio(datos)).toEqual({ pedidoId: 'p', entradas: [{ codigoCorto: 'AB12' }, null] });
    expect(datosTrasEnvio({ motivo: 'x' })).toEqual({ motivo: 'x' });
  });

  it('el último error no guarda direcciones de correo y es corto', () => {
    expect(errorSeguro(new Error('550 rechazado para ana@fiavl.test'))).toBe('550 rechazado para [correo]');
    expect(errorSeguro('x'.repeat(500))).toHaveLength(300);
  });
});
