import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ejemplo } from './ejemplos';
import { EventoCartelera, EventoOperacionBoleteria, EventoPublicadoBoleteria, colaDe } from './index';

const edicionId = randomUUID();
const sedeId = randomUUID();
const funcion = {
  funcion: {
    id: randomUUID(),
    version: 1,
    inicio: '2026-11-12T20:00:00-05:00',
    fin: '2026-11-12T21:30:00-05:00',
    continua: false,
    tipoAcceso: 'pagada' as const,
    publico: 'adultos' as const,
    aforoHabilitado: 800,
  },
  obra: {
    id: randomUUID(),
    titulo: 'El Cura sin cabeza',
    sinopsis: 'Leyenda andina',
    disciplina: 'teatro' as const,
    duracionMin: 90,
    edadMinima: 12,
    imagenes: [],
    fichaArtistica: [],
    componente: 'nacional' as const,
  },
  elenco: { id: randomUUID(), nombre: 'Cano Artes Escénicas', pais: 'Ecuador' },
  sede: {
    id: sedeId,
    nombre: 'Teatro Nacional Benjamín Carrión Mora',
    tipo: 'teatro' as const,
    direccion: 'Loja',
    lat: -3.99,
    lng: -79.2,
    accesibilidad: {},
  },
};

describe('contrato de eventos consumidos por la cartelera', () => {
  it('acepta un FuncionProgramada válido', () => {
    expect(EventoCartelera.safeParse(ejemplo.funcionProgramada(edicionId, funcion)).success).toBe(true);
  });

  it('acepta los demás eventos del contrato', () => {
    const eventos = [
      ejemplo.programacionPublicada(edicionId, {
        edicion: { id: edicionId, anio: 2026, numero: 'XI', fechaInicio: '2026-11-12', fechaFin: '2026-11-22' },
        funcionIds: [funcion.funcion.id],
      }),
      ejemplo.funcionReprogramada(edicionId, {
        funcionId: funcion.funcion.id,
        version: 2,
        anterior: { inicio: '2026-11-12T20:00:00-05:00', fin: '2026-11-12T21:30:00-05:00', sedeId },
        nuevo: { inicio: '2026-11-13T20:00:00-05:00', fin: '2026-11-13T21:30:00-05:00', sedeId },
        motivo: 'lluvia',
      }),
      ejemplo.funcionCancelada(edicionId, { funcionId: funcion.funcion.id, version: 3 }),
      ejemplo.disponibilidadCambiada(edicionId, {
        funcionId: funcion.funcion.id,
        lugaresRestantes: 10,
        aforoHabilitado: 800,
        calculadoEn: new Date().toISOString(),
      }),
    ];
    for (const e of eventos) expect(EventoCartelera.safeParse(e).success, e.tipo).toBe(true);
  });

  it('rechaza un evento sin id ni correlación', () => {
    const { id: _id, correlacionId: _c, ...sinIds } = ejemplo.funcionCancelada(edicionId, { funcionId: randomUUID(), version: 1 });
    expect(EventoCartelera.safeParse(sinIds).success).toBe(false);
  });

  it('rechaza una función que termina antes de empezar', () => {
    const malo = { ...funcion, funcion: { ...funcion.funcion, fin: '2026-11-12T19:00:00-05:00' } };
    expect(EventoCartelera.safeParse(ejemplo.funcionProgramada(edicionId, malo)).success).toBe(false);
  });

  it('rechaza valores fuera de las enumeraciones', () => {
    const malo = { ...funcion, funcion: { ...funcion.funcion, tipoAcceso: 'vip' } };
    expect(EventoCartelera.safeParse(ejemplo.funcionProgramada(edicionId, malo as never)).success).toBe(false);
  });

  it('rechaza una versión de esquema desconocida', () => {
    const e = { ...ejemplo.funcionCancelada(edicionId, { funcionId: randomUUID(), version: 1 }), version: 2 };
    expect(EventoCartelera.safeParse(e).success).toBe(false);
  });

  it('rechaza disponibilidad negativa', () => {
    const e = ejemplo.disponibilidadCambiada(edicionId, {
      funcionId: randomUUID(),
      lugaresRestantes: -1,
      aforoHabilitado: 10,
      calculadoEn: new Date().toISOString(),
    });
    expect(EventoCartelera.safeParse(e).success).toBe(false);
  });

  it('nombra la cola en kebab-case por módulo', () => {
    expect(colaDe('programacion', 'FuncionCancelada')).toBe('programacion.funcion-cancelada');
    expect(colaDe('boleteria', 'AforoCambiado')).toBe('boleteria.aforo-cambiado');
  });
});

describe('contrato de eventos de Boletería y Operación (T005)', () => {
  it('acepta AforoCambiado válido y ProgramacionPublicada con o sin parámetros económicos opcionales', () => {
    const fnId = randomUUID();
    expect(
      EventoOperacionBoleteria.safeParse(
        ejemplo.aforoCambiado(edicionId, { funcionId: fnId, version: 2, aforoAnterior: 300, aforoHabilitado: 250 }),
      ).success,
    ).toBe(true);
    expect(
      EventoOperacionBoleteria.safeParse(
        ejemplo.programacionPublicada(edicionId, {
          edicion: {
            id: edicionId,
            anio: 2026,
            numero: 'XI',
            fechaInicio: '2026-11-12',
            fechaFin: '2026-11-22',
            precioCentavos: 500,
            maxPagadasPersona: 6,
            maxReservasPersona: 4,
          },
          funcionIds: [fnId],
        }),
      ).success,
    ).toBe(true);
  });

  it('acepta los eventos publicados por Boletería válidos', () => {
    const fnId = randomUUID();
    const pedidoId = randomUUID();
    const entradaId = randomUUID();
    const eventos = [
      ejemplo.entradasEmitidas(edicionId, {
        pedidoId,
        funcionId: fnId,
        sedeId,
        canal: 'web',
        tipo: 'compra',
        cantidad: 1,
        importeCentavos: 500,
        cuentaId: randomUUID(),
        correoDestino: 'asistente@fiavl.ec',
        entradas: [{ entradaId, codigoCorto: 'A7K9M2P4', tokenQr: 'v1.token.firma' }],
      }),
      ejemplo.ingresoRegistrado(edicionId, {
        ingresoId: randomUUID(),
        entradaId,
        funcionId: fnId,
        sedeId,
        validadorId: randomUUID(),
        escaneadoEn: new Date().toISOString(),
        diferido: false,
      }),
      ejemplo.pedidoReembolsado(edicionId, {
        pedidoId,
        funcionId: fnId,
        sedeId,
        importeCentavos: 500,
        canal: 'web',
        motivo: 'funcion_cancelada',
        cuentaId: randomUUID(),
      }),
      ejemplo.conflictoDeIngreso(edicionId, {
        entradaId,
        funcionId: fnId,
        sedeId,
        primerDispositivoId: 'dev-1',
        segundoDispositivoId: 'dev-2',
        detectadoEn: new Date().toISOString(),
      }),
      ejemplo.aforoExcedido(edicionId, {
        funcionId: fnId,
        sedeId,
        aforoHabilitado: 100,
        entradasActivas: 110,
        exceso: 10,
      }),
    ];
    for (const e of eventos) expect(EventoPublicadoBoleteria.safeParse(e).success, e.tipo).toBe(true);
  });

  it('rechaza EntradasEmitidas sin entradas o importe negativo y PedidoReembolsado con importe cero', () => {
    const fnId = randomUUID();
    const pedidoId = randomUUID();
    expect(
      EventoPublicadoBoleteria.safeParse(
        ejemplo.entradasEmitidas(edicionId, {
          pedidoId,
          funcionId: fnId,
          sedeId,
          canal: 'web',
          tipo: 'compra',
          cantidad: 1,
          importeCentavos: -10,
          entradas: [],
        }),
      ).success,
    ).toBe(false);
    expect(
      EventoPublicadoBoleteria.safeParse(
        ejemplo.pedidoReembolsado(edicionId, {
          pedidoId,
          funcionId: fnId,
          sedeId,
          importeCentavos: 0,
          canal: 'web',
          motivo: 'funcion_cancelada',
        }),
      ).success,
    ).toBe(false);
  });
});
