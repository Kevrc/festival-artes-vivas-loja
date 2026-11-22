import { describe, expect, it } from 'vitest';
import type { FuncionAgenda } from './agenda';
import { type FuncionAPublicar, requiereAforo, validarPublicacion } from './publicacion';

const t = (local: string) => new Date(`${local}:00-05:00`);
const edicion = { fechaInicio: '2026-11-12', fechaFin: '2026-11-22' };

function candidata(p: Partial<FuncionAPublicar> = {}): FuncionAPublicar {
  return {
    id: 'f1',
    obraId: 'o1',
    obraTitulo: 'El Cura sin cabeza',
    obraImagenes: 1,
    obraEstado: 'disponible',
    sedeId: 'bolivar',
    sedeNombre: 'Teatro Bolívar',
    sedeActiva: true,
    sedeAforo: 400,
    montajeMin: 30,
    elencoId: 'cano',
    tipoAcceso: 'pagada',
    aforoHabilitado: 300,
    inicio: t('2026-11-13T20:00'),
    fin: t('2026-11-13T21:30'),
    continua: false,
    ...p,
  };
}

const codigos = (errores: { codigo: string }[]) => errores.map((e) => e.codigo).sort();

describe('validarPublicacion (FR-005, research R4)', () => {
  it('una edición con funciones válidas no tiene errores', () => {
    expect(validarPublicacion(edicion, [candidata(), candidata({ id: 'f2', sedeId: 'nacional', elencoId: 'otro' })], [])).toEqual([]);
  });

  it('US2-AS2: una función sin tipo de acceso bloquea la publicación y se lista el error', () => {
    const errores = validarPublicacion(edicion, [candidata({ tipoAcceso: null })], []);
    expect(errores).toEqual([
      { codigo: 'sin_tipo_acceso', funcionId: 'f1', mensaje: 'El Cura sin cabeza (13/11 20:00, Teatro Bolívar): falta el tipo de acceso.' },
    ]);
  });

  it('devuelve todos los errores, no solo el primero', () => {
    const errores = validarPublicacion(
      edicion,
      [
        candidata({ tipoAcceso: null }),
        candidata({ id: 'f2', obraId: 'o2', obraTitulo: 'Sin foto', obraImagenes: 0, sedeId: 'nacional', elencoId: 'otro' }),
        candidata({ id: 'f3', sedeActiva: false, sedeId: 'cerrada', elencoId: 'tercero' }),
      ],
      [],
    );
    expect(codigos(errores)).toEqual(['obra_sin_imagen', 'sede_inactiva', 'sin_tipo_acceso']);
  });

  it('una obra sin imagen se informa una sola vez aunque tenga varias funciones', () => {
    const errores = validarPublicacion(
      edicion,
      [candidata({ obraImagenes: 0 }), candidata({ id: 'f2', obraImagenes: 0, sedeId: 'nacional', inicio: t('2026-11-14T20:00'), fin: t('2026-11-14T21:30') })],
      [],
    );
    expect(errores).toEqual([{ codigo: 'obra_sin_imagen', obraId: 'o1', mensaje: 'La obra "El Cura sin cabeza" no tiene ninguna imagen.' }]);
  });

  it('las funciones con entradas necesitan aforo habilitado, y no más que la sede (FR-004)', () => {
    expect(codigos(validarPublicacion(edicion, [candidata({ aforoHabilitado: null })], []))).toEqual(['sin_aforo']);
    expect(codigos(validarPublicacion(edicion, [candidata({ aforoHabilitado: 500 })], []))).toEqual(['aforo_supera_sede']);
  });

  it('caso borde: una función de acceso libre en espacio público no necesita aforo', () => {
    const plaza = candidata({ sedeAforo: null, tipoAcceso: 'gratuita_libre', aforoHabilitado: null });
    expect(validarPublicacion(edicion, [plaza], [])).toEqual([]);
    expect(requiereAforo('gratuita_libre')).toBe(false);
    expect(requiereAforo('gratuita_reserva')).toBe(true);
  });

  it('una obra desistida no se publica (FR-007)', () => {
    expect(codigos(validarPublicacion(edicion, [candidata({ obraEstado: 'desistida' })], []))).toEqual(['obra_desistida']);
  });

  it('las fechas fuera de la edición bloquean', () => {
    expect(codigos(validarPublicacion(edicion, [candidata({ inicio: t('2026-11-25T20:00'), fin: t('2026-11-25T21:00') })], []))).toEqual(['fuera_de_fechas']);
  });

  it('los cruces con funciones ya publicadas o entre los propios borradores bloquean (SC-001)', () => {
    const publicada: FuncionAgenda = {
      id: 'p1', sedeId: 'bolivar', sedeNombre: 'Teatro Bolívar', montajeMin: 30, elencoId: 'x', obraTitulo: 'Bondi Beach',
      inicio: t('2026-11-13T18:00'), fin: t('2026-11-13T19:45'), continua: false, activa: true,
    };
    const conPublicada = validarPublicacion(edicion, [candidata()], [publicada]);
    expect(conPublicada).toEqual([expect.objectContaining({ codigo: 'cruce_sede', funcionId: 'f1' })]);
    expect(conPublicada[0]!.mensaje).toContain('Bondi Beach');

    const entreBorradores = validarPublicacion(edicion, [candidata(), candidata({ id: 'f2', sedeId: 'nacional' })], []);
    expect(entreBorradores).toEqual([expect.objectContaining({ codigo: 'cruce_elenco', funcionId: 'f2' })]);
  });
});
