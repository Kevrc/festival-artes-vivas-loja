import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/index.js';
import { enTransaccion, transaccionActual } from '../../../common/datos/transaccion';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuditoriaOperacion, EntradaAuditoria } from '../application/puertos';

const json = (v: unknown) => (v === undefined ? undefined : (v as Prisma.InputJsonValue));

/** Auditoría de solo inserción en `operacion.auditoria`, dentro de la transacción ambiente (FR-012). */
export class AuditoriaPrismaOperacion implements AuditoriaOperacion {
  constructor(private readonly db: PrismaService) {}

  async registrar(e: EntradaAuditoria): Promise<void> {
    await (transaccionActual() ?? this.db).auditoriaOperacion.create({
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

/**
 * Ejecuta `fn` una sola vez por evento: registra `evento_procesado.evento_id` en la misma
 * transacción que el efecto. Devuelve false si el evento ya se había procesado.
 */
export async function procesarUnaVezOperacion(
  db: PrismaService,
  evento: { id: string; tipo: string },
  fn: () => Promise<void>,
): Promise<boolean> {
  return enTransaccion(db, async (tx) => {
    const { count } = await tx.eventoProcesadoOperacion.createMany({
      data: [{ eventoId: evento.id, tipo: evento.tipo }],
      skipDuplicates: true,
    });
    if (count === 0) return false;
    await fn();
    return true;
  });
}
