import type { Conflicto } from '../domain/agenda';
import { ErrorConCodigo } from '../../../common/http/problema-codigo.filter';

/** Errores de negocio de Operación con el `codigo` del OpenAPI (contracts/api-operacion.openapi.yaml). */
export const noEncontrado = (que: string) => new ErrorConCodigo(404, 'no_encontrado', `${que} no existe`);
export const versionObsoleta = (vigente: number | null) =>
  new ErrorConCodigo(412, 'version_obsoleta', 'Otra persona modificó este recurso. Recarga y vuelve a intentarlo.', vigente === null ? {} : { version: vigente });
export const edicionCerrada = () => new ErrorConCodigo(409, 'edicion_cerrada', 'La edición está cerrada: sus datos son de solo lectura (RN-007).');
export const obraDesistida = () => new ErrorConCodigo(409, 'obra_desistida', 'La obra fue desistida y no se puede programar (FR-007).');
export const aforoSuperaSede = (aforoSede: number) =>
  new ErrorConCodigo(409, 'aforo_supera_sede', `El aforo habilitado no puede superar el aforo de la sede (${aforoSede}) (FR-004).`, { aforoSede });
export const finMenor = () => new ErrorConCodigo(400, 'fin_menor', 'El fin solo puede alargarse respecto a la duración de la obra (RN-002).');
export const funcionPublicada = () =>
  new ErrorConCodigo(409, 'funcion_publicada', 'La función ya se publicó: usa reprogramar o cancelar, con motivo.');
export const fueraDeEdicion = (que: string) => new ErrorConCodigo(400, 'fuera_de_edicion', `${que} no pertenece a esta edición.`);

const aJson = (c: Conflicto) => ({
  tipo: c.tipo,
  funcionId: c.funcionId,
  obraTitulo: c.obraTitulo,
  sedeNombre: c.sedeNombre,
  inicio: c.inicio.toISOString(),
  fin: c.fin.toISOString(),
  libreDesde: c.libreDesde.toISOString(),
});

/** 409 ConflictoAgenda con la lista de funciones que chocan (US1-AS2). */
export function conflictoAgenda(conflictos: Conflicto[]): ErrorConCodigo {
  if (conflictos.length === 0) {
    return new ErrorConCodigo(409, 'cruce_sede', 'La agenda cambió mientras se guardaba. Recarga la grilla y vuelve a intentarlo.', { conflictos: [] });
  }
  const deSede = conflictos.some((c) => c.tipo === 'sede');
  const primera = conflictos[0];
  const detalle = deSede
    ? `Se cruza en la sede con "${primera?.obraTitulo}".`
    : `El elenco ya actúa a esa hora en "${primera?.obraTitulo}" (${primera?.sedeNombre}).`;
  return new ErrorConCodigo(409, deSede ? 'cruce_sede' : 'cruce_elenco', detalle, { conflictos: conflictos.map(aJson) });
}
