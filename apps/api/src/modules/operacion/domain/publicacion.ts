import { type FuncionAgenda, detectarConflictos, diaFestival } from './agenda';
import type { EstadoObra, TipoAccesoFuncion } from './tipos';

/**
 * Validación previa a la publicación (FR-005, US2-AS2, research R4). Dominio puro: devuelve todos
 * los errores, no solo el primero; la publicación se bloquea si la lista no está vacía.
 */
export interface FuncionAPublicar {
  id: string;
  obraId: string;
  obraTitulo: string;
  obraImagenes: number;
  obraEstado: EstadoObra;
  sedeId: string;
  sedeNombre: string;
  sedeActiva: boolean;
  sedeAforo: number | null;
  montajeMin: number;
  elencoId: string;
  tipoAcceso: TipoAccesoFuncion | null;
  aforoHabilitado: number | null;
  inicio: Date;
  fin: Date;
  continua: boolean;
}

export type CodigoErrorPublicacion =
  | 'sin_tipo_acceso'
  | 'sin_aforo'
  | 'aforo_supera_sede'
  | 'sede_inactiva'
  | 'obra_sin_imagen'
  | 'obra_desistida'
  | 'fuera_de_fechas'
  | 'cruce_sede'
  | 'cruce_elenco';

export interface ErrorPublicacion {
  codigo: CodigoErrorPublicacion;
  mensaje: string;
  funcionId?: string;
  obraId?: string;
}

/** Las funciones con entradas o reservas pasan por Boletería y necesitan aforo; el acceso libre no. */
export const requiereAforo = (tipo: TipoAccesoFuncion): boolean => tipo !== 'gratuita_libre';

const DESFASE_LOJA = -5 * 60 * 60_000;
function cuando(f: FuncionAPublicar): string {
  const local = new Date(f.inicio.getTime() + DESFASE_LOJA).toISOString();
  return `${local.slice(8, 10)}/${local.slice(5, 7)} ${local.slice(11, 16)}`;
}

const aAgenda = (f: FuncionAPublicar): FuncionAgenda => ({
  id: f.id,
  sedeId: f.sedeId,
  sedeNombre: f.sedeNombre,
  montajeMin: f.montajeMin,
  elencoId: f.elencoId,
  obraTitulo: f.obraTitulo,
  inicio: f.inicio,
  fin: f.fin,
  continua: f.continua,
  activa: true,
});

/**
 * @param publicadas funciones ya publicadas y activas de la edición (para los cruces).
 * Los cruces entre borradores se informan una vez, en el que aparece después.
 */
export function validarPublicacion(
  edicion: { fechaInicio: string; fechaFin: string },
  candidatas: readonly FuncionAPublicar[],
  publicadas: readonly FuncionAgenda[],
): ErrorPublicacion[] {
  const errores: ErrorPublicacion[] = [];
  const obrasSinImagen = new Set<string>();
  const vistas: FuncionAgenda[] = [...publicadas];

  for (const f of candidatas) {
    const de = `${f.obraTitulo} (${cuando(f)}, ${f.sedeNombre})`;
    const error = (codigo: CodigoErrorPublicacion, texto: string) => errores.push({ codigo, funcionId: f.id, mensaje: `${de}: ${texto}` });

    if (!f.sedeActiva) error('sede_inactiva', 'la sede está desactivada; elige otra.');
    if (f.tipoAcceso === null) error('sin_tipo_acceso', 'falta el tipo de acceso.');
    else if (requiereAforo(f.tipoAcceso) && f.aforoHabilitado === null) error('sin_aforo', 'falta el aforo habilitado.');
    if (f.aforoHabilitado !== null && f.sedeAforo !== null && f.aforoHabilitado > f.sedeAforo) {
      error('aforo_supera_sede', `el aforo habilitado (${f.aforoHabilitado}) supera el de la sede (${f.sedeAforo}).`);
    }
    if (f.obraEstado === 'desistida') error('obra_desistida', 'la obra fue desistida; cancela o reemplaza la función.');
    const desde = diaFestival(f.inicio);
    const hasta = diaFestival(f.continua ? f.fin : f.inicio);
    if (desde < edicion.fechaInicio || hasta > edicion.fechaFin) {
      error('fuera_de_fechas', `está fuera de las fechas de la edición (${edicion.fechaInicio} a ${edicion.fechaFin}).`);
    }
    if (f.obraImagenes === 0 && !obrasSinImagen.has(f.obraId)) {
      obrasSinImagen.add(f.obraId);
      errores.push({ codigo: 'obra_sin_imagen', obraId: f.obraId, mensaje: `La obra "${f.obraTitulo}" no tiene ninguna imagen.` });
    }

    const propia = aAgenda(f);
    for (const c of detectarConflictos(propia, vistas)) {
      error(c.tipo === 'sede' ? 'cruce_sede' : 'cruce_elenco', `se cruza con "${c.obraTitulo}" en ${c.sedeNombre}.`);
    }
    vistas.push(propia);
  }
  return errores;
}
