import { describe, expect, it } from 'vitest';
import {
  type FuncionAgenda,
  bloquesDe,
  calcularFin,
  detectarConflictos,
  diaFestival,
  feriadoDe,
  rangoDelDia,
  validarFinPedido,
} from './agenda';

const t = (local: string) => new Date(`${local}:00-05:00`);
const BOLIVAR = 'sede-bolivar';
const NACIONAL = 'sede-nacional';

function funcion(p: Partial<FuncionAgenda> & Pick<FuncionAgenda, 'id' | 'inicio' | 'fin'>): FuncionAgenda {
  return {
    sedeId: BOLIVAR,
    sedeNombre: 'Teatro Bolívar',
    montajeMin: 30,
    elencoId: `elenco-${p.id}`,
    obraTitulo: `Obra ${p.id}`,
    continua: false,
    activa: true,
    ...p,
  };
}

describe('calcularFin y fin editable solo hacia más tiempo (RN-002)', () => {
  it('US1-AS1: "El Cura sin cabeza" (90 min) a las 20:00 termina a las 21:30', () => {
    expect(calcularFin(t('2026-11-12T20:00'), 90).toISOString()).toBe(t('2026-11-12T21:30').toISOString());
  });

  it('el fin pedido puede alargarse pero no acortarse', () => {
    const calculado = t('2026-11-12T21:30');
    expect(validarFinPedido(calculado, t('2026-11-12T21:45'))).toEqual({ ok: true, fin: t('2026-11-12T21:45') });
    expect(validarFinPedido(calculado, undefined)).toEqual({ ok: true, fin: calculado });
    expect(validarFinPedido(calculado, t('2026-11-12T21:00'))).toEqual({ ok: false, codigo: 'fin_menor' });
  });
});

describe('cruces de sede con montaje (RN-001, FR-002)', () => {
  const ocupada = funcion({ id: 'a', inicio: t('2026-11-13T19:00'), fin: t('2026-11-13T21:00') });

  it('US1-AS2: a las 21:15 choca (montaje de 30 min) y se informa la función en conflicto', () => {
    const nueva = funcion({ id: 'b', inicio: t('2026-11-13T21:15'), fin: t('2026-11-13T22:15') });
    const conflictos = detectarConflictos(nueva, [ocupada]);
    expect(conflictos).toEqual([
      {
        tipo: 'sede',
        funcionId: 'a',
        obraTitulo: 'Obra a',
        sedeNombre: 'Teatro Bolívar',
        inicio: ocupada.inicio,
        fin: ocupada.fin,
        libreDesde: t('2026-11-13T21:30'),
      },
    ]);
  });

  it('US1-AS2: a las 21:30 ya no choca (intervalos semiabiertos)', () => {
    const nueva = funcion({ id: 'b', inicio: t('2026-11-13T21:30'), fin: t('2026-11-13T22:30') });
    expect(detectarConflictos(nueva, [ocupada])).toEqual([]);
  });

  it('el montaje también se exige antes: no se puede terminar justo cuando empieza otra', () => {
    const antes = funcion({ id: 'c', inicio: t('2026-11-13T17:45'), fin: t('2026-11-13T18:45') });
    expect(detectarConflictos(antes, [ocupada]).map((c) => c.funcionId)).toEqual(['a']);
    const holgada = funcion({ id: 'd', inicio: t('2026-11-13T17:00'), fin: t('2026-11-13T18:30') });
    expect(detectarConflictos(holgada, [ocupada])).toEqual([]);
  });

  it('otra sede, la propia función y las canceladas no cuentan', () => {
    const enOtraSede = funcion({ id: 'e', sedeId: NACIONAL, inicio: t('2026-11-13T19:30'), fin: t('2026-11-13T20:30') });
    expect(detectarConflictos(enOtraSede, [ocupada])).toEqual([]);
    expect(detectarConflictos({ ...ocupada }, [ocupada])).toEqual([]);
    const cancelada = { ...ocupada, id: 'x', activa: false };
    const nueva = funcion({ id: 'f', inicio: t('2026-11-13T20:00'), fin: t('2026-11-13T21:00') });
    expect(detectarConflictos(nueva, [cancelada])).toEqual([]);
  });
});

describe('cruces de elenco (FR-003)', () => {
  it('US1-AS4: el mismo elenco no puede estar en dos sedes a la vez', () => {
    const enBolivar = funcion({ id: 'a', elencoId: 'cano', inicio: t('2026-11-12T19:00'), fin: t('2026-11-12T20:30') });
    const enNacional = funcion({ id: 'b', elencoId: 'cano', sedeId: NACIONAL, sedeNombre: 'Teatro Nacional', inicio: t('2026-11-12T20:00'), fin: t('2026-11-12T21:30') });
    expect(detectarConflictos(enNacional, [enBolivar])).toEqual([
      expect.objectContaining({ tipo: 'elenco', funcionId: 'a', sedeNombre: 'Teatro Bolívar' }),
    ]);
  });

  it('el elenco no necesita montaje entre sus funciones: puede actuar justo al terminar en otra sede', () => {
    const a = funcion({ id: 'a', elencoId: 'cano', inicio: t('2026-11-12T19:00'), fin: t('2026-11-12T20:00') });
    const b = funcion({ id: 'b', elencoId: 'cano', sedeId: NACIONAL, inicio: t('2026-11-12T20:00'), fin: t('2026-11-12T21:00') });
    expect(detectarConflictos(b, [a])).toEqual([]);
  });

  it('en la misma sede con el mismo elenco informa ambos cruces', () => {
    const a = funcion({ id: 'a', elencoId: 'cano', inicio: t('2026-11-12T19:00'), fin: t('2026-11-12T20:00') });
    const b = funcion({ id: 'b', elencoId: 'cano', inicio: t('2026-11-12T19:30'), fin: t('2026-11-12T20:30') });
    expect(detectarConflictos(b, [a]).map((c) => c.tipo).sort()).toEqual(['elenco', 'sede']);
  });
});

describe('actividades continuas (caso borde, research R1)', () => {
  const expo = funcion({ id: 'buddy', continua: true, montajeMin: 0, inicio: t('2026-11-12T09:00'), fin: t('2026-11-22T17:00') });

  it('ocupan la sede durante su horario cada día: un bloque por día', () => {
    const bloques = bloquesDe(expo);
    expect(bloques).toHaveLength(11);
    expect(bloques[0]).toEqual({ sede: { desde: t('2026-11-12T09:00'), hasta: t('2026-11-12T17:00') }, elenco: { desde: t('2026-11-12T09:00'), hasta: t('2026-11-12T17:00') } });
    expect(bloques[10]!.sede.hasta).toEqual(t('2026-11-22T17:00'));
  });

  it('fuera de su horario diario la sede queda libre; dentro, choca', () => {
    const noche = funcion({ id: 'n', inicio: t('2026-11-15T19:00'), fin: t('2026-11-15T20:00') });
    expect(detectarConflictos(noche, [expo])).toEqual([]);
    const tarde = funcion({ id: 'm', inicio: t('2026-11-15T16:00'), fin: t('2026-11-15T17:30') });
    expect(detectarConflictos(tarde, [expo]).map((c) => c.funcionId)).toEqual(['buddy']);
  });

  it('una función normal produce un bloque con el montaje sumado solo a la sede', () => {
    const f = funcion({ id: 'a', inicio: t('2026-11-12T20:00'), fin: t('2026-11-12T21:30') });
    expect(bloquesDe(f)).toEqual([{ sede: { desde: t('2026-11-12T20:00'), hasta: t('2026-11-12T22:00') }, elenco: { desde: t('2026-11-12T20:00'), hasta: t('2026-11-12T21:30') } }]);
  });
});

describe('día del festival en America/Guayaquil', () => {
  it('una función que cruza medianoche cuenta para el día en que empieza', () => {
    expect(diaFestival(t('2026-11-14T23:30'))).toBe('2026-11-14');
    expect(diaFestival(new Date('2026-11-15T04:59:00Z'))).toBe('2026-11-14');
    expect(diaFestival(new Date('2026-11-15T05:00:00Z'))).toBe('2026-11-15');
  });

  it('el rango de un día va de 00:00 a 24:00 en Loja', () => {
    expect(rangoDelDia('2026-11-14')).toEqual({ desde: t('2026-11-14T00:00'), hasta: t('2026-11-15T00:00') });
  });

  it('el feriado del 20 de noviembre se informa pero no bloquea', () => {
    expect(feriadoDe('2026-11-20')).toBe('Feriado nacional');
    expect(feriadoDe('2026-11-19')).toBeNull();
    const enFeriado = funcion({ id: 'a', inicio: t('2026-11-20T19:00'), fin: t('2026-11-20T20:00') });
    expect(detectarConflictos(enFeriado, [])).toEqual([]);
  });
});
