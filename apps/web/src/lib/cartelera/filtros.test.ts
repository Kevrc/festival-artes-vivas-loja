import { describe, expect, it } from 'vitest';
import { aplicarFiltros, escribirFiltros, franjaDe, hayFiltros, leerFiltros, quitarUltimo } from './filtros';
import type { FuncionResumen } from './tipos';

const f = (id: string, p: { disciplina?: string; acceso?: FuncionResumen['tipoAcceso']; pais?: string; inicio?: string; sede?: string; publico?: FuncionResumen['publico']; componente?: string }): FuncionResumen => ({
  id,
  inicio: p.inicio ?? '2026-11-14T19:00:00-05:00',
  fin: '2026-11-14T20:00:00-05:00',
  continua: false,
  tipoAcceso: p.acceso ?? 'pagada',
  publico: p.publico ?? 'familiar',
  estado: 'programada',
  obra: { id: `o${id}`, titulo: `Obra ${id}`, disciplina: (p.disciplina ?? 'teatro') as never, componente: (p.componente ?? 'nacional') as never, elenco: { id: 'e', nombre: 'E', pais: p.pais ?? 'Ecuador' } },
  sede: { id: p.sede ?? 's1', nombre: 'Sede', tipo: 'teatro', coordenadas: { lat: 0, lng: 0 } },
});

const lista = [
  f('1', { disciplina: 'circo', acceso: 'gratuita_libre', pais: 'Argentina', inicio: '2026-11-14T17:00:00-05:00' }),
  f('2', { disciplina: 'circo', acceso: 'pagada', pais: 'Chile', sede: 's2' }),
  f('3', { disciplina: 'teatro', acceso: 'gratuita_libre', inicio: '2026-11-14T10:00:00-05:00' }),
  f('4', { disciplina: 'danza', acceso: 'gratuita_reserva', pais: 'España', publico: 'estudiantes', componente: 'internacional' }),
];

describe('aplicarFiltros (FR-003, US2-AS1)', () => {
  it('Y entre parámetros distintos', () => {
    expect(aplicarFiltros(lista, { disciplina: ['circo'], acceso: ['gratuita_libre'] }).map((x) => x.id)).toEqual(['1']);
  });
  it('O entre valores de un mismo parámetro', () => {
    expect(aplicarFiltros(lista, { disciplina: ['circo', 'danza'] }).map((x) => x.id)).toEqual(['1', '2', '4']);
  });
  it('filtra por país, sede, público y componente', () => {
    expect(aplicarFiltros(lista, { pais: ['Chile'] }).map((x) => x.id)).toEqual(['2']);
    expect(aplicarFiltros(lista, { sede: ['s2'] }).map((x) => x.id)).toEqual(['2']);
    expect(aplicarFiltros(lista, { publico: ['estudiantes'] }).map((x) => x.id)).toEqual(['4']);
    expect(aplicarFiltros(lista, { componente: ['internacional'] }).map((x) => x.id)).toEqual(['4']);
  });
  it('filtra por franja horaria en hora de Ecuador', () => {
    expect(aplicarFiltros(lista, { franja: ['manana'] }).map((x) => x.id)).toEqual(['3']);
    expect(aplicarFiltros(lista, { franja: ['tarde'] }).map((x) => x.id)).toEqual(['1']);
    expect(aplicarFiltros(lista, { franja: ['noche'] }).map((x) => x.id)).toEqual(['2', '4']);
  });
  it('sin filtros devuelve todo', () => expect(aplicarFiltros(lista, {})).toHaveLength(4));
});

describe('franjaDe', () => {
  it('12:00 es tarde y 19:00 es noche', () => {
    expect(franjaDe('2026-11-14T11:59:00-05:00')).toBe('manana');
    expect(franjaDe('2026-11-14T12:00:00-05:00')).toBe('tarde');
    expect(franjaDe('2026-11-14T18:59:00-05:00')).toBe('tarde');
    expect(franjaDe('2026-11-14T19:00:00-05:00')).toBe('noche');
  });
});

describe('filtros en la URL (FR-005, US2-AS4)', () => {
  it('lee valores múltiples separados por coma e ignora los desconocidos', () => {
    const filtros = leerFiltros(new URLSearchParams('disciplina=circo,magia&acceso=gratuita_libre&franja=madrugada&otro=1'));
    expect(filtros).toEqual({ disciplina: ['circo'], acceso: ['gratuita_libre'] });
  });
  it('escribe y vuelve a leer lo mismo', () => {
    const filtros = { disciplina: ['circo', 'danza'], pais: ['España'] };
    expect(leerFiltros(new URLSearchParams(escribirFiltros(filtros)))).toEqual(filtros);
  });
  it('hayFiltros y quitarUltimo (US2-AS3)', () => {
    expect(hayFiltros({})).toBe(false);
    expect(quitarUltimo({ disciplina: ['circo'], acceso: ['pagada', 'gratuita_libre'] })).toEqual({ disciplina: ['circo'], acceso: ['pagada'] });
    expect(quitarUltimo({ disciplina: ['circo'] })).toEqual({});
  });
});
