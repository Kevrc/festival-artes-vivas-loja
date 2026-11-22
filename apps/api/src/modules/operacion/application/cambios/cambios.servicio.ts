import type { ContextoIdentidad } from '@fiavl/contracts';
import { bloquesDe } from '../../domain/agenda';
import { cancelar, excesoDeAforo, reprogramar } from '../../domain/ciclo-funcion';
import { cambioRechazado, excesoAforo, fueraDeEdicion, noEncontrado, sinCambios, versionObsoleta } from '../errores';
import { aforoCambiado, funcionCancelada, funcionReprogramada } from '../eventos-salida';
import { guardarSinCruces } from '../funciones/agenda-segura';
import type {
  AuditoriaOperacion,
  CambioRegistro,
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

export interface EntradaReprogramacion {
  inicio?: Date;
  sedeId?: string;
  motivo: string;
  confirmarExceso: boolean;
}

/**
 * El `AforoCambiado` que sigue a una reprogramación se entrega unos segundos después: las colas no
 * garantizan orden entre tipos y Boletería descarta versiones viejas, así que primero debe aplicar
 * el `FuncionReprogramada` (versión n+1) y luego el aforo (n+2). Boletería lee el aforo solo de
 * `AforoCambiado` (spec 002); con él detecta el excedente y publica `AforoExcedido`.
 */
export const RETRASO_AFORO_SEGUNDOS = 15;

/** Reprogramar y cancelar funciones publicadas, siempre con motivo (US3, FR-006). */
export class CambiosServicio {
  constructor(
    private readonly repo: RepositorioOperacion,
    private readonly publicador: PublicadorOperacion,
    private readonly auditoria: AuditoriaOperacion,
    private readonly reloj: RelojOperacion,
  ) {}

  historial(funcionId: string): Promise<CambioRegistro[]> {
    return this.repo.cambios(funcionId);
  }

  /**
   * US3-AS1/AS2: cambia horario o sede. Conserva la duración guardada. Si la nueva sede tiene menos
   * aforo, el aforo habilitado baja al de la sede; si quedan más entradas activas que lugares,
   * responde 409 `exceso_aforo` hasta que se confirme (research R5).
   */
  async reprogramar(funcionId: string, version: number, e: EntradaReprogramacion, p: Peticion): Promise<FuncionVista> {
    const { completa, edicionCerrada } = await this.cargar(funcionId);
    const actual = completa.funcion;
    const ahora = this.reloj();
    const t = reprogramar(actual, e.motivo, { edicionCerrada, ahora });
    if (!t.ok) throw cambioRechazado(t.codigo);
    if (actual.version !== version) throw versionObsoleta(actual.version);

    const sede = e.sedeId && e.sedeId !== actual.sedeId ? await this.repo.sede(e.sedeId) : completa.sede;
    if (!sede) throw noEncontrado('La sede');
    if (sede.edicionId !== actual.edicionId || !sede.activa) throw fueraDeEdicion('La sede');
    const cambioSede = sede.id !== actual.sedeId;
    const inicio = e.inicio ?? actual.inicio;
    if (!cambioSede && inicio.getTime() === actual.inicio.getTime()) throw sinCambios();
    const fin = new Date(inicio.getTime() + (actual.fin.getTime() - actual.inicio.getTime()));

    const aforo = cambioSede && sede.aforo !== null && actual.aforoHabilitado !== null && actual.aforoHabilitado > sede.aforo ? sede.aforo : actual.aforoHabilitado;
    const cambioAforo = aforo !== actual.aforoHabilitado;
    const exceso = excesoDeAforo(actual.entradasActivas, aforo);
    if (exceso > 0 && !e.confirmarExceso) throw excesoAforo(exceso, aforo);

    const motivo = e.motivo.trim();
    const candidata = {
      id: actual.id, sedeId: sede.id, sedeNombre: sede.nombre, montajeMin: sede.montajeMin, elencoId: actual.elencoId,
      obraTitulo: completa.obra.titulo, inicio, fin, continua: actual.continua, activa: true,
    };
    return guardarSinCruces(this.repo, candidata, async () => {
      const nueva = await this.repo.aplicarCambio(actual.id, version, {
        datos: { inicio, fin, sedeId: sede.id, aforoHabilitado: aforo, estado: 'reprogramada' },
        version: t.version + (cambioAforo ? 1 : 0),
        bloques: bloquesDe({ inicio, fin, continua: actual.continua, montajeMin: sede.montajeMin }),
      });
      if (!nueva) throw versionObsoleta(null);
      const anterior = { inicio: actual.inicio, fin: actual.fin, sedeId: actual.sedeId, aforoHabilitado: actual.aforoHabilitado };
      const posterior = { inicio, fin, sedeId: sede.id, aforoHabilitado: aforo };
      await this.repo.registrarCambio({
        funcionId: actual.id,
        tipo: cambioSede ? 'cambio_sede' : 'reprogramacion',
        anterior: json(anterior),
        nuevo: json(posterior),
        motivo,
        excesoConfirmado: exceso > 0 ? exceso : null,
        autorId: p.actor.cuentaId,
      });
      await this.auditar('funcion.reprogramar', p, actual.id, anterior, { ...posterior, motivo, exceso });
      const reprogramada: FuncionCompleta = { funcion: { ...nueva, version: t.version }, obra: completa.obra, sede };
      await this.publicador.publicar(funcionReprogramada(reprogramada, actual, motivo, cambioSede, p.correlacionId, ahora));
      if (cambioAforo) {
        await this.publicador.publicar(aforoCambiado(actual.edicionId, actual.id, nueva.version, actual.aforoHabilitado, aforo, p.correlacionId, ahora), {
          retrasoSegundos: RETRASO_AFORO_SEGUNDOS,
        });
      }
      return nueva;
    });
  }

  /** US3-AS3: cancela con motivo; libera la sede y Boletería anula e inicia devoluciones. */
  async cancelar(funcionId: string, version: number, motivo: string, p: Peticion): Promise<FuncionVista> {
    const { completa, edicionCerrada } = await this.cargar(funcionId);
    const actual = completa.funcion;
    const ahora = this.reloj();
    const t = cancelar(actual, motivo, { edicionCerrada, ahora });
    if (!t.ok) throw cambioRechazado(t.codigo);
    if (actual.version !== version) throw versionObsoleta(actual.version);
    return this.repo.enTransaccion(async () => {
      const nueva = await this.repo.aplicarCambio(actual.id, version, { datos: { estado: 'cancelada' }, version: t.version, bloques: 'desactivar' });
      if (!nueva) throw versionObsoleta(null);
      await this.repo.registrarCambio({
        funcionId: actual.id,
        tipo: 'cancelacion',
        anterior: { estado: actual.estado },
        nuevo: { estado: 'cancelada' },
        motivo: motivo.trim(),
        excesoConfirmado: null,
        autorId: p.actor.cuentaId,
      });
      await this.auditar('funcion.cancelar', p, actual.id, { estado: actual.estado }, { estado: 'cancelada', motivo: motivo.trim(), entradasActivas: actual.entradasActivas });
      await this.publicador.publicar(funcionCancelada(actual.edicionId, actual.id, nueva.version, p.correlacionId, ahora));
      return nueva;
    });
  }

  private async cargar(funcionId: string) {
    const f = await this.repo.funcion(funcionId);
    if (!f) throw noEncontrado('La función');
    const [completa] = await this.repo.funcionesCompletas(f.edicionId, { ids: [funcionId] });
    const edicion = await this.repo.edicion(f.edicionId);
    if (!completa || !edicion) throw noEncontrado('La función');
    return { completa, edicionCerrada: edicion.estado === 'cerrada' };
  }

  private auditar(accion: string, p: Peticion, entidadId: string, anterior: unknown, nuevo: unknown) {
    return this.auditoria.registrar({ accion, actorId: p.actor.cuentaId, rol: 'programador', entidad: 'funcion', entidadId, anterior, nuevo, correlacionId: p.correlacionId });
  }
}

/** Fechas a ISO para guardar el historial en JSON. */
const json = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]));
