import { randomUUID } from 'node:crypto';
import type { ContextoIdentidad } from '@fiavl/contracts';
import { ErrorConCodigo } from '../../../../common/http/problema-codigo.filter';
import { type DatosSede, type ErrorEdicion, type ErrorSede, advertenciasEdicion, copiarSedes, parametrosDesde, validarEdicion, validarSede } from '../../domain/edicion';
import { aforoSuperaSede, edicionCerrada, noEncontrado, versionObsoleta } from '../errores';
import { programacionPublicada } from '../eventos-salida';
import type {
  AuditoriaOperacion,
  EdicionDetalle,
  EdicionGuardar,
  PublicadorOperacion,
  RelojOperacion,
  RepositorioMaestros,
  RepositorioOperacion,
  SedeVista,
} from '../puertos';

const MENSAJE_EDICION: Record<ErrorEdicion, string> = {
  fechas_invertidas: 'La fecha de fin no puede ser anterior a la de inicio.',
  precio_invalido: 'El precio de la entrada debe ser un número entero de centavos, cero o mayor.',
  limite_invalido: 'Los límites de entradas por persona deben ser al menos 1.',
};
const MENSAJE_SEDE: Record<ErrorSede, string> = {
  aforo_requerido: 'El aforo es obligatorio salvo en espacios públicos y recorridos.',
  recorrido_requerido: 'Un recorrido necesita al menos dos puntos de paso.',
  montaje_invalido: 'El tiempo de montaje debe ser un número entero de minutos, cero o mayor.',
  coordenadas_invalidas: 'Las coordenadas no son válidas.',
};

export interface EntradaEdicion extends Partial<Pick<EdicionGuardar, 'precioCentavos' | 'maxPagadasPersona' | 'maxReservasPersona'>> {
  numero: string;
  anio: number;
  fechaInicio: string;
  fechaFin: string;
  paisInvitado?: string | null;
  aPartirDe?: string;
}

type Peticion = { actor: ContextoIdentidad; correlacionId: string };

/**
 * Ediciones, sedes y parámetros (US6, FR-001, FR-012). Solo administración. Cada acción queda en
 * la auditoría en la misma transacción; una edición cerrada es de solo lectura (RN-007).
 */
export class MaestrosServicio {
  constructor(
    private readonly repo: RepositorioOperacion,
    private readonly maestros: RepositorioMaestros,
    private readonly publicador: PublicadorOperacion,
    private readonly auditoria: AuditoriaOperacion,
    private readonly reloj: RelojOperacion,
  ) {}

  async edicion(id: string): Promise<EdicionDetalle> {
    const e = await this.repo.edicionDetalle(id);
    if (!e) throw noEncontrado('La edición');
    return e;
  }

  /** US6-AS1/AS2: copia sedes y parámetros de `aPartirDe`, nunca funciones; fuera de noviembre advierte. */
  async crearEdicion(entrada: EntradaEdicion, p: Peticion): Promise<{ edicion: EdicionDetalle; advertencias: string[] }> {
    const base = entrada.aPartirDe ? await this.edicion(entrada.aPartirDe) : null;
    const parametros = base
      ? parametrosDesde(base, entrada)
      : { precioCentavos: requerido(entrada.precioCentavos), maxPagadasPersona: requerido(entrada.maxPagadasPersona), maxReservasPersona: requerido(entrada.maxReservasPersona) };
    const datos: EdicionGuardar = {
      numero: entrada.numero.trim(), anio: entrada.anio, fechaInicio: entrada.fechaInicio, fechaFin: entrada.fechaFin,
      paisInvitado: entrada.paisInvitado === undefined ? (base?.paisInvitado ?? null) : entrada.paisInvitado, ...parametros,
    };
    this.validarEdicion(datos);
    if (await this.maestros.anioOcupado(datos.anio)) throw new ErrorConCodigo(409, 'anio_ocupado', `Ya existe la edición ${datos.anio}.`);
    const id = randomUUID();
    await this.repo.enTransaccion(async () => {
      await this.maestros.crearEdicion(id, datos, base?.id ?? null);
      const sedes = base ? copiarSedes((await this.repo.sedesDeEdicion(base.id, true)).map(aDatos), randomUUID) : [];
      for (const s of sedes) await this.maestros.crearSede(s.id, id, s, s.sedeOrigenId);
      await this.auditoria.registrar({ accion: 'edicion.creada', actorId: p.actor.cuentaId, rol: 'administrador', entidad: 'edicion', entidadId: id, nuevo: { ...datos, aPartirDe: base?.id ?? null, sedesCopiadas: sedes.length }, correlacionId: p.correlacionId });
    });
    return { edicion: await this.edicion(id), advertencias: advertenciasEdicion(datos) };
  }

  /**
   * Cambia parámetros. RN-006: Boletería congela el importe de cada pedido, así que el precio nuevo
   * rige solo para pedidos futuros; si la edición ya está publicada se vuelve a anunciar.
   */
  async actualizarEdicion(id: string, version: number, entrada: EntradaEdicion, p: Peticion): Promise<{ edicion: EdicionDetalle; advertencias: string[] }> {
    const actual = await this.edicion(id);
    if (actual.estado === 'cerrada') throw edicionCerrada();
    const datos: EdicionGuardar = {
      numero: entrada.numero.trim(), anio: entrada.anio, fechaInicio: entrada.fechaInicio, fechaFin: entrada.fechaFin, paisInvitado: entrada.paisInvitado ?? null,
      precioCentavos: requerido(entrada.precioCentavos), maxPagadasPersona: requerido(entrada.maxPagadasPersona), maxReservasPersona: requerido(entrada.maxReservasPersona),
    };
    this.validarEdicion(datos);
    if (await this.maestros.anioOcupado(datos.anio, id)) throw new ErrorConCodigo(409, 'anio_ocupado', `Ya existe la edición ${datos.anio}.`);
    await this.repo.enTransaccion(async () => {
      if (!(await this.maestros.actualizarEdicion(id, version, datos))) throw versionObsoleta(actual.version);
      await this.auditoria.registrar({ accion: 'edicion.actualizada', actorId: p.actor.cuentaId, rol: 'administrador', entidad: 'edicion', entidadId: id, anterior: sinMeta(actual), nuevo: datos, correlacionId: p.correlacionId });
      if (actual.estado === 'publicada') {
        const publicadas = await this.repo.funcionesCompletas(id, { estados: ['programada', 'reprogramada'] });
        await this.publicador.publicar(programacionPublicada({ ...actual, ...datos }, publicadas.map((f) => f.funcion.id), p.correlacionId, this.reloj()));
      }
    });
    return { edicion: await this.edicion(id), advertencias: advertenciasEdicion(datos) };
  }

  async crearSede(edicionId: string, s: DatosSede, p: Peticion): Promise<SedeVista> {
    const ed = await this.edicion(edicionId);
    if (ed.estado === 'cerrada') throw edicionCerrada();
    this.validarSede(s);
    if (await this.maestros.nombreOcupado(edicionId, s.nombre)) throw new ErrorConCodigo(409, 'sede_duplicada', 'Ya hay una sede con ese nombre en la edición.');
    const id = randomUUID();
    await this.repo.enTransaccion(async () => {
      await this.maestros.crearSede(id, edicionId, s, null);
      await this.auditoria.registrar({ accion: 'sede.creada', actorId: p.actor.cuentaId, rol: 'administrador', entidad: 'sede', entidadId: id, nuevo: s, correlacionId: p.correlacionId });
    });
    return (await this.repo.sede(id))!;
  }

  /** US6-AS3: solo se desactiva sin funciones futuras; el aforo no puede quedar por debajo del de sus funciones. */
  async actualizarSede(sedeId: string, version: number, s: DatosSede, p: Peticion): Promise<SedeVista> {
    const actual = await this.repo.sede(sedeId);
    if (!actual) throw noEncontrado('La sede');
    const ed = await this.edicion(actual.edicionId);
    if (ed.estado === 'cerrada') throw edicionCerrada();
    this.validarSede(s);
    if (await this.maestros.nombreOcupado(actual.edicionId, s.nombre, sedeId)) throw new ErrorConCodigo(409, 'sede_duplicada', 'Ya hay una sede con ese nombre en la edición.');
    const uso = await this.maestros.usoDeSede(sedeId, this.reloj());
    if (actual.activa && !s.activa && uso.futuras > 0) {
      throw new ErrorConCodigo(409, 'sede_con_funciones', `La sede tiene ${uso.futuras} función(es) por realizarse: reprográmalas o cancélalas antes de desactivarla.`, { funcionesFuturas: uso.futuras });
    }
    if (s.aforo !== null && uso.aforoMaximo !== null && uso.aforoMaximo > s.aforo) throw aforoSuperaSede(s.aforo);
    await this.repo.enTransaccion(async () => {
      if (!(await this.maestros.actualizarSede(sedeId, version, s))) throw versionObsoleta(actual.version);
      await this.auditoria.registrar({ accion: s.activa === actual.activa ? 'sede.actualizada' : s.activa ? 'sede.activada' : 'sede.desactivada', actorId: p.actor.cuentaId, rol: 'administrador', entidad: 'sede', entidadId: sedeId, anterior: aDatos(actual), nuevo: s, correlacionId: p.correlacionId });
    });
    return (await this.repo.sede(sedeId))!;
  }

  /** US6-AS3: una sede con funciones (aunque estén canceladas) no se elimina; solo se desactiva. */
  async eliminarSede(sedeId: string, p: Peticion): Promise<void> {
    const actual = await this.repo.sede(sedeId);
    if (!actual) throw noEncontrado('La sede');
    if ((await this.edicion(actual.edicionId)).estado === 'cerrada') throw edicionCerrada();
    const uso = await this.maestros.usoDeSede(sedeId, this.reloj());
    if (uso.total > 0) throw new ErrorConCodigo(409, 'sede_con_funciones', 'La sede tiene funciones o registros: no se puede eliminar, solo desactivar.');
    await this.repo.enTransaccion(async () => {
      await this.maestros.eliminarSede(sedeId);
      await this.auditoria.registrar({ accion: 'sede.eliminada', actorId: p.actor.cuentaId, rol: 'administrador', entidad: 'sede', entidadId: sedeId, anterior: aDatos(actual), correlacionId: p.correlacionId });
    });
  }

  private validarEdicion(e: EdicionGuardar) {
    const [primero] = validarEdicion(e);
    if (primero) throw new ErrorConCodigo(400, primero, MENSAJE_EDICION[primero]);
  }

  private validarSede(s: DatosSede) {
    const [primero] = validarSede(s);
    if (primero) throw new ErrorConCodigo(400, primero, MENSAJE_SEDE[primero]);
  }
}

function requerido(n: number | undefined): number {
  if (n === undefined) throw new ErrorConCodigo(400, 'parametros_requeridos', 'Indica el precio y los límites de entradas por persona, o crea la edición a partir de otra.');
  return n;
}

const sinMeta = ({ version: _v, estado: _e, ...resto }: EdicionDetalle) => resto;

/** SedeVista → los datos editables del dominio. */
function aDatos(s: SedeVista): DatosSede & { id: string } {
  return {
    id: s.id,
    nombre: s.nombre,
    tipo: s.tipo,
    direccion: s.direccion,
    lat: s.lat,
    lng: s.lng,
    recorrido: Array.isArray(s.recorrido) ? (s.recorrido as DatosSede['recorrido']) : null,
    aforo: s.aforo,
    accesibilidad: s.accesibilidad as DatosSede['accesibilidad'],
    montajeMin: s.montajeMin,
    horarioTaquilla: typeof s.horarioTaquilla === 'string' ? s.horarioTaquilla : null,
    activa: s.activa,
  };
}
