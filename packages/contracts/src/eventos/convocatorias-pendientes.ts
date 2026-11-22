import { z } from 'zod';
import { Componente, ElencoDto, ObraDto } from './operacion';
import { sobre } from './sobre';

/**
 * @provisional — dueño: spec 003 (Convocatorias), US4.
 *
 * Propuesta de la spec 004 (contracts/eventos-operacion-identidad.md §5.2) para los eventos que
 * Convocatorias aún no publica. Siguen el estilo de los que ya define su rama
 * (`cuentaPostulanteId`, `numero`). Viven aquí, y no en `convocatorias.ts`, para no editar el
 * archivo de 003; se mueven allí cuando su responsable los acepte.
 */
const identificadores = {
  postulacionId: z.string().uuid(),
  convocatoriaId: z.string().uuid(),
  cuentaPostulanteId: z.string().uuid(),
  numero: z.string().min(1),
};

export const FichaTecnicaDto = z.object({
  /** Informativos: el cruce de agenda usa `sede.montaje_min` (spec 004, US1). */
  montajeMin: z.number().int().min(0).optional(),
  desmontajeMin: z.number().int().min(0).optional(),
  requerimientos: z.array(z.string()),
});

export const PostulacionSeleccionada = sobre(
  'PostulacionSeleccionada',
  z.object({
    ...identificadores,
    componente: Componente,
    obra: ObraDto.omit({ componente: true }).extend({ fichaTecnica: FichaTecnicaDto }),
    elenco: ElencoDto,
    /** Camino a Loja. */
    provincia: z.string().optional(),
  }),
);

export const SeleccionDesistida = sobre(
  'SeleccionDesistida',
  z.object({
    ...identificadores,
    obraId: z.string().uuid(),
    motivo: z.string().optional(),
  }),
);

export const ResultadoPublicado = sobre(
  'ResultadoPublicado',
  z.object({
    ...identificadores,
    resultado: z.enum(['seleccionada', 'lista_espera', 'no_seleccionada', 'no_admitida']),
  }),
);

/** Eventos provisionales de Convocatorias que consume Operación. */
export const EventoConvocatoriasOperacion = z.discriminatedUnion('tipo', [PostulacionSeleccionada, SeleccionDesistida]);
export type EventoConvocatoriasOperacion = z.infer<typeof EventoConvocatoriasOperacion>;
