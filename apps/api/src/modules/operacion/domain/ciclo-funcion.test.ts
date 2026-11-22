import { describe, expect, it } from 'vitest';
import { cancelar, excesoDeAforo, publicar, reprogramar } from './ciclo-funcion';

const ahora = new Date('2026-11-10T12:00:00-05:00');
const fin = new Date('2026-11-14T21:30:00-05:00');
const programada = { estado: 'programada' as const, version: 2, fin };

describe('ciclo de vida de una función: publicación (spec §Ciclo de vida)', () => {
  it('borrador → programada, con versión +1 y fecha de publicación', () => {
    expect(publicar({ estado: 'borrador', version: 1 }, ahora)).toEqual({ ok: true, estado: 'programada', version: 2, publicadaEn: ahora });
  });

  it('solo se publica un borrador', () => {
    for (const estado of ['programada', 'reprogramada', 'cancelada'] as const) {
      expect(publicar({ estado, version: 3 }, ahora)).toEqual({ ok: false, codigo: 'funcion_publicada' });
    }
  });
});

describe('reprogramar y cancelar (US3, RN-005, RN-007)', () => {
  const ok = { edicionCerrada: false, ahora };

  it('US3-AS1: una función programada o reprogramada pasa a reprogramada con motivo', () => {
    expect(reprogramar(programada, 'lluvia', ok)).toEqual({ ok: true, estado: 'reprogramada', version: 3 });
    expect(reprogramar({ ...programada, estado: 'reprogramada' }, 'otra vez lluvia', ok)).toEqual({ ok: true, estado: 'reprogramada', version: 3 });
  });

  it('US3-AS3: cancelar con motivo deja la función cancelada', () => {
    expect(cancelar(programada, 'Elenco enfermo', ok)).toEqual({ ok: true, estado: 'cancelada', version: 3 });
  });

  it('US3-AS4: sin motivo (o solo espacios, o demasiado corto) se rechaza', () => {
    for (const motivo of ['', '   ', 'no', undefined]) {
      expect(reprogramar(programada, motivo, ok)).toEqual({ ok: false, codigo: 'motivo_requerido' });
      expect(cancelar(programada, motivo, ok)).toEqual({ ok: false, codigo: 'motivo_requerido' });
    }
  });

  it('US3-AS5 y RN-005: una función ya finalizada (pasó su fin) no se cambia', () => {
    const tarde = { edicionCerrada: false, ahora: new Date(fin.getTime() + 1) };
    expect(reprogramar(programada, 'lluvia', tarde)).toEqual({ ok: false, codigo: 'funcion_finalizada' });
    expect(cancelar(programada, 'lluvia', { edicionCerrada: false, ahora: fin })).toEqual({ ok: false, codigo: 'funcion_finalizada' });
  });

  it('RN-007: con la edición cerrada no hay transiciones', () => {
    expect(reprogramar(programada, 'lluvia', { edicionCerrada: true, ahora })).toEqual({ ok: false, codigo: 'edicion_cerrada' });
    expect(cancelar(programada, 'lluvia', { edicionCerrada: true, ahora })).toEqual({ ok: false, codigo: 'edicion_cerrada' });
  });

  it('un borrador se edita o se elimina; una cancelada ya no cambia', () => {
    expect(reprogramar({ ...programada, estado: 'borrador' }, 'lluvia', ok)).toEqual({ ok: false, codigo: 'funcion_en_borrador' });
    expect(cancelar({ ...programada, estado: 'borrador' }, 'lluvia', ok)).toEqual({ ok: false, codigo: 'funcion_en_borrador' });
    expect(reprogramar({ ...programada, estado: 'cancelada' }, 'lluvia', ok)).toEqual({ ok: false, codigo: 'funcion_cancelada' });
    expect(cancelar({ ...programada, estado: 'cancelada' }, 'lluvia', ok)).toEqual({ ok: false, codigo: 'funcion_cancelada' });
  });
});

describe('exceso de aforo al reprogramar (US3-AS2, research R5)', () => {
  it('es la cifra de entradas activas por encima del nuevo aforo', () => {
    expect(excesoDeAforo(320, 300)).toBe(20);
    expect(excesoDeAforo(300, 300)).toBe(0);
    expect(excesoDeAforo(10, 300)).toBe(0);
  });

  it('sin aforo (acceso libre) no hay exceso', () => {
    expect(excesoDeAforo(50, null)).toBe(0);
  });
});
