import { z } from 'zod';
import { sobre } from './sobre';

export const DisponibilidadCambiada = sobre(
  'DisponibilidadCambiada',
  z.object({
    funcionId: z.string().uuid(),
    lugaresRestantes: z.number().int().min(0),
    aforoHabilitado: z.number().int().positive(),
    calculadoEn: z.string().datetime({ offset: true }),
  }),
);
