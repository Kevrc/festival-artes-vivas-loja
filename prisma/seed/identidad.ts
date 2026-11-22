import type { PrismaClient } from '../../apps/api/src/generated/prisma/index.js';

/**
 * Semilla del esquema `identidad` (spec 004). Por ahora, la política de privacidad v1 que exige el
 * registro (US7-AS5). Las cuentas de prueba del personal llegan con US9 (T086). Idempotente.
 */
export const POLITICA_VIGENTE = { version: 1, url: '/privacidad', vigenteDesde: new Date('2026-01-01T00:00:00-05:00') };

export async function seedIdentidad(db: PrismaClient): Promise<void> {
  await db.documentoLegal.upsert({
    where: { documento_version: { documento: 'politica_privacidad', version: POLITICA_VIGENTE.version } },
    create: { documento: 'politica_privacidad', ...POLITICA_VIGENTE },
    update: {},
  });
}
