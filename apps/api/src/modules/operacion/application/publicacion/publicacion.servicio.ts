import type { ContextoIdentidad } from '@fiavl/contracts';
import { ErrorConCodigo } from '../../../../common/http/problema-codigo.filter';
import { publicar } from '../../domain/ciclo-funcion';
import { type ErrorPublicacion, type FuncionAPublicar, validarPublicacion } from '../../domain/publicacion';
import { edicionCerrada, funcionPublicada, noEncontrado, versionObsoleta } from '../errores';
import { funcionProgramada, programacionPublicada } from '../eventos-salida';
import type {
  AuditoriaOperacion,
  EdicionDetalle,
  FuncionCompleta,
  FuncionVista,
  PublicadorOperacion,
  RelojOperacion,
  RepositorioOperacion,
} from '../puertos';

interface Peticion {
  actor: ContextoIdentidad;
  correlacionId: string;
}

export interface ValidacionPublicacion {
  valida: boolean;
  errores: ErrorPublicacion[];
}

const aPublicar = ({ funcion: f, obra, sede }: FuncionCompleta): FuncionAPublicar => ({
  id: f.id,
  obraId: obra.id,
  obraTitulo: obra.titulo,
  obraImagenes: obra.imagenes.length,
  obraEstado: obra.estado,
  sedeId: sede.id,
  sedeNombre: sede.nombre,
  sedeActiva: sede.activa,
  sedeAforo: sede.aforo,
  montajeMin: sede.montajeMin,
  elencoId: f.elencoId,
  tipoAcceso: f.tipoAcceso,
  aforoHabilitado: f.aforoHabilitado,
  inicio: f.inicio,
  fin: f.fin,
  continua: f.continua,
});

/** 422 con la misma forma que `ValidacionPublicacion` del OpenAPI (US2-AS2). */
const conErrores = (errores: ErrorPublicacion[]) =>
  new ErrorConCodigo(422, 'publicacion_invalida', `Hay ${errores.length} error(es) que impiden publicar.`, { valida: false, errores });

/**
 * Publicación de la programación (US2, FR-005, research R3/R4). Cambia el estado y publica los
 * eventos en la misma transacción (ADR-0003): Cartelera y Boletería los reciben o no pasa nada.
 */
export class PublicacionServicio {
  constructor(
    private readonly repo: RepositorioOperacion,
    private readonly publicador: PublicadorOperacion,
    private readonly auditoria: AuditoriaOperacion,
    private readonly reloj: RelojOperacion,
  ) {}

  /** US2-AS2: todos los errores de los borradores de la edición. */
  async validar(edicionId: string): Promise<ValidacionPublicacion> {
    const edicion = await this.edicion(edicionId);
    const borradores = await this.repo.funcionesCompletas(edicionId, { estados: ['borrador'] });
    const errores = validarPublicacion(edicion, borradores.map(aPublicar), await this.repo.agendaPublicada(edicionId));
    return { valida: errores.length === 0, errores };
  }

  /**
   * US2-AS1: todos los borradores pasan a programada; un `FuncionProgramada` por función y al final
   * `ProgramacionPublicada`. Si hay errores no se publica nada. Repetirla sin borradores no emite nada.
   */
  async publicarEdicion(edicionId: string, p: Peticion): Promise<{ funcionesPublicadas: number }> {
    return this.repo.enTransaccion(async () => {
      await this.repo.bloquearAgenda([`edicion:${edicionId}`]);
      const edicion = await this.edicion(edicionId);
      const borradores = await this.repo.funcionesCompletas(edicionId, { estados: ['borrador'] });
      if (edicion.estado === 'publicada' && borradores.length === 0) return { funcionesPublicadas: 0 };
      const errores = validarPublicacion(edicion, borradores.map(aPublicar), await this.repo.agendaPublicada(edicionId));
      if (errores.length > 0) throw conErrores(errores);

      const ahora = this.reloj();
      for (const b of borradores) await this.publicarUna(b, ahora, p);
      await this.repo.marcarEdicionPublicada(edicionId);
      const publicadas = await this.repo.funcionesCompletas(edicionId, { estados: ['programada', 'reprogramada'] });
      await this.publicador.publicar(programacionPublicada({ ...edicion, estado: 'publicada' }, publicadas.map((x) => x.funcion.id), p.correlacionId, ahora));
      await this.auditoria.registrar({
        accion: 'edicion.publicar',
        actorId: p.actor.cuentaId,
        rol: 'programador',
        entidad: 'edicion',
        entidadId: edicionId,
        anterior: { estado: edicion.estado },
        nuevo: { estado: 'publicada', funcionesPublicadas: borradores.map((b) => b.funcion.id) },
        correlacionId: p.correlacionId,
      });
      return { funcionesPublicadas: borradores.length };
    });
  }

  /** US2-AS3: una función nueva en una edición ya publicada, sin republicar toda la edición. */
  async publicarFuncion(funcionId: string, version: number, p: Peticion): Promise<FuncionVista> {
    const actual = await this.repo.funcion(funcionId);
    if (!actual) throw noEncontrado('La función');
    return this.repo.enTransaccion(async () => {
      await this.repo.bloquearAgenda([`edicion:${actual.edicionId}`]);
      const edicion = await this.edicion(actual.edicionId);
      if (edicion.estado !== 'publicada') {
        throw new ErrorConCodigo(409, 'edicion_sin_publicar', 'La edición aún no se publicó: publícala completa desde "Publicar".');
      }
      const [completa] = await this.repo.funcionesCompletas(actual.edicionId, { ids: [funcionId] });
      if (!completa) throw noEncontrado('La función');
      if (completa.funcion.version !== version) throw versionObsoleta(completa.funcion.version);
      if (completa.funcion.estado !== 'borrador') throw funcionPublicada();
      const errores = validarPublicacion(edicion, [aPublicar(completa)], await this.repo.agendaPublicada(actual.edicionId));
      if (errores.length > 0) throw conErrores(errores);
      return this.publicarUna(completa, this.reloj(), p);
    });
  }

  private async publicarUna(c: FuncionCompleta, ahora: Date, p: Peticion): Promise<FuncionVista> {
    const t = publicar(c.funcion, ahora);
    if (!t.ok) throw funcionPublicada();
    const nueva = await this.repo.marcarFuncionPublicada(c.funcion.id, c.funcion.version, t.version, t.publicadaEn);
    if (!nueva) throw versionObsoleta(null);
    await this.publicador.publicar(funcionProgramada({ ...c, funcion: nueva }, p.correlacionId, ahora));
    await this.auditoria.registrar({
      accion: 'funcion.publicar',
      actorId: p.actor.cuentaId,
      rol: 'programador',
      entidad: 'funcion',
      entidadId: c.funcion.id,
      anterior: { estado: c.funcion.estado, version: c.funcion.version },
      nuevo: { estado: nueva.estado, version: nueva.version },
      correlacionId: p.correlacionId,
    });
    return nueva;
  }

  private async edicion(edicionId: string): Promise<EdicionDetalle> {
    const edicion = await this.repo.edicionDetalle(edicionId);
    if (!edicion) throw noEncontrado('La edición');
    if (edicion.estado === 'cerrada') throw edicionCerrada();
    return edicion;
  }
}
