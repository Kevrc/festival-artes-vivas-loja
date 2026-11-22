import { describe, expect, it } from 'vitest';
import { type DatoFuncion, aCsv, agrupar, fila, ocupacion, realizada, variacion } from './indicadores';

// T107 · US5, RN-003, RN-004.
const AHORA = new Date('2026-11-23T12:00:00-05:00');
const base: DatoFuncion = {
  funcionId: 'f1', titulo: 'Bondi Beach', dia: '2026-11-13', sedeId: 's1', sedeNombre: 'Teatro Bolívar', disciplina: 'teatro', componente: 'internacional', pais: 'Alemania',
  obraId: 'o1', elencoId: 'e1', estado: 'programada', fin: new Date('2026-11-13T21:15:00-05:00'), aforoHabilitado: 200,
  emitidas: 180, reembolsadas: 0, ingresos: 150, recaudacionCentavos: 90_000, estimado: 0,
};
const f = (p: Partial<DatoFuncion>): DatoFuncion => ({ ...base, ...p });

describe('indicadores', () => {
  it('US5-AS1: aforo 200 y 150 ingresos ⇒ ocupación 75 %', () => {
    expect(ocupacion(150, 200)).toBe(0.75);
    expect(fila('x', 'x', [base], AHORA).ocupacion).toBe(0.75);
  });

  it('RN-003: la ocupación solo usa funciones realizadas con aforo; sin aforo es null', () => {
    expect(ocupacion(10, null)).toBeNull();
    expect(ocupacion(10, 0)).toBeNull();
    const plaza = f({ funcionId: 'f2', aforoHabilitado: null, ingresos: 0, estimado: 1200, emitidas: 0, recaudacionCentavos: 0 });
    const futura = f({ funcionId: 'f3', fin: new Date('2026-11-30T21:00:00-05:00'), ingresos: 0 });
    expect(fila('x', 'x', [base, plaza, futura], AHORA).ocupacion).toBe(0.75);
    expect(fila('x', 'x', [plaza], AHORA).ocupacion).toBeNull();
  });

  it('US5-AS2: 50 000 validados + 113 162 estimados = 163 162, con el desglose', () => {
    const r = fila('t', 'Total', [f({ ingresos: 50_000, aforoHabilitado: 60_000 }), f({ funcionId: 'f2', aforoHabilitado: null, ingresos: 0, estimado: 113_162 })], AHORA);
    expect(r).toMatchObject({ ingresosValidados: 50_000, asistenciaEstimada: 113_162, asistenciaTotal: 163_162 });
  });

  it('cuenta realizadas y canceladas; ignora borradores; emitidas netas de reembolsos; recaudación en centavos', () => {
    const r = fila('x', 'x', [base, f({ funcionId: 'c', estado: 'cancelada', emitidas: 10, reembolsadas: 10, recaudacionCentavos: 0, ingresos: 0 }), f({ funcionId: 'b', estado: 'borrador', emitidas: 99 })], AHORA);
    expect(r).toMatchObject({ funcionesRealizadas: 1, funcionesCanceladas: 1, entradasEmitidas: 180, recaudacionCentavos: 90_000 });
    expect(Number.isInteger(r.recaudacionCentavos)).toBe(true);
    expect(realizada({ estado: 'reprogramada', fin: new Date(AHORA.getTime() - 1) }, AHORA)).toBe(true);
    expect(realizada({ estado: 'programada', fin: new Date(AHORA.getTime() + 1) }, AHORA)).toBe(false);
  });

  it('agrupa por dimensión con totales', () => {
    const datos = [base, f({ funcionId: 'f2', sedeId: 's2', sedeNombre: 'Teatro Nacional', pais: 'Ecuador', dia: '2026-11-14' })];
    const porSede = agrupar('sede', datos, AHORA);
    expect(porSede.filas.map((x) => x.etiqueta)).toEqual(['Teatro Bolívar', 'Teatro Nacional']);
    expect(porSede.totales.ingresosValidados).toBe(300);
    expect(agrupar('dia', datos, AHORA).filas.map((x) => x.clave)).toEqual(['2026-11-13', '2026-11-14']);
    expect(agrupar('pais', datos, AHORA).filas).toHaveLength(2);
    expect(agrupar('funcion', datos, AHORA).filas[0]!.etiqueta).toBe('2026-11-13 · Bondi Beach');
    expect(agrupar('disciplina', datos, AHORA).filas).toHaveLength(1);
    expect(agrupar('componente', datos, AHORA).filas).toHaveLength(1);
  });

  it('variación interanual con un decimal; sin base es null', () => {
    expect(variacion(180_000, 163_162)).toBe(10.3);
    expect(variacion(100, 125)).toBe(-20);
    expect(variacion(100, null)).toBeNull();
    expect(variacion(100, 0)).toBeNull();
    expect(variacion(null, 10)).toBeNull();
  });

  it('US5-AS3: CSV con BOM, «;», decimales con coma y sin inyección de fórmulas', () => {
    const csv = aCsv(agrupar('sede', [base, f({ funcionId: 'f2', sedeId: 's2', sedeNombre: '=HYPERLINK("x");Sala' })], AHORA));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).startsWith('Grupo;Funciones realizadas;')).toBe(true);
    const lineas = csv.trim().split('\r\n');
    expect(lineas[1]).toBe('"\'=HYPERLINK(""x"");Sala";1;0;180;150;0;150;75,0;900,00');
    expect(lineas.at(-1)).toBe('Total;2;0;360;300;0;300;75,0;1800,00');
  });
});
