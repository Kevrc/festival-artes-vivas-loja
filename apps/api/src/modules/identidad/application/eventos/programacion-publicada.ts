import { ProgramacionPublicada } from '@fiavl/contracts';
import type { z } from 'zod';
import type { ManejadorEvento, RepositorioIdentidad } from '../puertos';

type Evento = z.infer<typeof ProgramacionPublicada>;
export type ProcesarUnaVez = (evento: { id: string; tipo: string }, fn: () => Promise<void>) => Promise<boolean>;

/**
 * Identidad guarda la edición vigente y su fecha de fin (`edicion_vigente`): da el `edicionId` del
 * sobre de sus eventos y, en US12, el vencimiento de las acreditaciones de estudiante (RN-012).
 */
export class AlRecibirProgramacionPublicada implements ManejadorEvento<Evento> {
  readonly tipo = 'ProgramacionPublicada';
  readonly esquema = ProgramacionPublicada;

  constructor(
    private readonly repo: RepositorioIdentidad,
    private readonly procesarUnaVez: ProcesarUnaVez,
  ) {}

  async manejar(e: Evento): Promise<void> {
    await this.procesarUnaVez(e, () => this.repo.guardarEdicionVigente(e.datos.edicion.id, e.datos.edicion.fechaFin));
  }
}
