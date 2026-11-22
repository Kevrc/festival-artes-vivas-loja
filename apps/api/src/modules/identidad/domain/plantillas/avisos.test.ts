import { describe, expect, it } from 'vitest';
import { redactar } from './avisos';

const WEB = 'https://fiavl.ec';
const funcion = { titulo: 'El lugar del otro', sedeNombre: 'Teatro Bolívar', inicio: '2026-11-14T20:00:00-05:00' };

describe('plantillas de avisos (US10, FR-021)', () => {
  it('entradas emitidas: códigos, importe y un QR adjunto por entrada con texto alternativo', () => {
    const c = redactar('entradas_emitidas', { funcion, tipo: 'compra', importeCentavos: 1000, entradas: [{ codigoCorto: 'AB12', tokenQr: 't1' }, { codigoCorto: 'CD34', tokenQr: 't2' }] }, WEB);
    expect(c.asunto).toBe('Tus entradas · FIAVL');
    expect(c.texto).toContain('2 entradas para «El lugar del otro» (Teatro Bolívar,');
    expect(c.texto).toContain('USD 10,00');
    expect(c.texto).toContain('AB12, CD34');
    expect(c.qrs).toEqual([
      { cid: 'qr-1@fiavl', valor: 't1', codigoCorto: 'AB12' },
      { cid: 'qr-2@fiavl', valor: 't2', codigoCorto: 'CD34' },
    ]);
    expect(c.html).toContain('src="cid:qr-1@fiavl"');
    expect(c.html).toContain('alt="Código QR de la entrada AB12"');
    expect(c.texto).not.toContain('t1'); // el token no va en el texto
  });

  it('reserva sin importe y sin ficha de función', () => {
    const c = redactar('entradas_emitidas', { tipo: 'reserva', entradas: [{ codigoCorto: 'ZZ99', tokenQr: 't' }] }, WEB);
    expect(c.asunto).toBe('Tu reserva está confirmada · FIAVL');
    expect(c.texto).toContain('1 entrada para tu función');
    expect(c.texto).not.toContain('USD');
  });

  it('cambios de función, devolución y convocatorias', () => {
    const r = redactar('funcion_reprogramada', { funcion, nuevo: { inicio: '2026-11-15T19:00:00-05:00', sedeNombre: 'Teatro Nacional' }, motivo: 'lluvia' }, WEB);
    expect(r.texto).toContain('«El lugar del otro» pasa a ser el domingo, 15 de noviembre de 2026');
    expect(r.texto).toContain('Teatro Nacional');
    expect(r.texto).toContain('Motivo: lluvia.');
    expect(redactar('funcion_cancelada', { funcion }, WEB).texto).toContain('«El lugar del otro» (Teatro Bolívar,');
    expect(redactar('devolucion', { funcion: null, importeCentavos: 500, motivo: 'funcion_cancelada' }, WEB).texto).toContain('USD 5,00 de tu pedido para tu función porque la función fue cancelada');
    expect(redactar('acuse_postulacion', { numero: 'PN-2026-0007' }, WEB).texto).toContain('PN-2026-0007');
    const s = redactar('subsanacion', { numero: 'PN-2026-0007', detalle: 'Falta el rider técnico.', venceEn: '2026-07-01T23:59:00-05:00' }, WEB);
    expect(s.texto).toContain('Falta el rider técnico.');
    expect(s.texto).toContain('1 de julio de 2026');
    expect(redactar('resultado', { numero: 'X', resultado: 'seleccionada' }, WEB).texto).toContain('fue seleccionada');
    expect(redactar('novedad', { titulo: 'Abrimos la venta', texto: 'Ya puedes comprar.' }, WEB).asunto).toBe('Abrimos la venta · FIAVL');
  });

  it('escapa los datos en el HTML', () => {
    const c = redactar('funcion_cancelada', { funcion: { ...funcion, titulo: '<b>x</b>' } }, WEB);
    expect(c.html).not.toContain('<b>x</b>');
  });
});
