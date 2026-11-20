import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from '../../generated/prisma/index.js';

/**
 * Transacción "ambiente": el repositorio y el publicador de eventos usan la misma sin pasarla a mano.
 * Así un cambio y su evento se confirman juntos o ninguno (ADR-0003, auditoría #1).
 */
const ambiente = new AsyncLocalStorage<Prisma.TransactionClient>();

export const transaccionActual = (): Prisma.TransactionClient | undefined => ambiente.getStore();

/** Ejecuta `fn` en la transacción en curso o abre una nueva. */
export function enTransaccion<T>(db: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const actual = ambiente.getStore();
  if (actual) return fn(actual);
  return db.$transaction((tx) => ambiente.run(tx, () => fn(tx)), { timeout: 15_000 });
}
