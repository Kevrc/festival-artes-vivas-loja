import { z } from 'zod';

export const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato AAAA-MM-DD');
export const Uuid = z.string().uuid();
