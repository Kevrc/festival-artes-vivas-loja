import { describe, expect, it } from 'vitest';
import { distanciaMetros, minutosAPie, ordenarPorCercania } from './distancia';

const parqueCentral = { lat: -3.9963, lng: -79.2016 };
const sanSebastian = { lat: -4.0011, lng: -79.2011 };

describe('distancia a pie (research R6)', () => {
  it('haversine entre Parque Central y Plaza San Sebastián ≈ 535 m', () => {
    expect(distanciaMetros(parqueCentral, sanSebastian)).toBeGreaterThan(520);
    expect(distanciaMetros(parqueCentral, sanSebastian)).toBeLessThan(550);
  });
  it('minutos a pie = distancia × 1,3 a 5 km/h, redondeado hacia arriba', () => {
    // 536 m × 1,3 = 697 m → 8,4 min → 9
    expect(minutosAPie(parqueCentral, sanSebastian)).toBe(9);
    expect(minutosAPie(parqueCentral, parqueCentral)).toBe(0);
  });
  it('ordena por cercanía sin modificar la lista', () => {
    const lista = [{ id: 'lejos', sede: { coordenadas: sanSebastian } }, { id: 'cerca', sede: { coordenadas: parqueCentral } }];
    expect(ordenarPorCercania(lista, parqueCentral).map((x) => x.id)).toEqual(['cerca', 'lejos']);
    expect(lista[0]?.id).toBe('lejos');
  });
});
