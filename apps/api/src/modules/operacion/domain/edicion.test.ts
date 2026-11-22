import { describe, expect, it } from 'vitest';
import { type DatosSede, advertenciasEdicion, copiarSedes, parametrosDesde, validarEdicion, validarSede } from './edicion';

// T118 · US6.
const teatro: DatosSede & { id: string } = {
  id: 's1', nombre: 'Teatro Bolívar', tipo: 'teatro', direccion: 'Bolívar y Rocafuerte', lat: -3.99, lng: -79.2, recorrido: null, aforo: 400,
  accesibilidad: { sillaRuedas: true, banoAccesible: false, rampa: true }, montajeMin: 30, horarioTaquilla: '10:00-20:00', activa: true,
};

describe('ediciones', () => {
  it('US6-AS2: fuera de noviembre es una advertencia, no un error', () => {
    const e = { fechaInicio: '2027-10-28', fechaFin: '2027-11-07', precioCentavos: 500, maxPagadasPersona: 6, maxReservasPersona: 4 };
    expect(validarEdicion(e)).toEqual([]);
    expect(advertenciasEdicion(e)).toHaveLength(1);
    expect(advertenciasEdicion({ fechaInicio: '2027-11-11', fechaFin: '2027-11-21' })).toEqual([]);
  });

  it('rechaza fechas invertidas, precio negativo y límites de compra menores que 1', () => {
    expect(validarEdicion({ fechaInicio: '2027-11-21', fechaFin: '2027-11-11', precioCentavos: -1, maxPagadasPersona: 0, maxReservasPersona: 2 })).toEqual([
      'fechas_invertidas', 'precio_invalido', 'limite_invalido',
    ]);
    expect(validarEdicion({ fechaInicio: '2027-11-11', fechaFin: '2027-11-11', precioCentavos: 0, maxPagadasPersona: 1, maxReservasPersona: 1 })).toEqual([]);
  });

  it('US6-AS1: copia las sedes activas con sede_origen_id y sin compartir objetos; parámetros de la base si faltan', () => {
    const plaza: DatosSede & { id: string } = { ...teatro, id: 's2', nombre: 'Plaza', tipo: 'espacio_publico', aforo: null };
    const cerrada = { ...teatro, id: 's3', nombre: 'Antigua', activa: false };
    let n = 0;
    const copias = copiarSedes([teatro, plaza, cerrada], () => `nueva-${++n}`);
    expect(copias.map((c) => [c.id, c.sedeOrigenId, c.nombre])).toEqual([['nueva-1', 's1', 'Teatro Bolívar'], ['nueva-2', 's2', 'Plaza']]);
    expect(copias[0]!.accesibilidad).toEqual(teatro.accesibilidad);
    expect(copias[0]!.accesibilidad).not.toBe(teatro.accesibilidad);
    expect(copias[0]).not.toHaveProperty('funciones');
    const base = { precioCentavos: 500, maxPagadasPersona: 6, maxReservasPersona: 4, paisInvitado: 'México' };
    expect(parametrosDesde(base, {})).toEqual({ precioCentavos: 500, maxPagadasPersona: 6, maxReservasPersona: 4 });
    expect(parametrosDesde(base, { precioCentavos: 600 })).toMatchObject({ precioCentavos: 600, maxPagadasPersona: 6 });
  });
});

describe('sedes', () => {
  it('aforo obligatorio salvo espacio público y recorrido; puntos de paso en recorridos', () => {
    expect(validarSede(teatro)).toEqual([]);
    expect(validarSede({ ...teatro, aforo: null })).toEqual(['aforo_requerido']);
    expect(validarSede({ ...teatro, tipo: 'espacio_publico', aforo: null })).toEqual([]);
    expect(validarSede({ ...teatro, tipo: 'recorrido', aforo: null, recorrido: [{ lat: 0, lng: 0 }] })).toEqual(['recorrido_requerido']);
    expect(validarSede({ ...teatro, tipo: 'recorrido', aforo: null, recorrido: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] })).toEqual([]);
    expect(validarSede({ ...teatro, montajeMin: -5, lat: 120 })).toEqual(['montaje_invalido', 'coordenadas_invalidas']);
  });
});
