import { describe, expect, it } from 'vitest';
import { detectarConflicto } from './conflictos';

const elenco = {
  cuentaId: 'cuenta-elenco', nombre: 'Colectivo Umbral', responsable: 'María Lucía Pérez', integrantes: ['Ana Torres', 'Luis Jiménez'],
};

describe('US3-AS3 · conflicto de interés (RN-004)', () => {
  it('detecta al curador integrante del elenco, sin importar tildes ni mayúsculas', () => {
    const r = detectarConflicto({ cuentaId: 'c1', conflictos: ['luis jimenez'] }, elenco);
    expect(r).toMatchObject({ conflicto: true });
    expect('motivo' in r && r.motivo).toMatch(/integrante|declarad/i);
  });

  it('detecta al familiar declarado o al representante del elenco', () => {
    expect(detectarConflicto({ cuentaId: 'c1', conflictos: [{ nombre: 'Ana Torres', relacion: 'familiar' }] }, elenco).conflicto).toBe(true);
    expect(detectarConflicto({ cuentaId: 'c1', conflictos: ['MARÍA LUCÍA PÉREZ'] }, elenco).conflicto).toBe(true);
    expect(detectarConflicto({ cuentaId: 'c1', conflictos: ['colectivo umbral'] }, elenco).conflicto).toBe(true);
  });

  it('detecta cuando el curador es la misma cuenta que representa al elenco', () => {
    expect(detectarConflicto({ cuentaId: 'cuenta-elenco', conflictos: [] }, elenco).conflicto).toBe(true);
  });

  it('no marca conflicto sin coincidencias y tolera datos mal formados', () => {
    expect(detectarConflicto({ cuentaId: 'c1', conflictos: ['Pedro Ruiz'] }, elenco)).toEqual({ conflicto: false });
    expect(detectarConflicto({ cuentaId: 'c1', conflictos: null }, { ...elenco, integrantes: 'no es lista' })).toEqual({ conflicto: false });
    expect(detectarConflicto({ cuentaId: 'c1', conflictos: ['', 7, {}] }, elenco)).toEqual({ conflicto: false });
  });
});
