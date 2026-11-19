import { z } from 'zod';

/** Sobre común de todo evento de dominio (contracts/eventos-consumidos.md). */
export const sobre = <T extends string, D extends z.ZodTypeAny>(tipo: T, datos: D) =>
  z.object({
    id: z.string().uuid(),
    tipo: z.literal(tipo),
    version: z.literal(1),
    ocurridoEn: z.string().datetime({ offset: true }),
    edicionId: z.string().uuid(),
    correlacionId: z.string().uuid(),
    datos,
  });
