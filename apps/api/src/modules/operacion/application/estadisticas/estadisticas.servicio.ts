import { ErrorConCodigo } from '../../../../common/http/problema-codigo.filter';
import { diaFestival } from '../../domain/agenda';
import { type Dimension, aCsv, agrupar, fila, realizada, variacion } from '../../domain/indicadores';
import { noEncontrado } from '../errores';
import type { AuditoriaOperacion, FiltroIndicadores, RelojOperacion, RepositorioEstadisticas, RepositorioOperacion } from '../puertos';

export interface Informe {
  edicionId: string;
  anio: number;
  generadoEn: string;
  actividades: number;
  elencos: number;
  obras: number;
  paises: number;
  asistenciaValidada: number;
  asistenciaEstimada: number;
  asistenciaTotal: number;
  ocupacionMedia: number | null;
  recaudacionCentavos: number;
  /** Diferencia porcentual frente a la edición anterior, por cifra; null si no hay con qué comparar. */
  variacion: Record<string, number> | null;
  anterior: { anio: number; fuente: 'informe' | 'cifras_historicas' } | null;
}

const CIFRAS = ['actividades', 'elencos', 'obras', 'paises', 'asistenciaValidada', 'asistenciaEstimada', 'asistenciaTotal', 'ocupacionMedia', 'recaudacionCentavos'] as const;

/**
 * Panel de estadísticas e informe de cierre (US5, FR-009, FR-010, research R7/R8). Los indicadores
 * se calculan al consultar sobre la proyección de Boletería (≤ 5 min de retraso, RNF-003); el
 * informe se congela al cerrar la edición.
 */
export class EstadisticasServicio {
  constructor(
    private readonly repo: RepositorioOperacion,
    private readonly estadisticas: RepositorioEstadisticas,
    private readonly auditoria: AuditoriaOperacion,
    private readonly reloj: RelojOperacion,
  ) {}

  async indicadores(edicionId: string, dimension: Dimension, filtro: FiltroIndicadores) {
    if (!(await this.repo.edicion(edicionId))) throw noEncontrado('La edición');
    const datos = await this.estadisticas.datos(edicionId, filtro);
    const { totales, filas } = agrupar(dimension, datos, this.reloj());
    const actualizado = await this.estadisticas.ultimaActualizacion(edicionId);
    return { dimension, totales, filas, actualizadoEn: (actualizado ?? this.reloj()).toISOString() };
  }

  /** US5-AS3: los mismos filtros que la consulta. */
  async csv(edicionId: string, dimension: Dimension, filtro: FiltroIndicadores): Promise<string> {
    return aCsv(await this.indicadores(edicionId, dimension, filtro));
  }

  /** US5-AS4: el informe congelado de una edición cerrada. */
  async informe(edicionId: string): Promise<Informe> {
    const ed = await this.repo.edicion(edicionId);
    if (!ed) throw noEncontrado('La edición');
    if (ed.estado !== 'cerrada') throw new ErrorConCodigo(409, 'edicion_abierta', 'El informe de cierre se genera cuando la edición se cierra, el día siguiente a su última función (RN-007).');
    const guardado = await this.estadisticas.informe(edicionId);
    if (guardado) return guardado.datos as unknown as Informe;
    return this.generar(edicionId, ed.anio);
  }

  /** Recalcula el informe de una edición cerrada (SC-004). */
  async regenerar(edicionId: string, actorId: string, correlacionId: string): Promise<Informe> {
    const ed = await this.repo.edicion(edicionId);
    if (!ed) throw noEncontrado('La edición');
    if (ed.estado !== 'cerrada') throw new ErrorConCodigo(409, 'edicion_abierta', 'Solo se puede regenerar el informe de una edición cerrada.');
    const informe = await this.generar(edicionId, ed.anio);
    await this.auditoria.registrar({ accion: 'informe.regenerado', actorId, entidad: 'edicion', entidadId: edicionId, correlacionId });
    return informe;
  }

  /**
   * Trabajo diario `operacion.cerrar-ediciones` (03:00 de Loja, research R8): cierra la edición
   * cuyo día siguiente a la última función ya llegó y congela su informe.
   */
  async cerrarEdiciones(correlacionId: string): Promise<string[]> {
    const hoy = diaFestival(this.reloj());
    const cerradas: string[] = [];
    for (const e of await this.estadisticas.edicionesPublicadas()) {
      const ultimoDia = e.ultimoFin ? diaFestival(e.ultimoFin) : e.fechaFin;
      if (hoy <= ultimoDia) continue;
      const cerrada = await this.repo.enTransaccion(async () => {
        if (!(await this.estadisticas.cerrarEdicion(e.id))) return false;
        await this.generar(e.id, e.anio);
        await this.auditoria.registrar({ accion: 'edicion.cerrada', actorId: null, entidad: 'edicion', entidadId: e.id, anterior: { estado: 'publicada' }, nuevo: { estado: 'cerrada', ultimoDia }, correlacionId });
        return true;
      });
      if (cerrada) cerradas.push(e.id);
    }
    return cerradas;
  }

  private async generar(edicionId: string, anio: number): Promise<Informe> {
    const ahora = this.reloj();
    const datos = await this.estadisticas.datos(edicionId, {});
    const hechas = datos.filter((f) => realizada(f, ahora));
    const t = fila('total', 'Total', datos, ahora);
    const base: Omit<Informe, 'variacion' | 'anterior'> = {
      edicionId,
      anio,
      generadoEn: ahora.toISOString(),
      actividades: hechas.length,
      elencos: new Set(hechas.map((f) => f.elencoId)).size,
      obras: new Set(hechas.map((f) => f.obraId)).size,
      paises: new Set(hechas.map((f) => f.pais)).size,
      asistenciaValidada: t.ingresosValidados,
      asistenciaEstimada: t.asistenciaEstimada,
      asistenciaTotal: t.asistenciaTotal,
      ocupacionMedia: t.ocupacion,
      recaudacionCentavos: t.recaudacionCentavos,
    };
    const { cifras, anterior } = await this.anterior(anio - 1);
    let cambios: Record<string, number> | null = null;
    if (cifras) {
      cambios = {};
      for (const k of CIFRAS) {
        const v = variacion(base[k], cifras[k] as number | null | undefined);
        if (v !== null) cambios[k] = v;
      }
    }
    const informe: Informe = { ...base, variacion: cambios, anterior };
    await this.estadisticas.guardarInforme(edicionId, ahora, informe as unknown as Record<string, unknown>);
    return informe;
  }

  /** La edición anterior: su informe si se cerró con el sistema; si no, las cifras históricas sembradas. */
  private async anterior(anio: number): Promise<{ cifras: Partial<Record<(typeof CIFRAS)[number], number | null>> | null; anterior: Informe['anterior'] }> {
    const informe = await this.estadisticas.informeDelAnio(anio);
    if (informe) return { cifras: informe.datos as Partial<Record<(typeof CIFRAS)[number], number>>, anterior: { anio, fuente: 'informe' } };
    const h = await this.estadisticas.cifrasHistoricas(anio);
    return h ? { cifras: h, anterior: { anio, fuente: 'cifras_historicas' } } : { cifras: null, anterior: null };
  }
}
