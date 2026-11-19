import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** Valida una entrada externa en el borde (constitución VI). */
export function validar<T extends z.ZodTypeAny>(esquema: T, valor: unknown): z.infer<T> {
  const r = esquema.safeParse(valor);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join('.') || 'valor'}: ${i.message}`).join('; '));
  return r.data;
}
