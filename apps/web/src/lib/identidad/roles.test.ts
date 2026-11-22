import { describe, expect, it } from 'vitest';
import { alcanceDeRol, armarRol, describirRol, mismoRol, nombreDeRol } from './roles';

describe('roles del personal', () => {
  it('cada rol con su alcance', () => {
    expect(alcanceDeRol('taquilla')).toBe('sede');
    expect(alcanceDeRol('curador')).toBe('disciplina');
    expect(alcanceDeRol('coordinacion_provincial')).toBe('provincia');
    expect(alcanceDeRol('programador')).toBeNull();
    expect(alcanceDeRol('desconocido')).toBeNull();
    expect(nombreDeRol('desconocido')).toBe('desconocido');
  });

  it('describe el rol con el nombre de la sede', () => {
    const sedes = new Map([['s1', 'Teatro Bolívar']]);
    expect(describirRol({ rol: 'validador', alcance: { tipo: 'sede', valor: 's1' } }, sedes)).toBe('Validación de entradas · Teatro Bolívar');
    expect(describirRol({ rol: 'validador', alcance: { tipo: 'sede', valor: 's2' } }, sedes)).toBe('Validación de entradas · sede desconocida');
    expect(describirRol({ rol: 'curador', alcance: { tipo: 'disciplina', valor: 'danza' } })).toBe('Curaduría · danza');
    expect(describirRol({ rol: 'programador', alcance: null })).toBe('Programación');
  });

  it('arma el rol solo con el alcance que exige', () => {
    expect(armarRol('programador', 'ignorado')).toEqual({ rol: 'programador', alcance: null });
    expect(armarRol('taquilla', '  ')).toBeNull();
    expect(armarRol('taquilla', ' s1 ')).toEqual({ rol: 'taquilla', alcance: { tipo: 'sede', valor: 's1' } });
    expect(mismoRol({ rol: 'taquilla', alcance: { tipo: 'sede', valor: 's1' } }, { rol: 'taquilla', alcance: { tipo: 'sede', valor: 's1' } })).toBe(true);
    expect(mismoRol({ rol: 'taquilla', alcance: null }, { rol: 'taquilla', alcance: { tipo: 'sede', valor: 's1' } })).toBe(false);
  });
});
