import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { idDe } from './ayuda';

/** Ayudas de las E2E de Operación (spec 004). */
export const API = process.env.API_URL ?? 'http://localhost:4000';
export const EDICION_2026 = idDe('edicion-2026');

/** Imagen mínima en línea: la publicación exige al menos una imagen por obra (research R4). */
export const IMAGEN_PRUEBA = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><rect width="4" height="3" fill="#a3201c"/></svg>')}`;

/**
 * La propagación a la cartelera exige pg-boss y el worker. El job de CI corre la API con
 * NODE_ENV=test (sin cola ni worker): allí lo cubren las pruebas de integración.
 */
export const hayWorker = () => process.env.NODE_ENV !== 'test';

export interface DbE2e {
  $executeRawUnsafe(sql: string, ...valores: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
}

/** Cliente Prisma solo para preparar y limpiar datos de prueba. */
export function abrirDb(): DbE2e {
  const req = createRequire(import.meta.url);
  const raiz = resolve(import.meta.dirname, '../../..');
  const env = resolve(raiz, '.env');
  const url =
    process.env.DATABASE_URL ??
    (existsSync(env) ? readFileSync(env, 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='))?.slice(13).trim() : undefined) ??
    'postgresql://fiavl:fiavl@localhost:5433/fiavl';
  const { PrismaClient } = req(resolve(raiz, 'apps/api/src/generated/prisma/index.js')) as { PrismaClient: new (o: unknown) => DbE2e };
  return new PrismaClient({ datasources: { db: { url } } });
}
