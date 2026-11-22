import { PostulacionSeleccionada } from '@fiavl/contracts';
import type { z } from 'zod';
import type { AuditoriaOperacion, ManejadorEvento, RepositorioOperacion } from '../puertos';

type Evento = z.infer<typeof PostulacionSeleccionada>;
export type ProcesarUnaVez = (evento: { id: string; tipo: string }, fn: () => Promise<void>) => Promise<boolean>;

/**
 * US1-AS5, FR-007: una obra seleccionada en convocatoria queda disponible para programar con su
 * ficha técnica, sin recargar datos. Idempotente: por `evento.id` y por `obra.postulacion_id`.
 * Contrato provisional de 003 (contracts/eventos-operacion-identidad.md §5.2).
 */
export class AlRecibirPostulacionSeleccionada implements ManejadorEvento<Evento> {
  readonly tipo = 'PostulacionSeleccionada';
  readonly esquema = PostulacionSeleccionada;

  constructor(
    private readonly repo: RepositorioOperacion,
    private readonly auditoria: AuditoriaOperacion,
    private readonly procesarUnaVez: ProcesarUnaVez,
  ) {}

  async manejar(e: Evento): Promise<void> {
    await this.procesarUnaVez(e, async () => {
      if (!(await this.repo.edicion(e.edicionId))) throw new Error(`Edición ${e.edicionId} desconocida para PostulacionSeleccionada`);
      if (await this.repo.obra(e.datos.obra.id)) return;
      const { obra, elenco } = e.datos;
      const creada = await this.repo.crearObra(
        e.edicionId,
        {
          titulo: obra.titulo,
          sinopsis: obra.sinopsis,
          disciplina: obra.disciplina,
          componente: e.datos.componente,
          duracionMin: obra.duracionMin,
          edadMinima: obra.edadMinima,
          idioma: obra.idioma ?? null,
          imagenes: obra.imagenes,
          fichaArtistica: obra.fichaArtistica,
          // montajeMin/desmontajeMin son informativos: el cruce usa sede.montaje_min (spec 004, US1).
          fichaTecnica: { ...obra.fichaTecnica, ...(e.datos.provincia ? { provincia: e.datos.provincia } : {}) },
        },
        { id: elenco.id, nombre: elenco.nombre, pais: elenco.pais, ciudad: elenco.ciudad ?? null },
        'convocatoria',
        e.datos.postulacionId,
        obra.id,
      );
      await this.auditoria.registrar({
        accion: 'obra.recibida_convocatoria',
        actorId: null,
        entidad: 'obra',
        entidadId: creada.id,
        nuevo: { postulacionId: e.datos.postulacionId, numero: e.datos.numero },
        correlacionId: e.correlacionId,
      });
    });
  }
}
