import { createHash } from 'node:crypto';
import type { ContextoIdentidad, RolPersonal } from '@fiavl/contracts';
import { exigirAlcance } from '../../../../common/identidad/requiere.guard';
import { ErrorConCodigo } from '../../../../common/http/problema-codigo.filter';
import { rangoDelDia } from '../../domain/agenda';
import { edicionCerrada, fueraDeEdicion, noEncontrado } from '../errores';
import type {
  AuditoriaOperacion,
  ConteoVista,
  IncidenciaVista,
  RelojOperacion,
  RepositorioIncidencias,
  RepositorioOperacion,
  TipoIncidencia,
} from '../puertos';

/** Roles que operan en sala: el jefe de sala dentro de su sede; el programador en todas (RN-009). */
const EN_SALA: RolPersonal[] = ['jefe_sala', 'programador'];
const SUPERVISION: RolPersonal[] = ['programador', 'direccion', 'administrador'];

/** Id estable a partir de `Idempotency-Key` y autor: repetir la petición no duplica la fila. */
export function idIdempotente(autorId: string, clave: string, ambito: string): string {
  const h = createHash('sha256').update(`${ambito}:${autorId}:${clave}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface EntradaIncidencia {
  sedeId: string;
  funcionId?: string;
  tipo: Exclude<TipoIncidencia, 'conflicto_ingreso' | 'desistimiento'>;
  descripcion: string;
  afectaPublico: boolean;
}

/**
 * Incidencias y conteos estimados (US4, FR-011, FR-012). Cada acción del personal queda en la
 * auditoría en la misma transacción. Las incidencias automáticas llegan por eventos.
 */
export class IncidenciasServicio {
  constructor(
    private readonly repo: RepositorioOperacion,
    private readonly incidencias: RepositorioIncidencias,
    private readonly auditoria: AuditoriaOperacion,
    private readonly reloj: RelojOperacion,
  ) {}

  /** US4-AS2: queda visible para Dirección; si afecta al público se ofrece reprogramar. */
  async registrar(ctx: ContextoIdentidad, edicionId: string, e: EntradaIncidencia, clave: string, correlacionId: string) {
    const sede = await this.repo.sede(e.sedeId);
    if (!sede) throw noEncontrado('La sede');
    if (sede.edicionId !== edicionId) throw fueraDeEdicion('La sede');
    exigirAlcance(ctx, EN_SALA, { tipo: 'sede', valor: sede.id });
    await this.exigirAbierta(edicionId);
    const funcion = e.funcionId ? await this.repo.funcion(e.funcionId) : null;
    if (e.funcionId && !funcion) throw noEncontrado('La función');
    if (funcion && funcion.sedeId !== sede.id) throw new ErrorConCodigo(400, 'fuera_de_edicion', 'La función no es de esa sede.');

    const id = idIdempotente(ctx.cuentaId, clave, 'incidencia');
    const r = await this.repo.enTransaccion(async () => {
      const r = await this.incidencias.crearIncidencia({
        id, edicionId, sedeId: sede.id, funcionId: funcion?.id ?? null, tipo: e.tipo, descripcion: e.descripcion.trim(), afectaPublico: e.afectaPublico,
        origen: 'manual', autorId: ctx.cuentaId, ocurridaEn: this.reloj(),
      });
      if (r.nueva) await this.auditoria.registrar({ accion: 'incidencia.registrada', actorId: ctx.cuentaId, rol: rolDe(ctx), entidad: 'incidencia', entidadId: id, nuevo: { ...e }, correlacionId });
      return r;
    });
    return { ...r.incidencia, ofrecerReprogramar: r.incidencia.afectaPublico && !!funcion && funcion.estado !== 'cancelada' && funcion.estado !== 'borrador' };
  }

  /**
   * US4-AS1: conteo estimado de público en funciones de acceso libre o en espacios públicos. El
   * vigente es el último; suma a la asistencia estimada del día (RN-004).
   */
  async registrarConteo(ctx: ContextoIdentidad, funcionId: string, cantidad: number, metodo: string, clave: string, correlacionId: string): Promise<ConteoVista> {
    const funcion = await this.repo.funcion(funcionId);
    if (!funcion) throw noEncontrado('La función');
    exigirAlcance(ctx, EN_SALA, { tipo: 'sede', valor: funcion.sedeId });
    await this.exigirAbierta(funcion.edicionId);
    const sede = await this.repo.sede(funcion.sedeId);
    const aplica = funcion.tipoAcceso === 'gratuita_libre' || sede?.tipo === 'espacio_publico' || sede?.tipo === 'recorrido';
    if (!aplica) throw new ErrorConCodigo(409, 'conteo_no_aplica', 'El conteo estimado es para funciones de acceso libre o en espacios públicos; las demás cuentan los ingresos validados.');
    if (funcion.estado === 'cancelada' || funcion.estado === 'borrador') throw new ErrorConCodigo(409, 'conteo_no_aplica', 'La función no se realizó.');

    const id = idIdempotente(ctx.cuentaId, clave, 'conteo');
    return this.repo.enTransaccion(async () => {
      const r = await this.incidencias.crearConteo({ id, funcionId, cantidad, metodo: metodo.trim(), autorId: ctx.cuentaId, registradoEn: this.reloj() });
      if (r.nuevo) await this.auditoria.registrar({ accion: 'conteo.registrado', actorId: ctx.cuentaId, rol: rolDe(ctx), entidad: 'funcion', entidadId: funcionId, nuevo: { cantidad, metodo }, correlacionId });
      return r.conteo;
    });
  }

  async atender(ctx: ContextoIdentidad, incidenciaId: string, correlacionId: string): Promise<IncidenciaVista> {
    const actual = await this.incidencias.incidencia(incidenciaId);
    if (!actual) throw noEncontrado('La incidencia');
    exigirAlcance(ctx, EN_SALA, { tipo: 'sede', valor: actual.sedeId });
    await this.exigirAbierta(actual.edicionId);
    if (actual.estado === 'atendida') return actual;
    return this.repo.enTransaccion(async () => {
      const r = (await this.incidencias.atender(incidenciaId))!;
      await this.auditoria.registrar({ accion: 'incidencia.atendida', actorId: ctx.cuentaId, rol: rolDe(ctx), entidad: 'incidencia', entidadId: incidenciaId, anterior: { estado: 'abierta' }, nuevo: { estado: 'atendida' }, correlacionId });
      return r;
    });
  }

  /** Supervisión ve todas; el jefe de sala, solo las de sus sedes. */
  async listar(ctx: ContextoIdentidad, edicionId: string, f: { sedeId?: string; fecha?: string; estado?: 'abierta' | 'atendida' }) {
    if (!(await this.repo.edicion(edicionId))) throw noEncontrado('La edición');
    const global = ctx.roles.some((r) => SUPERVISION.includes(r.rol));
    const propias = ctx.roles.filter((r) => r.rol === 'jefe_sala' && r.alcance?.tipo === 'sede').map((r) => r.alcance!.valor);
    const sedeIds = global ? (f.sedeId ? [f.sedeId] : undefined) : propias.filter((s) => !f.sedeId || s === f.sedeId);
    const dia = f.fecha ? rangoDelDia(f.fecha) : null;
    return this.incidencias.incidencias(edicionId, { sedeIds, estado: f.estado, ...(dia ? { desde: dia.desde, hasta: dia.hasta } : {}) });
  }

  private async exigirAbierta(edicionId: string) {
    const ed = await this.repo.edicion(edicionId);
    if (!ed) throw noEncontrado('La edición');
    if (ed.estado === 'cerrada') throw edicionCerrada();
  }
}

const rolDe = (ctx: ContextoIdentidad) => (ctx.roles.find((r) => EN_SALA.includes(r.rol))?.rol ?? null);
