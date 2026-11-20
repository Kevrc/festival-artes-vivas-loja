import { z } from 'zod';
import { sobre } from './sobre';

const identificadores = {
  postulacionId: z.string().uuid(),
  convocatoriaId: z.string().uuid(),
  cuentaPostulanteId: z.string().uuid(),
  numero: z.string().min(1),
};

export const PostulacionEnviada = sobre(
  'PostulacionEnviada',
  z.object({ ...identificadores, enviadaEn: z.string().datetime({ offset: true }) }),
);

export const SubsanacionSolicitada = sobre(
  'SubsanacionSolicitada',
  z.object({
    ...identificadores,
    detalle: z.string().trim().min(1),
    venceEn: z.string().datetime({ offset: true }),
  }),
);

export const EventoPublicadoConvocatorias = z.discriminatedUnion('tipo', [PostulacionEnviada, SubsanacionSolicitada]);
export type EventoPublicadoConvocatorias = z.infer<typeof EventoPublicadoConvocatorias>;
