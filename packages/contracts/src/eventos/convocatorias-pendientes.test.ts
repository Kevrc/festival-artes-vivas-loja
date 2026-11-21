import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EventoConvocatoriasOperacion, ResultadoPublicado } from './convocatorias-pendientes';

const base = {
  id: randomUUID(),
  version: 1,
  ocurridoEn: '2026-09-01T10:00:00-05:00',
  edicionId: randomUUID(),
  correlacionId: randomUUID(),
};
const ids = { postulacionId: randomUUID(), convocatoriaId: randomUUID(), cuentaPostulanteId: randomUUID(), numero: 'FIAVL-2026-0001' };
const obra = {
  id: randomUUID(),
  titulo: 'Chacovachi en la plaza',
  sinopsis: 'Clown callejero',
  disciplina: 'circo',
  duracionMin: 60,
  edadMinima: 0,
  imagenes: [],
  fichaArtistica: [{ rol: 'intérprete', nombre: 'Chacovachi' }],
  fichaTecnica: { montajeMin: 20, desmontajeMin: 15, requerimientos: ['toma eléctrica'] },
};
const elenco = { id: randomUUID(), nombre: 'Chacovachi', pais: 'Argentina' };

describe('eventos provisionales de Convocatorias (US4 de 003)', () => {
  it('acepta PostulacionSeleccionada con ficha técnica y SeleccionDesistida', () => {
    const validos = [
      { ...base, tipo: 'PostulacionSeleccionada', datos: { ...ids, componente: 'internacional', obra, elenco } },
      { ...base, tipo: 'SeleccionDesistida', datos: { ...ids, obraId: obra.id, motivo: 'Visado negado' } },
    ];
    for (const e of validos) expect(EventoConvocatoriasOperacion.safeParse(e).success).toBe(true);
  });

  it('rechaza obra sin ficha técnica, duración no positiva o desistimiento sin obra', () => {
    const { fichaTecnica: _, ...sinFicha } = obra;
    const invalidos = [
      { ...base, tipo: 'PostulacionSeleccionada', datos: { ...ids, componente: 'nacional', obra: sinFicha, elenco } },
      { ...base, tipo: 'PostulacionSeleccionada', datos: { ...ids, componente: 'nacional', obra: { ...obra, duracionMin: 0 }, elenco } },
      { ...base, tipo: 'SeleccionDesistida', datos: { ...ids } },
    ];
    for (const e of invalidos) expect(EventoConvocatoriasOperacion.safeParse(e).success).toBe(false);
  });

  it('ResultadoPublicado solo admite los resultados definidos', () => {
    expect(ResultadoPublicado.safeParse({ ...base, tipo: 'ResultadoPublicado', datos: { ...ids, resultado: 'lista_espera' } }).success).toBe(true);
    expect(ResultadoPublicado.safeParse({ ...base, tipo: 'ResultadoPublicado', datos: { ...ids, resultado: 'aprobada' } }).success).toBe(false);
  });
});
