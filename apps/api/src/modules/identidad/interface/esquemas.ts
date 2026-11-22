import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/** Utilidades de borde de la API de Identidad. */
export const correlacionDe = (cabecera: string | undefined) => (cabecera && z.string().uuid().safeParse(cabecera).success ? cabecera : randomUUID());
