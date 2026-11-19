import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ejemplo } from './ejemplos';
import { EventoCartelera, colaDe } from './index';

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
  });
});
