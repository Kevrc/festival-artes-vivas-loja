import type { Logger } from '@nestjs/common';
import { colaDe } from '@fiavl/contracts';
import type { z } from 'zod';
import type { ColaEventos } from './datos.module';

export interface Manejador {
  readonly tipo: string;
  readonly esquema: z.ZodType<{ id: string; tipo: string }>;
  manejar(evento: { id: string; tipo: string }): Promise<void>;
}

/**
 * Suscribe cada manejador a la cola `<modulo>.<tipo>` con reintentos y cola de errores (ADR-0003).
 * Un evento que no pasa su contrato va a la cola de errores sin reintentar. La idempotencia la
 * garantiza cada manejador (tabla `evento_procesado` de su esquema).
 */
export async function consumirEventos(
  cola: ColaEventos,
  modulo: string,
  manejadores: readonly Manejador[],
  log: Logger,
): Promise<void> {
  if (manejadores.length === 0) return;
  const boss = await cola.obtener();
  const errores = `${modulo}.errores`;
  await boss.createQueue(errores);
  for (const m of manejadores) {
    const nombre = colaDe(modulo, m.tipo);
    await boss.createQueue(nombre, { name: nombre, retryLimit: 5, retryBackoff: true, deadLetter: errores });
    await boss.work<Record<string, unknown>>(nombre, { batchSize: 10 }, async (trabajos) => {
      for (const t of trabajos) {
        const r = m.esquema.safeParse(t.data);
        if (!r.success) {
          log.error({ cola: nombre, eventoId: t.data.id, problemas: r.error.issues.length }, 'evento que no cumple el contrato');
          await boss.send(errores, t.data);
          continue;
        }
        await m.manejar(r.data);
        log.log({ correlacionId: t.data.correlacionId, tipo: m.tipo, eventoId: r.data.id }, `evento ${modulo} procesado`);
      }
    });
  }
  log.log(`Escuchando ${manejadores.length} colas de ${modulo}`);
}
