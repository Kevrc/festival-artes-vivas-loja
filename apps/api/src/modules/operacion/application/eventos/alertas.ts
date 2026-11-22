import { AforoExcedido, ConflictoDeIngreso, SeleccionDesistida } from '@fiavl/contracts';
import type { z } from 'zod';
import type { AuditoriaOperacion, ManejadorEvento, RepositorioIncidencias, RepositorioOperacion } from '../puertos';
import type { ProcesarUnaVez } from './postulacion-seleccionada';

/**
 * Incidencias automáticas (US4-AS3) y desistimientos de Convocatorias (FR-007). Una sola incidencia
 * por evento de origen (`incidencia.evento_origen_id` único) además de `evento_procesado`.
 */
type Deps = { repo: RepositorioOperacion; incidencias: RepositorioIncidencias; auditoria: AuditoriaOperacion; unaVez: ProcesarUnaVez };

type EvAforo = z.infer<typeof AforoExcedido>;
export class AlRecibirAforoExcedido implements ManejadorEvento<EvAforo> {
  readonly tipo = 'AforoExcedido';
  readonly esquema = AforoExcedido;
  constructor(private readonly d: Deps) {}
  async manejar(e: EvAforo): Promise<void> {
    await this.d.unaVez(e, async () => {
      const f = await this.d.repo.funcion(e.datos.funcionId);
      await this.d.incidencias.crearIncidencia({
        id: e.id, eventoOrigenId: e.id, edicionId: f?.edicionId ?? e.edicionId, sedeId: e.datos.sedeId, funcionId: f ? f.id : null,
        tipo: 'aforo_superado', afectaPublico: true, origen: 'automatica', autorId: null, ocurridaEn: new Date(e.ocurridoEn),
        descripcion: `Boletería avisa ${e.datos.entradasActivas} entradas activas para un aforo de ${e.datos.aforoHabilitado} (exceso de ${e.datos.exceso}).`,
      });
    });
  }
}

type EvConflicto = z.infer<typeof ConflictoDeIngreso>;
export class AlRecibirConflictoDeIngreso implements ManejadorEvento<EvConflicto> {
  readonly tipo = 'ConflictoDeIngreso';
  readonly esquema = ConflictoDeIngreso;
  constructor(private readonly d: Deps) {}
  async manejar(e: EvConflicto): Promise<void> {
    await this.d.unaVez(e, async () => {
      const f = await this.d.repo.funcion(e.datos.funcionId);
      await this.d.incidencias.crearIncidencia({
        id: e.id, eventoOrigenId: e.id, edicionId: f?.edicionId ?? e.edicionId, sedeId: e.datos.sedeId, funcionId: f ? f.id : null,
        tipo: 'conflicto_ingreso', afectaPublico: false, origen: 'automatica', autorId: null, ocurridaEn: new Date(e.datos.detectadoEn),
        descripcion: 'Una misma entrada se validó en dos dispositivos sin conexión; revisa el ingreso en puerta.',
      });
    });
  }
}

type EvDesistida = z.infer<typeof SeleccionDesistida>;
/**
 * FR-007: la obra pasa a `desistida` (no se puede programar más) y sus funciones quedan intactas;
 * por cada función no cancelada se abre una incidencia de desistimiento para que Programación decida.
 */
export class AlRecibirSeleccionDesistida implements ManejadorEvento<EvDesistida> {
  readonly tipo = 'SeleccionDesistida';
  readonly esquema = SeleccionDesistida;
  constructor(private readonly d: Deps) {}
  async manejar(e: EvDesistida): Promise<void> {
    await this.d.unaVez(e, async () => {
      const obra = await this.d.repo.obra(e.datos.obraId);
      if (!obra) return;
      if (!(await this.d.incidencias.marcarObraDesistida(obra.id))) return;
      await this.d.auditoria.registrar({ accion: 'obra.desistida', actorId: null, entidad: 'obra', entidadId: obra.id, anterior: { estado: obra.estado }, nuevo: { estado: 'desistida', motivo: e.datos.motivo ?? null }, correlacionId: e.correlacionId });
      const funciones = (await this.d.repo.funcionesDeObra(obra.id)).filter((f) => f.estado !== 'cancelada');
      for (const [i, f] of funciones.entries()) {
        await this.d.incidencias.crearIncidencia({
          id: crypto.randomUUID(), eventoOrigenId: i === 0 ? e.id : null, edicionId: f.edicionId, sedeId: f.sedeId, funcionId: f.id,
          tipo: 'desistimiento', afectaPublico: f.estado !== 'borrador', origen: 'automatica', autorId: null, ocurridaEn: new Date(e.ocurridoEn),
          descripcion: `El elenco de «${obra.titulo}» desistió${e.datos.motivo ? `: ${e.datos.motivo}` : ''}. La función sigue en la agenda hasta que Programación decida.`,
        });
      }
    });
  }
}
