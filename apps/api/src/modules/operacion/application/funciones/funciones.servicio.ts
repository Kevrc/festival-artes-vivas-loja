import { randomUUID } from 'node:crypto';
import type { ContextoIdentidad } from '@fiavl/contracts';
import { type FuncionAgenda, bloquesDe, calcularFin, validarFinPedido } from '../../domain/agenda';
import { excesoDeAforo } from '../../domain/ciclo-funcion';
import type { PublicoFuncion, TipoAccesoFuncion } from '../../domain/tipos';
import { RETRASO_AFORO_SEGUNDOS } from '../cambios/cambios.servicio';
import {
  aforoSuperaSede,
  cambioRechazado,
  edicionCerrada,
  excesoAforo,
  finMenor,
  fueraDeEdicion,
  funcionPublicada,
  noEncontrado,
  obraDesistida,
  tipoAccesoRequerido,
  usarReprogramacion,
  versionObsoleta,
} from '../errores';
import { aforoCambiado, funcionActualizada } from '../eventos-salida';
import type {
  AuditoriaOperacion,
  DatosFuncion,
  FuncionVista,
  ObraVista,
  PublicadorOperacion,
  RelojOperacion,
  RepositorioOperacion,
  SedeVista,
} from '../puertos';
import { guardarSinCruces } from './agenda-segura';

export interface EntradaFuncion {
  obraId: string;
  sedeId: string;
  inicio: Date;
  continua: boolean;
  /** Días de una actividad continua (consecutivos): se usa el primero y el último. */
  diasContinua?: string[];
  /** Puede faltar en un borrador; se exige al publicar (US2-AS2). */
  tipoAcceso: TipoAccesoFuncion | null;
  publico: PublicoFuncion;
  aforoHabilitado: number | null;
}

export interface EdicionFuncion {
  obraId?: string;
  sedeId?: string;
  inicio?: Date;
  fin?: Date;
  tipoAcceso?: TipoAccesoFuncion | null;
  publico?: PublicoFuncion;
  aforoHabilitado?: number | null;
  /** Bajar el aforo por debajo de las entradas activas exige confirmarlo (US3-AS2). */
  confirmarExceso?: boolean;
}

interface Peticion {
  actor: ContextoIdentidad;
  correlacionId: string;
}

const DIA = 24 * 60 * 60_000;

/**
 * Crear, editar y eliminar funciones (US1, FR-001–FR-004, FR-013). Un borrador se edita en todo;
 * una función publicada solo en público, tipo de acceso, aforo y fin (solo hacia más tiempo), y
 * emite `FuncionActualizada` o `AforoCambiado` (research R3). El horario y la sede de una
 * publicada se cambian con reprogramación (US3).
 */
export class FuncionesServicio {
  constructor(
    private readonly repo: RepositorioOperacion,
    private readonly auditoria: AuditoriaOperacion,
    private readonly publicador: PublicadorOperacion,
    private readonly reloj: RelojOperacion,
  ) {}

  async crear(edicionId: string, e: EntradaFuncion, p: Peticion): Promise<FuncionVista> {
    await this.exigirEdicionAbierta(edicionId);
    const { obra, sede } = await this.obraYSede(edicionId, e.obraId, e.sedeId);
    const fin = this.finDe(e.inicio, obra.duracionMin, e.continua ? e.diasContinua : undefined);
    const datos: DatosFuncion = {
      obraId: obra.id,
      sedeId: sede.id,
      elencoId: obra.elenco.id,
      inicio: e.inicio,
      fin,
      continua: e.continua,
      tipoAcceso: e.tipoAcceso,
      publico: e.publico,
      aforoHabilitado: e.aforoHabilitado,
    };
    this.validarAforo(datos.aforoHabilitado, sede);
    const id = randomUUID();
    return guardarSinCruces(this.repo, candidata(id, datos, sede, obra), async () => {
      const creada = await this.repo.crearFuncion(id, edicionId, datos, bloquesDe({ ...datos, montajeMin: sede.montajeMin }), p.actor.cuentaId);
      await this.auditar('funcion.crear', p, creada.id, null, creada);
      return creada;
    });
  }

  async editar(funcionId: string, version: number, cambios: EdicionFuncion, p: Peticion): Promise<FuncionVista> {
    const actual = await this.repo.funcion(funcionId);
    if (!actual) throw noEncontrado('La función');
    await this.exigirEdicionAbierta(actual.edicionId);
    if (actual.version !== version) throw versionObsoleta(actual.version);
    if (actual.estado !== 'borrador') return this.editarPublicada(actual, version, cambios, p);

    const { obra, sede } = await this.obraYSede(actual.edicionId, cambios.obraId ?? actual.obraId, cambios.sedeId ?? actual.sedeId);
    const inicio = cambios.inicio ?? actual.inicio;
    const recalcular = cambios.inicio !== undefined || cambios.obraId !== undefined;
    // Sin cambios de horario ni de obra se conserva el fin guardado (también el de una actividad continua).
    const fin = !recalcular && !cambios.fin ? actual.fin : validarFin(calcularFin(inicio, obra.duracionMin), cambios.fin);
    const datos: DatosFuncion = {
      obraId: obra.id,
      sedeId: sede.id,
      elencoId: obra.elenco.id,
      inicio,
      fin,
      continua: actual.continua,
      tipoAcceso: cambios.tipoAcceso !== undefined ? cambios.tipoAcceso : actual.tipoAcceso,
      publico: cambios.publico ?? actual.publico,
      aforoHabilitado: cambios.aforoHabilitado !== undefined ? cambios.aforoHabilitado : actual.aforoHabilitado,
    };
    this.validarAforo(datos.aforoHabilitado, sede);
    return guardarSinCruces(this.repo, candidata(funcionId, datos, sede, obra), async () => {
      const nueva = await this.repo.actualizarFuncion(funcionId, version, datos, bloquesDe({ ...datos, montajeMin: sede.montajeMin }));
      if (!nueva) throw versionObsoleta((await this.repo.funcion(funcionId))?.version ?? null);
      await this.auditar('funcion.editar', p, funcionId, actual, nueva);
      return nueva;
    });
  }

  async eliminarBorrador(funcionId: string, version: number, p: Peticion): Promise<void> {
    const actual = await this.repo.funcion(funcionId);
    if (!actual) throw noEncontrado('La función');
    await this.exigirEdicionAbierta(actual.edicionId);
    if (actual.estado !== 'borrador') throw funcionPublicada();
    await this.repo.enTransaccion(async () => {
      if (!(await this.repo.eliminarFuncion(funcionId, version))) throw versionObsoleta(actual.version);
      await this.auditar('funcion.eliminar', p, funcionId, actual, null);
    });
  }

  /**
   * Función ya publicada: cambia datos sin motivo. Solo aforo ⇒ `AforoCambiado`; otros campos ⇒
   * `FuncionActualizada` (lleva también el aforo) y, si el aforo cambió, `AforoCambiado` diferido
   * para que Boletería calcule el excedente (versión n+1 y n+2).
   */
  private async editarPublicada(actual: FuncionVista, version: number, c: EdicionFuncion, p: Peticion): Promise<FuncionVista> {
    const ahora = this.reloj();
    if (actual.estado === 'cancelada') throw cambioRechazado('funcion_cancelada');
    if (ahora.getTime() >= actual.fin.getTime()) throw cambioRechazado('funcion_finalizada');
    const mueve =
      (c.obraId !== undefined && c.obraId !== actual.obraId) ||
      (c.sedeId !== undefined && c.sedeId !== actual.sedeId) ||
      (c.inicio !== undefined && c.inicio.getTime() !== actual.inicio.getTime());
    if (mueve) throw usarReprogramacion();
    if (c.tipoAcceso === null) throw tipoAccesoRequerido();

    const [completa] = await this.repo.funcionesCompletas(actual.edicionId, { ids: [actual.id] });
    if (!completa) throw noEncontrado('La función');
    const fin = c.fin ? validarFin(actual.fin, c.fin) : actual.fin;
    const aforo = c.aforoHabilitado !== undefined ? c.aforoHabilitado : actual.aforoHabilitado;
    this.validarAforo(aforo, completa.sede);
    const datos = {
      fin,
      tipoAcceso: c.tipoAcceso ?? actual.tipoAcceso,
      publico: c.publico ?? actual.publico,
      aforoHabilitado: aforo,
    };
    const cambioAforo = aforo !== actual.aforoHabilitado;
    const cambioOtros = fin.getTime() !== actual.fin.getTime() || datos.tipoAcceso !== actual.tipoAcceso || datos.publico !== actual.publico;
    if (!cambioAforo && !cambioOtros) return actual;
    const exceso = cambioAforo ? excesoDeAforo(actual.entradasActivas, aforo) : 0;
    if (exceso > 0 && !c.confirmarExceso) throw excesoAforo(exceso, aforo);

    const versionNueva = version + (cambioOtros ? 1 : 0) + (cambioAforo ? 1 : 0);
    const guardar = async () => {
      const nueva = await this.repo.aplicarCambio(actual.id, version, {
        datos,
        version: versionNueva,
        ...(fin.getTime() !== actual.fin.getTime() ? { bloques: bloquesDe({ inicio: actual.inicio, fin, continua: actual.continua, montajeMin: completa.sede.montajeMin }) } : {}),
      });
      if (!nueva) throw versionObsoleta(null);
      const anterior = { fin: actual.fin.toISOString(), tipoAcceso: actual.tipoAcceso, publico: actual.publico, aforoHabilitado: actual.aforoHabilitado };
      const posterior = { fin: fin.toISOString(), tipoAcceso: datos.tipoAcceso, publico: datos.publico, aforoHabilitado: aforo };
      await this.repo.registrarCambio({
        funcionId: actual.id,
        tipo: cambioOtros ? 'edicion' : 'cambio_aforo',
        anterior,
        nuevo: posterior,
        motivo: null,
        excesoConfirmado: exceso > 0 ? exceso : null,
        autorId: p.actor.cuentaId,
      });
      await this.auditar('funcion.editar_publicada', p, actual.id, anterior, posterior);
      if (cambioOtros) {
        await this.publicador.publicar(funcionActualizada({ ...completa, funcion: { ...nueva, version: version + 1 } }, p.correlacionId, ahora));
      }
      if (cambioAforo) {
        await this.publicador.publicar(
          aforoCambiado(actual.edicionId, actual.id, versionNueva, actual.aforoHabilitado, aforo, p.correlacionId, ahora),
          cambioOtros ? { retrasoSegundos: RETRASO_AFORO_SEGUNDOS } : {},
        );
      }
      return nueva;
    };
    // Alargar el fin puede cruzarse con la siguiente función: misma protección que al crear.
    if (fin.getTime() === actual.fin.getTime()) return this.repo.enTransaccion(guardar);
    return guardarSinCruces(this.repo, { ...candidata(actual.id, { ...actual, fin }, completa.sede, completa.obra) }, guardar);
  }

  private async exigirEdicionAbierta(edicionId: string) {
    const edicion = await this.repo.edicion(edicionId);
    if (!edicion) throw noEncontrado('La edición');
    if (edicion.estado === 'cerrada') throw edicionCerrada();
  }

  private async obraYSede(edicionId: string, obraId: string, sedeId: string) {
    const [obra, sede] = await Promise.all([this.repo.obra(obraId), this.repo.sede(sedeId)]);
    if (!obra) throw noEncontrado('La obra');
    if (!sede) throw noEncontrado('La sede');
    if (obra.edicionId !== edicionId) throw fueraDeEdicion('La obra');
    if (sede.edicionId !== edicionId) throw fueraDeEdicion('La sede');
    if (obra.estado === 'desistida') throw obraDesistida();
    if (!sede.activa) throw fueraDeEdicion('La sede (desactivada)');
    return { obra, sede };
  }

  /** FR-004: aforo habilitado ≤ aforo de la sede (espacios públicos sin aforo no tienen tope). */
  private validarAforo(aforoHabilitado: number | null, sede: SedeVista) {
    if (aforoHabilitado !== null && sede.aforo !== null && aforoHabilitado > sede.aforo) throw aforoSuperaSede(sede.aforo);
  }

  private finDe(inicio: Date, duracionMin: number, diasContinua?: string[]): Date {
    const finPrimerDia = calcularFin(inicio, duracionMin);
    if (!diasContinua || diasContinua.length === 0) return finPrimerDia;
    const dias = [...diasContinua].sort();
    const n = Math.round((Date.parse(dias.at(-1)!) - Date.parse(dias[0]!)) / DIA);
    return new Date(finPrimerDia.getTime() + n * DIA);
  }

  private auditar(accion: string, p: Peticion, entidadId: string, anterior: unknown, nuevo: unknown) {
    return this.auditoria.registrar({ accion, actorId: p.actor.cuentaId, rol: 'programador', entidad: 'funcion', entidadId, anterior, nuevo, correlacionId: p.correlacionId });
  }
}

const candidata = (id: string, d: Pick<DatosFuncion, 'sedeId' | 'elencoId' | 'inicio' | 'fin' | 'continua'>, sede: SedeVista, obra: ObraVista): FuncionAgenda => ({
  id,
  sedeId: d.sedeId,
  elencoId: d.elencoId,
  inicio: d.inicio,
  fin: d.fin,
  continua: d.continua,
  sedeNombre: sede.nombre,
  montajeMin: sede.montajeMin,
  obraTitulo: obra.titulo,
  activa: true,
});

function validarFin(calculado: Date, pedido: Date | undefined): Date {
  const r = validarFinPedido(calculado, pedido);
  if (!r.ok) throw finMenor();
  return r.fin;
}
