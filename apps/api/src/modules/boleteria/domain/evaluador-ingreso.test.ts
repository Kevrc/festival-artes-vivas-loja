import { describe, expect, it } from 'vitest';
import { evaluarEscaneoEntrada, validarVentanaIngreso } from './evaluador-ingreso';

describe('evaluador-ingreso (US2, RN-003)', () => {
  const inicio = new Date('2026-11-14T19:00:00-05:00');
  const fin = new Date('2026-11-14T20:30:00-05:00');
  const baseEntrada = {
    id: 'ent-1',
    funcionId: 'fun-1',
    estado: 'valida' as const,
  };

  it('RN-003: acepta ingreso desde 60 minutos antes hasta la hora de fin', () => {
    expect(validarVentanaIngreso({ inicio, fin, ahora: new Date('2026-11-14T18:00:00-05:00') })).toBe(true);
    expect(validarVentanaIngreso({ inicio, fin, ahora: new Date('2026-11-14T17:59:59-05:00') })).toBe(false);
    expect(validarVentanaIngreso({ inicio, fin, ahora: new Date('2026-11-14T20:30:00-05:00') })).toBe(true);
    expect(validarVentanaIngreso({ inicio, fin, ahora: new Date('2026-11-14T20:30:01-05:00') })).toBe(false);
  });

  it('US2-AS1: devuelve verde para entrada válida dentro de ventana', () => {
    const r = evaluarEscaneoEntrada({
      entrada: baseEntrada,
      firmaValida: true,
      funcionAbiertaId: 'fun-1',
      inicioFuncion: inicio,
      finFuncion: fin,
      ahora: new Date('2026-11-14T18:30:00-05:00'),
      dispositivoId: 'dev-1',
    });
    expect(r.semaforo).toBe('verde');
    expect(r.codigo).toBe('valida');
  });

  it('US2: devuelve ámbar si la misma entrada fue validada hace < 60 s en el mismo dispositivo', () => {
    const r = evaluarEscaneoEntrada({
      entrada: {
        ...baseEntrada,
        estado: 'usada',
        usadaEn: new Date('2026-11-14T18:30:00-05:00'),
        dispositivoAnterior: 'dev-1',
        puertaAnterior: 'Puerta A',
      },
      firmaValida: true,
      funcionAbiertaId: 'fun-1',
      inicioFuncion: inicio,
      finFuncion: fin,
      ahora: new Date('2026-11-14T18:30:40-05:00'),
      dispositivoId: 'dev-1',
    });
    expect(r.semaforo).toBe('ambar');
    expect(r.codigo).toBe('doble_lectura_reciente');
  });

  it('US2-AS2: devuelve rojo si ya fue usada en otro dispositivo o hace >= 60 s', () => {
    const r = evaluarEscaneoEntrada({
      entrada: {
        ...baseEntrada,
        estado: 'usada',
        usadaEn: new Date('2026-11-14T18:20:00-05:00'),
        dispositivoAnterior: 'dev-2',
        puertaAnterior: 'Puerta Norte',
      },
      firmaValida: true,
      funcionAbiertaId: 'fun-1',
      inicioFuncion: inicio,
      finFuncion: fin,
      ahora: new Date('2026-11-14T18:20:10-05:00'),
      dispositivoId: 'dev-1',
    });
    expect(r.semaforo).toBe('rojo');
    expect(r.codigo).toBe('ya_usada');
    expect(r.puertaAnterior).toBe('Puerta Norte');
  });

  it('US2-AS3 y US2-AS4: rechaza firma inválida, otra función, anulada, liberada, no encontrada y fuera de horario', () => {
    expect(
      evaluarEscaneoEntrada({
        entrada: baseEntrada,
        firmaValida: false,
        funcionAbiertaId: 'fun-1',
        inicioFuncion: inicio,
        finFuncion: fin,
        ahora: new Date('2026-11-14T18:30:00-05:00'),
        dispositivoId: 'dev-1',
      }).codigo,
    ).toBe('firma_invalida');

    expect(
      evaluarEscaneoEntrada({
        entrada: null,
        firmaValida: true,
        funcionAbiertaId: 'fun-1',
        inicioFuncion: inicio,
        finFuncion: fin,
        ahora: new Date('2026-11-14T18:30:00-05:00'),
        dispositivoId: 'dev-1',
      }).codigo,
    ).toBe('no_encontrada');

    expect(
      evaluarEscaneoEntrada({
        entrada: { ...baseEntrada, funcionId: 'fun-2' },
        firmaValida: true,
        funcionAbiertaId: 'fun-1',
        inicioFuncion: inicio,
        finFuncion: fin,
        ahora: new Date('2026-11-14T18:30:00-05:00'),
        dispositivoId: 'dev-1',
      }).codigo,
    ).toBe('otra_funcion');

    expect(
      evaluarEscaneoEntrada({
        entrada: { ...baseEntrada, estado: 'anulada' },
        firmaValida: true,
        funcionAbiertaId: 'fun-1',
        inicioFuncion: inicio,
        finFuncion: fin,
        ahora: new Date('2026-11-14T18:30:00-05:00'),
        dispositivoId: 'dev-1',
      }).codigo,
    ).toBe('anulada');

    expect(
      evaluarEscaneoEntrada({
        entrada: { ...baseEntrada, estado: 'liberada' },
        firmaValida: true,
        funcionAbiertaId: 'fun-1',
        inicioFuncion: inicio,
        finFuncion: fin,
        ahora: new Date('2026-11-14T18:30:00-05:00'),
        dispositivoId: 'dev-1',
      }).codigo,
    ).toBe('liberada');

    expect(
      evaluarEscaneoEntrada({
        entrada: baseEntrada,
        firmaValida: true,
        funcionAbiertaId: 'fun-1',
        inicioFuncion: inicio,
        finFuncion: fin,
        ahora: new Date('2026-11-14T17:00:00-05:00'),
        dispositivoId: 'dev-1',
      }).codigo,
    ).toBe('fuera_de_horario');
  });
});
