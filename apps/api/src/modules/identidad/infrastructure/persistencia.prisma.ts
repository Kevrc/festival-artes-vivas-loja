import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/index.js';
import { enTransaccion, transaccionActual } from '../../../common/datos/transaccion';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuditoriaIdentidad, EntradaAuditoria } from '../application/puertos';

const json = (v: unknown) => (v === undefined ? undefined : (v as Prisma.InputJsonValue));

/** Auditoría de solo inserción en `identidad.auditoria` (FR-024). Nunca guarda secretos. */
export class AuditoriaPrismaIdentidad implements AuditoriaIdentidad {
  constructor(private readonly db: PrismaService) {}

  async registrar(e: EntradaAuditoria): Promise<void> {
    await (transaccionActual() ?? this.db).auditoriaIdentidad.create({
      data: {
        id: randomUUID(),
        accion: e.accion,
        actorId: e.actorId,
        rol: e.rol ?? null,
        entidad: e.entidad,
        entidadId: e.entidadId ?? null,
        anterior: json(e.anterior),
        nuevo: json(e.nuevo),
        correlacionId: e.correlacionId ?? null,
      },
    });
  }
}

/** Idempotencia de consumidores: `evento_procesado` en la misma transacción que el efecto. */
export async function procesarUnaVezIdentidad(
  db: PrismaService,
  evento: { id: string; tipo: string },
  fn: () => Promise<void>,
): Promise<boolean> {
  return enTransaccion(db, async (tx) => {
    const { count } = await tx.eventoProcesadoIdentidad.createMany({
      data: [{ eventoId: evento.id, tipo: evento.tipo }],
      skipDuplicates: true,
    });
    if (count === 0) return false;
    await fn();
    return true;
  });
}
