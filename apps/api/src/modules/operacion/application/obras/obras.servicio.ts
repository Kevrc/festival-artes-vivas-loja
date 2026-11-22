import type { ContextoIdentidad } from '@fiavl/contracts';
import { type Conflicto, calcularFin, detectarConflictos } from '../../domain/agenda';
import { edicionCerrada, noEncontrado, versionObsoleta } from '../errores';
import type { AuditoriaOperacion, DatosObra, ElencoVista, FiltroObras, ObraVista, RepositorioOperacion } from '../puertos';

export interface EntradaObra extends DatosObra {
  elenco: Omit<ElencoVista, 'id' | 'ciudad'> & { id?: string; ciudad?: string | null };
}

interface Peticion {
  actor: ContextoIdentidad;
  correlacionId: string;
}

const DIA = 24 * 60 * 60_000;

/** Obras y elencos invitados (FR-007) y búsqueda de obras programables (US1-AS5). */
export class ObrasServicio {
  constructor(
    private readonly repo: RepositorioOperacion,
    private readonly auditoria: AuditoriaOperacion,
  ) {}

  buscar(edicionId: string, filtro: FiltroObras): Promise<ObraVista[]> {
    return this.repo.buscarObras(edicionId, filtro);
  }

  async crearInvitada(edicionId: string, e: EntradaObra, p: Peticion): Promise<ObraVista> {
    const edicion = await this.repo.edicion(edicionId);
    if (!edicion) throw noEncontrado('La edición');
    if (edicion.estado === 'cerrada') throw edicionCerrada();
    return this.repo.enTransaccion(async () => {
      const { elenco, ...datos } = e;
      const obra = await this.repo.crearObra(edicionId, datos, { ...elenco, ciudad: elenco.ciudad ?? null }, 'invitado');
      await this.auditar('obra.crear', p, obra.id, null, obra);
      return obra;
    });
  }

  /**
   * Caso borde: cambiar la duración no mueve funciones ya programadas. Se recalculan sus cruces
   * como si terminaran con la nueva duración y se devuelven para que el programador decida.
   */
  async actualizar(obraId: string, version: number, e: EntradaObra, p: Peticion): Promise<{ obra: ObraVista; conflictos: Conflicto[] }> {
    const actual = await this.repo.obra(obraId);
    if (!actual) throw noEncontrado('La obra');
    const edicion = await this.repo.edicion(actual.edicionId);
    if (edicion?.estado === 'cerrada') throw edicionCerrada();
    if (actual.version !== version) throw versionObsoleta(actual.version);
    const { elenco: _elenco, ...datos } = e;
    const obra = await this.repo.enTransaccion(async () => {
      const nueva = await this.repo.actualizarObra(obraId, version, datos);
      if (!nueva) throw versionObsoleta((await this.repo.obra(obraId))?.version ?? null);
      await this.auditar('obra.editar', p, obraId, actual, nueva);
      return nueva;
    });
    const conflictos = actual.duracionMin === obra.duracionMin ? [] : await this.conflictosConNuevaDuracion(obra);
    return { obra, conflictos };
  }

  private async conflictosConNuevaDuracion(obra: ObraVista): Promise<Conflicto[]> {
    const conflictos: Conflicto[] = [];
    for (const f of await this.repo.funcionesDeObra(obra.id)) {
      if (f.estado === 'cancelada' || f.continua) continue;
      const sede = await this.repo.sede(f.sedeId);
      if (!sede) continue;
      const fin = calcularFin(f.inicio, obra.duracionMin);
      const vecinas = await this.repo.agendaVecina({ sedeId: f.sedeId, elencoId: f.elencoId, desde: new Date(f.inicio.getTime() - DIA), hasta: new Date(fin.getTime() + DIA) });
      conflictos.push(
        ...detectarConflictos(
          { id: f.id, sedeId: f.sedeId, sedeNombre: sede.nombre, montajeMin: sede.montajeMin, elencoId: f.elencoId, obraTitulo: obra.titulo, inicio: f.inicio, fin, continua: false, activa: true },
          vecinas,
        ),
      );
    }
    return conflictos;
  }

  private auditar(accion: string, p: Peticion, entidadId: string, anterior: unknown, nuevo: unknown) {
    return this.auditoria.registrar({ accion, actorId: p.actor.cuentaId, rol: 'programador', entidad: 'obra', entidadId, anterior, nuevo, correlacionId: p.correlacionId });
  }
}
