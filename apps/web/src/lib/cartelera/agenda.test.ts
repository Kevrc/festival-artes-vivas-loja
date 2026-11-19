import { describe, expect, it } from 'vitest';
import { avisosAgenda } from './agenda';

const f = (id: string, inicio: string, fin: string, sede = 's1', estado = 'programada') => ({
  id, inicio, fin, estado, sede: { id: sede, nombre: sede }, obra: { titulo: id },
});

describe('avisosAgenda (RN-004)', () => {
  it('US5-AS1: avisa el cruce de 19:00–20:30 con 20:00–21:00', () => {
    const avisos = avisosAgenda([f('a', '2026-11-14T19:00:00-05:00', '2026-11-14T20:30:00-05:00'), f('b', '2026-11-14T20:00:00-05:00', '2026-11-14T21:00:00-05:00', 's2')]);
    expect(avisos).toEqual([{ tipo: 'cruce', primera: 'a', segunda: 'b' }]);
  });
  it('US5-AS2: avisa traslado ajustado de 5 min entre sedes distintas', () => {
    const avisos = avisosAgenda([f('a', '2026-11-14T19:00:00-05:00', '2026-11-14T20:00:00-05:00', 'bolivar'), f('b', '2026-11-14T20:05:00-05:00', '2026-11-14T21:00:00-05:00', 'cueva')]);
    expect(avisos).toEqual([{ tipo: 'traslado', primera: 'a', segunda: 'b', minutos: 5 }]);
  });
  it('no avisa traslado en la misma sede ni con 15 min o más', () => {
    expect(avisosAgenda([f('a', '2026-11-14T19:00:00-05:00', '2026-11-14T20:00:00-05:00'), f('b', '2026-11-14T20:05:00-05:00', '2026-11-14T21:00:00-05:00')])).toEqual([]);
    expect(avisosAgenda([f('a', '2026-11-14T19:00:00-05:00', '2026-11-14T20:00:00-05:00', 'x'), f('b', '2026-11-14T20:15:00-05:00', '2026-11-14T21:00:00-05:00', 'y')])).toEqual([]);
  });
  it('ignora funciones canceladas', () => {
    expect(avisosAgenda([f('a', '2026-11-14T19:00:00-05:00', '2026-11-14T20:30:00-05:00'), f('b', '2026-11-14T20:00:00-05:00', '2026-11-14T21:00:00-05:00', 's2', 'cancelada')])).toEqual([]);
  });
});
