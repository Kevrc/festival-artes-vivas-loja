import { randomUUID } from 'node:crypto';
import type { ContextoIdentidad } from '@fiavl/contracts';
import { type FuncionAgenda, bloquesDe, calcularFin, detectarConflictos, validarFinPedido } from '../../domain/agenda';
import type { PublicoFuncion, TipoAccesoFuncion } from '../../domain/tipos';
import {
  aforoSuperaSede,
  conflictoAgenda,
  edicionCerrada,
  finMenor,
  fueraDeEdicion,
  funcionPublicada,
  noEncontrado,
  obraDesistida,
  versionObsoleta,
} from '../errores';
import {
  type AuditoriaOperacion,
  CruceEnBaseDeDatos,
  InterbloqueoEnBaseDeDatos,
  type DatosFuncion,
  type FuncionVista,
  type ObraVista,
  type RepositorioOperacion,
  type SedeVista,
} from '../puertos';

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
}

interface Peticion {
  actor: ContextoIdentidad;
  correlacionId: string;
}

const DIA = 24 * 60 * 60_000;
/** Reintentos ante un interbloqueo de la base; cada uno vuelve a comprobar los cruces. */
const REINTENTOS_INTERBLOQUEO = 3;
const VENTANA = DIA; // montaje < 24 h: basta mirar un día alrededor

/**
 * Crear, editar y eliminar funciones en borrador (US1, FR-001–FR-004, FR-013).
 * Dos capas contra cruces (ADR-0010): el dominio explica el conflicto; la base lo garantiza.
 */
export class FuncionesServicio {
  constructor(
    private readonly repo: RepositorioOperacion,
    private readonly auditoria: AuditoriaOperacion,
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
    return this.guardarSinCruces(id, datos, sede, obra, () =>
      this.repo.enTransaccion(async () => {
        const creada = await this.repo.crearFuncion(id, edicionId, datos, bloquesDe({ ...datos, montajeMin: sede.montajeMin }), p.actor.cuentaId);
        await this.auditar('funcion.crear', p, creada.id, null, creada);
        return creada;
      }),
    );
  }

  async editar(funcionId: string, version: number, cambios: EdicionFuncion, p: Peticion): Promise<FuncionVista> {
    const actual = await this.repo.funcion(funcionId);
    if (!actual) throw noEncontrado('La función');
    await this.exigirEdicionAbierta(actual.edicionId);
    if (actual.version !== version) throw versionObsoleta(actual.version);
    // shortcut: las funciones publicadas se editan en US2/US3 (FuncionActualizada, AforoCambiado, reprogramación).
    if (actual.estado !== 'borrador') throw funcionPublicada();

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
    return this.guardarSinCruces(funcionId, datos, sede, obra, () =>
      this.repo.enTransaccion(async () => {
        const nueva = await this.repo.actualizarFuncion(funcionId, version, datos, bloquesDe({ ...datos, montajeMin: sede.montajeMin }));
        if (!nueva) throw versionObsoleta((await this.repo.funcion(funcionId))?.version ?? null);
        await this.auditar('funcion.editar', p, funcionId, actual, nueva);
        return nueva;
      }),
    );
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
   * Guarda sin cruces (ADR-0010). En una transacción: bloqueo consultivo de la sede y del elenco
   * (ordena a los programadores que guardan a la vez), comprobación del dominio y escritura. La
   * restricción EXCLUDE sigue siendo la garantía final; si aun así la base rechaza o se interbloquea,
   * se reintenta con una espera breve y el reintento responde 409 con la función que ganó.
   */
  private async guardarSinCruces<T>(id: string, d: DatosFuncion, sede: SedeVista, obra: ObraVista, guardar: () => Promise<T>): Promise<T> {
    const candidata: FuncionAgenda = { id, ...d, sedeNombre: sede.nombre, montajeMin: sede.montajeMin, obraTitulo: obra.titulo, activa: true };
    for (let intento = 1; ; intento++) {
      try {
        return await this.repo.enTransaccion(async () => {
          await this.repo.bloquearAgenda([`sede:${d.sedeId}`, `elenco:${d.elencoId}`]);
          const conflictos = await this.conflictos(candidata);
          if (conflictos.length > 0) throw conflictoAgenda(conflictos);
          return guardar();
        });
      } catch (e) {
        const reintentable = e instanceof InterbloqueoEnBaseDeDatos || e instanceof CruceEnBaseDeDatos;
        if (!reintentable) throw e;
        if (intento < REINTENTOS_INTERBLOQUEO) {
          await esperar(20 + Math.random() * 80 * intento);
          continue;
        }
        throw conflictoAgenda(await this.conflictos(candidata));
      }
    }
  }

  private async conflictos(candidata: FuncionAgenda) {
    const vecinas = await this.repo.agendaVecina({
      sedeId: candidata.sedeId,
      elencoId: candidata.elencoId,
      desde: new Date(candidata.inicio.getTime() - VENTANA),
      hasta: new Date(candidata.fin.getTime() + VENTANA),
    });
    return detectarConflictos(candidata, vecinas);
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
    const ultimo = [...diasContinua].sort().at(-1)!;
    const primero = [...diasContinua].sort()[0]!;
    const dias = Math.round((Date.parse(ultimo) - Date.parse(primero)) / DIA);
    return new Date(finPrimerDia.getTime() + dias * DIA);
  }

  private auditar(accion: string, p: Peticion, entidadId: string, anterior: unknown, nuevo: unknown) {
    return this.auditoria.registrar({
      accion,
      actorId: p.actor.cuentaId,
      rol: 'programador',
      entidad: 'funcion',
      entidadId,
      anterior,
      nuevo,
      correlacionId: p.correlacionId,
    });
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function validarFin(calculado: Date, pedido: Date | undefined): Date {
  const r = validarFinPedido(calculado, pedido);
  if (!r.ok) throw finMenor();
  return r.fin;
}
